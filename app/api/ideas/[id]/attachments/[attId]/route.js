import { del } from "@vercel/blob";
import { deleteAttachment } from "@/features/ideas/queries";
import { jsonError } from "@/lib/sql";
import { requireUser } from "@/features/auth/guard";
import { publishIdea } from "@/features/realtime/publish";

// DELETE /api/ideas/:id/attachments/:attId → remove (uploader, or lead/admin)
export async function DELETE(_request, { params }) {
  try {
    const user = await requireUser();
    const { id, attId } = await params;
    publishIdea(id, "attachment");
    const { url } = await deleteAttachment(attId, user.uid, user.role === "admin");
    // Best-effort blob cleanup; the row is already gone.
    if (url && (process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN)) { try { await del(url); } catch { /* ignore */ } }
    return Response.json({ ok: true });
  } catch (e) {
    return jsonError(e, "Could not remove the file.");
  }
}
