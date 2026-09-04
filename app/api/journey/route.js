import { getJourney } from "@/features/learning/queries";
import { jsonError } from "@/lib/sql";
import { requireUser } from "@/features/auth/guard";

// GET /api/journey → every course across the caller's enrolled tracks, their
// own seniority level for the profile strip, their 3 most recently
// completed courses (with quiz stats) for the Knowledge artifacts card, and
// whether Google Calendar is connected (gates the Auto Schedule button).
// One round trip — getJourney returns all four in a single query.
export async function GET() {
  try {
    const user = await requireUser();
    const { position, courses, recent_completions, calendar_connected } = await getJourney(user.uid);
    return Response.json({ courses, position, recentCompletions: recent_completions, calendarConnected: calendar_connected });
  } catch (e) {
    return jsonError(e, "Could not load your journey.");
  }
}
