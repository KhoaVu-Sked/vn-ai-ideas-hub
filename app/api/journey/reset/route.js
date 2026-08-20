import { resetJourney } from "@/features/learning/queries";
import { jsonError } from "@/lib/sql";
import { requireUser } from "@/features/auth/guard";

// POST /api/journey/reset → clear all of the caller's course_assignments,
// reverting every course back to its track's original not_started state
export async function POST() {
  try {
    const user = await requireUser();
    return Response.json(await resetJourney(user.uid));
  } catch (e) {
    return jsonError(e, "Could not reset your journey.");
  }
}
