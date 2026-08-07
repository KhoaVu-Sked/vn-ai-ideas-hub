import { deleteRequest, setRequestState, updateRequestBody } from "@/features/ideas/queries";
import { jsonError } from "@/lib/sql";
import { requireUser } from "@/features/auth/guard";

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

// PATCH /api/ideas/:id/requests/:reqId
//   { state } → triage (lead/admin only)
//   { body }  → reword your own text; this resets the state to 'open'
export async function PATCH(request, { params }) {
  try {
    const user = await requireUser();
    const { reqId } = await params;
    const { state, body } = await request.json();
    const isAdmin = user.role === "admin";
    const updated = body !== undefined
      ? await updateRequestBody(reqId, body, user.uid, isAdmin)
      : await setRequestState(reqId, state, user.uid, isAdmin);
    return Response.json({ request: updated });
  } catch (e) {
    return jsonError(e, "Could not update the request.");
  }
}
