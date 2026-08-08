import { after } from "next/server";
import { addComment, listTaskComments } from "@/features/ideas/queries";
import { jsonError } from "@/lib/sql";
import { requireUser } from "@/features/auth/guard";
import { ideaEvent } from "@/features/notifications/notify";

// GET /api/ideas/:id/tasks/:taskId/comments → the thread on one task
export async function GET(_request, { params }) {
  try {
    const user = await requireUser();
    const { taskId } = await params;
    return Response.json({ comments: await listTaskComments(taskId, user.uid) });
  } catch (e) {
    return jsonError(e, "Could not load the comments.");
  }
}

// POST /api/ideas/:id/tasks/:taskId/comments { body }
export async function POST(request, { params }) {
  try {
    const user = await requireUser();
    const { id, taskId } = await params;
    const { body } = await request.json();
    const comment = await addComment(id, user.uid, body, taskId);
    const base = new URL(request.url).origin;
    const who = user.name || user.username;
    after(() => ideaEvent(id, {
      actorId: user.uid, actor: who, kind: "request", body: comment.body, base,
      auditAction: "commented on a task",
    }));
    return Response.json({ comment }, { status: 201 });
  } catch (e) {
    return jsonError(e, "Could not post the comment.");
  }
}
