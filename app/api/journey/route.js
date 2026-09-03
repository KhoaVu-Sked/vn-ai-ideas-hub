import { getJourney } from "@/features/learning/queries";
import { jsonError } from "@/lib/sql";
import { requireUser } from "@/features/auth/guard";

// GET /api/journey → every course across the caller's enrolled tracks, their
// own seniority level for the profile strip, and their 3 most recently
// completed courses (with quiz stats) for the Knowledge artifacts card. One
// round trip — getJourney returns all three in a single query.
export async function GET() {
  try {
    const user = await requireUser();
    const { position, courses, recent_completions } = await getJourney(user.uid);
    return Response.json({ courses, position, recentCompletions: recent_completions });
  } catch (e) {
    return jsonError(e, "Could not load your journey.");
  }
}
