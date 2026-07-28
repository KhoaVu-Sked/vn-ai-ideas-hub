import { setFeedbackStatus, deleteFeedback, jsonError } from "@/lib/db";
import { requireAdmin } from "@/lib/guard";

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
