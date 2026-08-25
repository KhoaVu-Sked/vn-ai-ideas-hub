import { put } from "@vercel/blob";
import { addAttachment , assertNotMerged } from "@/features/ideas/queries";
import { jsonError } from "@/lib/sql";
import { requireUser } from "@/features/auth/guard";
import { validateUpload } from "@/lib/upload";
import { publishIdea } from "@/features/realtime/publish";

// POST /api/ideas/:id/attachments
//   multipart, field "file" (+ optional "label")  → upload to Vercel Blob
//   JSON { kind: "link", label, url }             → just a link, nothing stored
//
// Both land in the same table, so a link and a file carry the same permissions
// and appear in the same Documentation list.
export async function POST(request, { params }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    await assertNotMerged(id);

    if ((request.headers.get("content-type") || "").includes("application/json")) {
      const { kind, label, url } = await request.json();
      if (kind !== "link") return Response.json({ error: "Expected a link." }, { status: 400 });
      const attachment = await addAttachment(id, user.uid, { kind: "link", label, url });
      publishIdea(id, "attachment");
      return Response.json({ attachment }, { status: 201 });
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") return Response.json({ error: "No file provided." }, { status: 400 });
    const invalid = validateUpload({ name: file.name, type: file.type, size: file.size });
    if (invalid) return Response.json({ error: invalid }, { status: 400 });
    // OIDC-connected stores expose BLOB_STORE_ID (no static token); the SDK
    // authenticates via OIDC. A static BLOB_READ_WRITE_TOKEN also works (local).
    if (!process.env.BLOB_STORE_ID && !process.env.BLOB_READ_WRITE_TOKEN) {
      return Response.json({ error: "File uploads aren't configured — connect a Vercel Blob store to this project." }, { status: 400 });
    }

    const blob = await put(`ideas/${id}/${file.name}`, file, { access: "private", addRandomSuffix: true });
    const attachment = await addAttachment(id, user.uid, {
      kind: "file", label: form.get("label") || null,
      filename: file.name, url: blob.url, size: file.size, content_type: file.type,
    });
    // publish.js defers this itself, so it lands after the commit —
    // do not wrap it in after() here or the callback is dropped.
    publishIdea(id, "attachment");
    return Response.json({ attachment }, { status: 201 });
  } catch (e) {
    return jsonError(e, "Could not upload the file.");
  }
}
