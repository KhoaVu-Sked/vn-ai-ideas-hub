import { setMemberRole, removeMember, jsonError } from "@/lib/db";
import { requireAdmin } from "@/lib/guard";

// PATCH /api/ideas/:id/members/:accountId { role } → change a member's role.
// Admin only. Assigning the lead role transfers it (old lead → Observer).
export async function PATCH(request, { params }) {
  try {
    await requireAdmin();
    const { id, accountId } = await params;
    const { role } = await request.json();
    return Response.json(await setMemberRole(id, accountId, role));
  } catch (e) {
    return jsonError(e, "Could not update the role.");
  }
}

// DELETE /api/ideas/:id/members/:accountId → remove someone from the team (admin)
export async function DELETE(_request, { params }) {
  try {
    await requireAdmin();
    const { id, accountId } = await params;
    await removeMember(id, accountId);
    return Response.json({ ok: true });
  } catch (e) {
    return jsonError(e, "Could not remove the member.");
  }
}
