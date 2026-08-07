import { addTimeFrame, deleteTimeFrame, listTimeFrames } from "@/features/admin/queries";
import { jsonError } from "@/lib/sql";
import { requireUser, requireAdmin } from "@/features/auth/guard";

// GET /api/time-frames → options for the submit form (any signed-in user)
export async function GET() {
  try {
    await requireUser();
    return Response.json({ timeFrames: await listTimeFrames() });
  } catch (e) {
    return jsonError(e, "Could not load time frames.");
  }
}

// POST /api/time-frames { name } → add an option (admin)
export async function POST(request) {
  try {
    await requireAdmin();
    const { name } = await request.json();
    return Response.json({ timeFrames: await addTimeFrame(name) }, { status: 201 });
  } catch (e) {
    return jsonError(e, "Could not add the time frame.");
  }
}

// DELETE /api/time-frames { name } → remove an option (admin).
// Ideas already using it keep their stored value.
export async function DELETE(request) {
  try {
    await requireAdmin();
    const { name } = await request.json();
    return Response.json({ timeFrames: await deleteTimeFrame(name) });
  } catch (e) {
    return jsonError(e, "Could not delete the time frame.");
  }
}
