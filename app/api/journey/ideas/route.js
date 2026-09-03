import { getMyIdeas } from "@/features/learning/queries";
import { jsonError } from "@/lib/sql";
import { requireUser } from "@/features/auth/guard";

// GET /api/journey/ideas → the caller's own Ideas Hub submissions, for the
// Learner Dashboard's Application card. Separate from /api/journey itself
// (which JourneyPage also calls, and doesn't need this) rather than folded
// into it.
export async function GET() {
  try {
    const user = await requireUser();
    return Response.json({ ideas: await getMyIdeas(user.uid) });
  } catch (e) {
    return jsonError(e, "Could not load your ideas.");
  }
}
