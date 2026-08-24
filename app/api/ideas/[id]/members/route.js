import { after } from "next/server";
import { joinTeam, leaveTeam } from "@/features/ideas/queries";
import { jsonError } from "@/lib/sql";
import { requireUser } from "@/features/auth/guard";
import { ideaEvent } from "@/features/notifications/notify";
import { publishIdea, publishBoard } from "@/features/realtime/publish";

// POST /api/ideas/:id/members { roles: [...] } → join the team
export async function POST(request, { params }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    publishIdea(id, "member");
    publishBoard("member");
    const { roles, role } = await request.json();
    const result = await joinTeam(id, user.uid, roles ?? role);
    const base = new URL(request.url).origin;
    const who = user.name || user.username;
    const rolesText = (result.roles || []).join(", ");
    after(() => ideaEvent(id, {
      actorId: user.uid, actor: who, kind: "member", detail: rolesText, base,
      auditAction: `joined a team as ${rolesText}`,
    }));
    return Response.json(result, { status: 201 });
  } catch (e) {
    return jsonError(e, "Could not join the team.");
  }
}

// DELETE /api/ideas/:id/members → leave the team
export async function DELETE(_request, { params }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    publishIdea(id, "member");
    publishBoard("member");
    await leaveTeam(id, user.uid);
    return Response.json({ ok: true });
  } catch (e) {
    return jsonError(e, "Could not leave the team.");
  }
}
