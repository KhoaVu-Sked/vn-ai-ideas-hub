import { getCourseWithQuiz } from "@/features/learning/queries";
import { jsonError } from "@/lib/sql";
import { requireUser } from "@/features/auth/guard";

// GET /api/courses/:id/quiz → the course's title/link/status plus its quiz
// questions (options, correct_answer, rationale included — no locking, no
// scoring, so there's nothing gained by keeping the answer off the client).
export async function GET(_request, { params }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const course = await getCourseWithQuiz(id, user.uid);
    if (!course) return Response.json({ error: "Course not found." }, { status: 404 });
    return Response.json(course);
  } catch (e) {
    return jsonError(e, "Could not load this course's quiz.");
  }
}
