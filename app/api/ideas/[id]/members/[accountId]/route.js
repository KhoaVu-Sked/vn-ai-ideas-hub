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
    // After the write, never before: a ping that outruns the commit makes
    // every other client refetch the old row and see nothing change.
    after(() => {
      publishIdea(id, "member");
      publishBoard("member");
      publishIdea(id, "member");
      publishBoard("member");
    });
    return Response.json(await setMemberRoles(id, accountId, roles ?? role));
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
    // After the write, never before: a ping that outruns the commit makes
    // every other client refetch the old row and see nothing change.
    after(() => {
      publishIdea(id, "member");
      publishBoard("member");
      publishIdea(id, "member");
      publishBoard("member");
    });
    return Response.json({ ok: true });
  } catch (e) {
    return jsonError(e, "Could not remove the member.");
  }
}
