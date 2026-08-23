import { completeCourse } from "@/features/learning/queries";
import { jsonError } from "@/lib/sql";
import { requireUser } from "@/features/auth/guard";

// POST /api/courses/:id/complete { correct, total } → mark a course
// complete. Called once the wrap-up quiz's last question has been answered
// correctly; correct/total (how many questions were right on the first
// click, out of how many) are a one-time snapshot, not read back from
// course_quiz_questions later. Body is optional so an old-style call still
// completes the course, just without stats.
export async function POST(request, { params }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const { correct, total } = await request.json().catch(() => ({}));
    return Response.json(await completeCourse(user.uid, id, { correct, total }));
  } catch (e) {
    return jsonError(e, "Could not mark this course complete.");
  }
}
