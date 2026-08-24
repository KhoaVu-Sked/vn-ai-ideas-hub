import { deleteComment, updateComment } from "@/features/ideas/queries";
import { jsonError } from "@/lib/sql";
import { requireUser } from "@/features/auth/guard";
import { publishIdea } from "@/features/realtime/publish";

// PATCH /api/ideas/:id/comments/:commentId { body } → reword your own
export async function PATCH(request, { params }) {
  try {
    const user = await requireUser();
    const { id, commentId } = await params;
    const { body } = await request.json();
    const comment = await updateComment(commentId, user.uid, user.role === "admin", body);
    // After the write. publish.js defers the send itself, so this must not be
    // wrapped in after() — nesting would drop the callback.
    publishIdea(id, "comment");
    return Response.json({ comment });
  } catch (e) {
    return jsonError(e, "Could not update the comment.");
  }
}

// DELETE /api/ideas/:id/comments/:commentId → author, or lead/admin
export async function DELETE(_request, { params }) {
  try {
    const user = await requireUser();
    const { id, commentId } = await params;
    await deleteComment(commentId, user.uid, user.role === "admin");
    // publish.js defers this itself, so it lands after the commit —
    // do not wrap it in after() here or the callback is dropped.
    publishIdea(id, "comment");
    return Response.json({ ok: true });
  } catch (e) {
    return jsonError(e, "Could not remove the comment.");
  }
}
