import { requestIdeaDeletion, clearDeleteRequest, isProjectLead, jsonError } from "@/lib/db";
import { requireUser } from "@/lib/guard";

// POST /api/ideas/:id/delete-request { reason } → project lead asks admin to delete
export async function POST(request, { params }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const isLead = await isProjectLead(id, user.uid);
    if (!isLead && user.role !== "admin") {
      return Response.json({ error: "Only the project lead can request deletion." }, { status: 403 });
    }
    const { reason } = await request.json();
    await requestIdeaDeletion(id, user.uid, reason);
    return Response.json({ ok: true }, { status: 201 });
  } catch (e) {
    return jsonError(e, "Could not send the request.");
  }
}

// DELETE /api/ideas/:id/delete-request → admin dismisses the request
export async function DELETE(_request, { params }) {
  try {
    const user = await requireUser();
    if (user.role !== "admin") return Response.json({ error: "Admins only." }, { status: 403 });
    const { id } = await params;
    await clearDeleteRequest(id);
    return Response.json({ ok: true });
  } catch (e) {
    return jsonError(e, "Could not update the request.");
  }
}
