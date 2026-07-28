import { after } from "next/server";
import { joinTeam, leaveTeam, jsonError } from "@/lib/db";
import { requireUser } from "@/lib/guard";
import { notifyIdeaEvent } from "@/lib/notify";

// POST /api/ideas/:id/members { roles: [...] } → join the team
export async function POST(request, { params }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const { roles, role } = await request.json();
    const result = await joinTeam(id, user.uid, roles ?? role);
    const base = new URL(request.url).origin;
    after(() => notifyIdeaEvent(id, { actorId: user.uid, kind: "member", detail: (result.roles || []).join(", "), base }));
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
    await leaveTeam(id, user.uid);
    return Response.json({ ok: true });
  } catch (e) {
    return jsonError(e, "Could not leave the team.");
  }
}
