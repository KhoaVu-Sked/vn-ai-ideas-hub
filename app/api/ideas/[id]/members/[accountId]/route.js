import { after } from "next/server";
import { removeMember, setMemberRoles } from "@/features/ideas/queries";
import { jsonError } from "@/lib/sql";
import { requireAdmin } from "@/features/auth/guard";
import { publishIdea, publishBoard } from "@/features/realtime/publish";

// PATCH /api/ideas/:id/members/:accountId { roles: [...] } → set a member's
// roles. Admin only. Granting the lead transfers it from whoever held it.
export async function PATCH(request, { params }) {
  try {
    await requireAdmin();
    const { id, accountId } = await params;
    const { roles, role } = await request.json();
    const result = await setMemberRoles(id, accountId, roles ?? role);
    // After the write. publish.js defers the send itself, so this must
    // not be wrapped in after() — nesting would drop the callback.
    publishIdea(id, "member");
    publishBoard("member");
    return Response.json(result);
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
    // publish.js defers this itself, so it lands after the commit —
    // do not wrap it in after() here or the callback is dropped.
    publishIdea(id, "member");
    publishBoard("member");
    return Response.json({ ok: true });
  } catch (e) {
    return jsonError(e, "Could not remove the member.");
  }
}
