import { after } from "next/server";
import { deleteIdeaTask, moveIdeaTask, updateIdeaTask } from "@/features/ideas/queries";
import { jsonError } from "@/lib/sql";
import { requireUser } from "@/features/auth/guard";
import { ideaEvent } from "@/features/notifications/notify";

// PATCH /api/ideas/:id/tasks/:taskId
//   { state } → move it to another board column
//   anything else → edit its fields
export async function PATCH(request, { params }) {
  try {
    const user = await requireUser();
    const { id, taskId } = await params;
    const patch = await request.json();
    const isAdmin = user.role === "admin";
    const moving = patch.state !== undefined;
    const task = moving
      ? await moveIdeaTask(taskId, patch.state, user.uid, isAdmin)
      : await updateIdeaTask(taskId, user.uid, isAdmin, patch);

    if (moving) {
      const base = new URL(request.url).origin;
      const who = user.name || user.username;
      after(() => ideaEvent(id, {
        actorId: user.uid, actor: who, kind: "request",
        body: `${task.number} ${task.title} → ${task.state.replace(/_/g, " ")}`, base,
        auditAction: `moved task ${task.number} to ${task.state.replace(/_/g, " ")}`,
      }));
    }
    return Response.json({ task });
  } catch (e) {
    return jsonError(e, "Could not update the task.");
  }
}

// DELETE /api/ideas/:id/tasks/:taskId → author, or lead/admin
export async function DELETE(_request, { params }) {
  try {
    const user = await requireUser();
    const { taskId } = await params;
    await deleteIdeaTask(taskId, user.uid, user.role === "admin");
    return Response.json({ ok: true });
  } catch (e) {
    return jsonError(e, "Could not remove the task.");
  }
}
