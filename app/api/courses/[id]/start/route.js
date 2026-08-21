import { startCourse } from "@/features/learning/queries";
import { jsonError } from "@/lib/sql";
import { requireUser } from "@/features/auth/guard";

// POST /api/courses/:id/start → flip a not_started course to in_progress
// (no-op if it's already anything else). Called automatically when a
// course becomes the top "Up next" pick — signals "you're on this one now".
export async function POST(_request, { params }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    return Response.json(await startCourse(user.uid, id));
  } catch (e) {
    return jsonError(e, "Could not start this course.");
  }
}
