import { deleteFeedback, setFeedbackStatus } from "@/features/feedback/queries";
import { jsonError } from "@/lib/sql";
import { requireAdmin } from "@/features/auth/guard";

// PATCH /api/feedback/:id { status } → mark open/resolved (admin only)
export async function PATCH(request, { params }) {
  try {
    await requireAdmin();
    const { id } = await params;
    const { status } = await request.json();
    return Response.json(await setFeedbackStatus(id, status));
  } catch (e) {
    return jsonError(e, "Could not update the feedback.");
  }
}

// DELETE /api/feedback/:id → remove (admin only)
export async function DELETE(_request, { params }) {
  try {
    await requireAdmin();
    const { id } = await params;
    await deleteFeedback(id);
    return Response.json({ ok: true });
  } catch (e) {
    return jsonError(e, "Could not delete the feedback.");
  }
}
