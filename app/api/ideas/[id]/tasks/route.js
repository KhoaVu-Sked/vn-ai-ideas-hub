import { after } from "next/server";
import { createIdeaTask } from "@/features/ideas/queries";
import { jsonError } from "@/lib/sql";
import { requireUser } from "@/features/auth/guard";
import { ideaEvent } from "@/features/notifications/notify";

// POST /api/ideas/:id/tasks { title, detail, start_date, due_date, assignee_id, comment }
// Every new task starts in Pending approval — the lead decides what's accepted.
export async function POST(request, { params }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = await request.json();
    const task = await createIdeaTask(id, user.uid, body);
    const base = new URL(request.url).origin;
    const who = user.name || user.username;
    after(() => ideaEvent(id, {
      actorId: user.uid, actor: who, kind: "request", body: `${task.number} ${task.title}`, base,
      auditAction: `added task ${task.number}`,
    }));
    return Response.json({ task }, { status: 201 });
  } catch (e) {
    return jsonError(e, "Could not add the task.");
  }
}
