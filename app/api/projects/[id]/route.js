import { getProject, updateStatus, isProjectLead, jsonError } from "@/lib/db";
import { requireUser } from "@/lib/guard";

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
    return Response.json({ project });
  } catch (e) {
    return jsonError(e, "Could not update the status.");
  }
}
