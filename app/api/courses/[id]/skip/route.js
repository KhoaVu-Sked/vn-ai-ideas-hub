import { skipCourse } from "@/features/learning/queries";
import { jsonError } from "@/lib/sql";
import { requireUser } from "@/features/auth/guard";

// POST /api/courses/:id/skip → mark this course 'skipped' for the caller,
// used to move past a locked position-tier gate
export async function POST(_request, { params }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    return Response.json(await skipCourse(id, user.uid));
  } catch (e) {
    return jsonError(e, "Could not skip this course.");
  }
}
