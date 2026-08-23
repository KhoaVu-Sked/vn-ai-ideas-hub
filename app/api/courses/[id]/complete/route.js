import { completeCourse } from "@/features/learning/queries";
import { jsonError } from "@/lib/sql";
import { requireUser } from "@/features/auth/guard";

// POST /api/courses/:id/complete → mark a course complete. Called once the
// wrap-up quiz's last question has been answered correctly.
export async function POST(_request, { params }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    return Response.json(await completeCourse(user.uid, id));
  } catch (e) {
    return jsonError(e, "Could not mark this course complete.");
  }
}
