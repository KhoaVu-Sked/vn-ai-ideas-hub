import { deleteTask, updateTask } from "@/features/tasks/queries";
import { jsonError } from "@/lib/sql";
import { requireAdmin } from "@/features/auth/guard";

// PATCH /api/tasks/:id { title?, done? } → edit or check off a task
export async function PATCH(request, { params }) {
  try {
    await requireAdmin();
    const { id } = await params;
    const { title, done } = await request.json();
    const task = await updateTask(id, { title, done });
    return Response.json({ task });
  } catch (e) {
    return jsonError(e, "Could not update the task.");
  }
}

// DELETE /api/tasks/:id → remove a task
export async function DELETE(_request, { params }) {
  try {
    await requireAdmin();
    const { id } = await params;
    await deleteTask(id);
    return Response.json({ ok: true });
  } catch (e) {
    return jsonError(e, "Could not delete the task.");
  }
}
