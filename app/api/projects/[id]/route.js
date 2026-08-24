import { after } from "next/server";
import { getProject, isProjectLead, updateStatus } from "@/features/ideas/queries";
import { jsonError } from "@/lib/sql";
import { requireUser } from "@/features/auth/guard";
import { ideaEvent } from "@/features/notifications/notify";
import { publishIdea, publishBoard } from "@/features/realtime/publish";

// GET /api/projects/:id → one project's full detail
// (fetched only when a card is clicked; the board list never includes this)
export async function GET(_request, { params }) {
  try {
    await requireUser();
    const { id } = await params;
    return Response.json(await getProject(id));
  } catch (e) {
    return jsonError(e, "Could not load this project.");
  }
}

// PATCH /api/projects/:id { status } → board-level change
// (the frontend follows this with a LIST refetch only)
export async function PATCH(request, { params }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const canEdit = user.role === "admin" || (await isProjectLead(id, user.uid));
    if (!canEdit) return Response.json({ error: "Only the project lead can change status." }, { status: 403 });
    const { status } = await request.json();
    const project = await updateStatus(id, status); // validates the status value
    const base = new URL(request.url).origin;
    const who = user.name || user.username;
    after(() => ideaEvent(id, {
      actorId: user.uid, actor: who, kind: "status",
      detail: { from: project.previousStatus, to: project.status }, base,
      auditAction: `changed status of "${project.name}" from ${project.previousStatus} to ${project.status}`,
    }));
    // After the write, never before: a ping that outruns the commit makes
    // every other client refetch the old row and see nothing change.
    after(() => {
      publishIdea(id, "status");
      publishBoard("status");
    });
    return Response.json({ project });
  } catch (e) {
    return jsonError(e, "Could not update the status.");
  }
}
