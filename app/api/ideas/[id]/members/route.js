import { joinTeam, leaveTeam, jsonError } from "@/lib/db";
import { requireUser } from "@/lib/guard";

// POST /api/ideas/:id/members { role } → join the team in a role
export async function POST(request, { params }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const { role } = await request.json();
    const result = await joinTeam(id, user.uid, role);
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
