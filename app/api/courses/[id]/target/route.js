import { setTargetDate } from "@/features/learning/queries";
import { jsonError } from "@/lib/sql";
import { requireUser } from "@/features/auth/guard";

// POST /api/courses/:id/target { target_date } → set (or clear, with null)
// the caller's own suggested target date for a course. A suggestion, not an
// enforced deadline — editable anytime, no status/locking check.
export async function POST(request, { params }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const { target_date } = await request.json();
    if (target_date) {
      const today = new Date().toISOString().slice(0, 10);
      if (target_date < today) return Response.json({ error: "Pick today or a future date." }, { status: 400 });
    }
    return Response.json(await setTargetDate(user.uid, id, target_date || null));
  } catch (e) {
    return jsonError(e, "Could not set the target date.");
  }
}
