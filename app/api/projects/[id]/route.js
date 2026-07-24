import { getProject, updateStatus, jsonError } from "@/lib/db";

// GET /api/projects/:id → one project's full detail
// (fetched only when a card is clicked; the board list never includes this)
export async function GET(_request, { params }) {
  try {
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
    const { id } = await params;
    const { status } = await request.json();
    const allowed = ["Not started", "In progress", "On Hold", "Done"];
    if (!allowed.includes(status)) {
      return Response.json({ error: `Status must be one of: ${allowed.join(", ")}` }, { status: 400 });
    }
    const project = await updateStatus(id, status);
    return Response.json({ project });
  } catch (e) {
    return jsonError(e, "Could not update the status.");
  }
}
