import { createTask, listTasks } from "@/features/tasks/queries";
import { jsonError } from "@/lib/sql";
import { requireAdmin } from "@/features/auth/guard";

// GET /api/tasks → admin to-do list
export async function GET() {
  try {
    await requireAdmin();
    return Response.json({ tasks: await listTasks() });
  } catch (e) {
    return jsonError(e, "Could not load tasks.");
  }
}

// POST /api/tasks { title } → add a task
export async function POST(request) {
  try {
    const admin = await requireAdmin();
    const { title } = await request.json();
    if (!title?.trim()) return Response.json({ error: "Task title is required." }, { status: 400 });
    const task = await createTask(title, admin.uid);
    return Response.json({ task }, { status: 201 });
  } catch (e) {
    return jsonError(e, "Could not add the task.");
  }
}
