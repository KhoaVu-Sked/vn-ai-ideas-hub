import { getIdea, updateContent, isProjectLead, jsonError } from "@/lib/db";
import { requireUser } from "@/lib/guard";

// GET /api/ideas/:id → full detail for the /idea/[id] page
export async function GET(_request, { params }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const data = await getIdea(id, user.uid);
    data.meId = user.uid;
    data.isAdmin = user.role === "admin";
    // Whether the viewer may edit content / change status.
    data.canEdit = data.isAdmin || data.myRole === "Project Lead";
    return Response.json(data);
  } catch (e) {
    return jsonError(e, "Could not load this idea.");
  }
}

// PATCH /api/ideas/:id { context, pain_points, expected_benefit, target_date }
// → edit core content (Project Lead or admin only)
export async function PATCH(request, { params }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const allowed = user.role === "admin" || (await isProjectLead(id, user.uid));
    if (!allowed) return Response.json({ error: "Only the project lead can edit this idea." }, { status: 403 });
    const body = await request.json();
    await updateContent(id, body);
    return Response.json({ ok: true });
  } catch (e) {
    return jsonError(e, "Could not update the idea.");
  }
}
