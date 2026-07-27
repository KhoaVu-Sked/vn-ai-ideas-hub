import { get } from "@vercel/blob";
import { getAttachment, jsonError } from "@/lib/db";
import { requireUser } from "@/lib/guard";

// GET /api/ideas/:id/attachments/:attId/download → stream a private blob to
// signed-in users (the raw blob URL isn't public).
export async function GET(_request, { params }) {
  try {
    await requireUser();
    const { attId } = await params;
    const att = await getAttachment(attId);
    if (!att) return Response.json({ error: "File not found." }, { status: 404 });

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
