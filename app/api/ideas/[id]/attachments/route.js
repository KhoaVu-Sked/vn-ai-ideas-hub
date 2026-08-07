import { put } from "@vercel/blob";
import { addAttachment } from "@/features/ideas/queries";
import { jsonError } from "@/lib/sql";
import { requireUser } from "@/features/auth/guard";
import { validateUpload } from "@/lib/upload";

// POST /api/ideas/:id/attachments (multipart, field "file") → upload to Vercel Blob
export async function POST(request, { params }) {
  try {
    const user = await requireUser();
    const { id } = await params;
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
      filename: file.name, url: blob.url, size: file.size, content_type: file.type,
    });
    return Response.json({ attachment }, { status: 201 });
  } catch (e) {
    return jsonError(e, "Could not upload the file.");
  }
}
