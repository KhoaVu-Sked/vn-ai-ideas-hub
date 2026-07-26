import { updateTask, deleteTask, jsonError } from "@/lib/db";
import { requireAdmin } from "@/lib/guard";

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
