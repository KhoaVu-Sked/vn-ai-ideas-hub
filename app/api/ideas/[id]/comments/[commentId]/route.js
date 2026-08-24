import { deleteComment, updateComment } from "@/features/ideas/queries";
import { jsonError } from "@/lib/sql";
import { requireUser } from "@/features/auth/guard";
import { publishIdea } from "@/features/realtime/publish";

// PATCH /api/ideas/:id/comments/:commentId { body } → reword your own
export async function PATCH(request, { params }) {
  try {
    const user = await requireUser();
    const { id, commentId } = await params;
    publishIdea(id, "comment");
    const { body } = await request.json();
    return Response.json({ comment: await updateComment(commentId, user.uid, user.role === "admin", body) });
  } catch (e) {
    return jsonError(e, "Could not update the comment.");
  }
}

// DELETE /api/ideas/:id/comments/:commentId → author, or lead/admin
export async function DELETE(_request, { params }) {
  try {
    const user = await requireUser();
    const { id, commentId } = await params;
    publishIdea(id, "comment");
    await deleteComment(commentId, user.uid, user.role === "admin");
    return Response.json({ ok: true });
  } catch (e) {
    return jsonError(e, "Could not remove the comment.");
  }
}
