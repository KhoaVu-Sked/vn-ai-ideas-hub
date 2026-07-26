import { deleteRequest, setRequestState, jsonError } from "@/lib/db";
import { requireUser } from "@/lib/guard";

// DELETE /api/ideas/:id/requests/:reqId → remove (author, or lead/admin)
export async function DELETE(_request, { params }) {
  try {
    const user = await requireUser();
    const { reqId } = await params;
    await deleteRequest(reqId, user.uid, user.role === "admin");
    return Response.json({ ok: true });
  } catch (e) {
    return jsonError(e, "Could not remove the request.");
  }
}

// PATCH /api/ideas/:id/requests/:reqId { state } → triage (lead/admin only)
export async function PATCH(request, { params }) {
  try {
    const user = await requireUser();
    const { reqId } = await params;
    const { state } = await request.json();
    const updated = await setRequestState(reqId, state, user.uid, user.role === "admin");
    return Response.json({ request: updated });
  } catch (e) {
    return jsonError(e, "Could not update the request.");
  }
}
