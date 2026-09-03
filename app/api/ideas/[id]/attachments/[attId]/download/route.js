import { get } from "@vercel/blob";
import { getAttachment } from "@/features/ideas/queries";
import { jsonError } from "@/lib/sql";
import { requireUser } from "@/features/auth/guard";

// GET /api/ideas/:id/attachments/:attId/download → stream a private blob to
// signed-in users (the raw blob URL isn't public).
export async function GET(_request, { params }) {
  try {
    await requireUser();
    const { attId } = await params;
    const att = await getAttachment(attId);
    if (!att) return Response.json({ error: "File not found." }, { status: 404 });
    // A link has no blob behind it. Handing an external URL to the blob client
    // fails in a way that reads like a missing file rather than a wrong request.
    if (att.kind === "link") {
      return Response.json({ error: "That's a link, not a file — open it directly." }, { status: 400 });
    }

    const result = await get(att.url, { access: "private" });
    if (!result || !result.stream) return Response.json({ error: "File not found." }, { status: 404 });

    const safeName = (att.filename || "file").replace(/["\\\r\n]/g, "");
    return new Response(result.stream, {
      headers: {
        "Content-Type": att.content_type || result.headers?.get?.("content-type") || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${safeName}"`,
      },
    });
  } catch (e) {
    return jsonError(e, "Could not download the file.");
  }
}
