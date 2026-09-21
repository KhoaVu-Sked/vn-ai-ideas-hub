import { unstartCourse } from "@/features/learning/queries";
import { jsonError } from "@/lib/sql";
import { requireUser } from "@/features/auth/guard";

// POST /api/courses/:id/unstart → flip an in_progress course back to
// not_started (no-op otherwise). Called when a learner picks this course to
// set aside while starting a different one, once their track is already at
// its 2-in-progress cap.
export async function POST(_request, { params }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    return Response.json(await unstartCourse(user.uid, id));
  } catch (e) {
    return jsonError(e, "Could not update this course.");
  }
}
