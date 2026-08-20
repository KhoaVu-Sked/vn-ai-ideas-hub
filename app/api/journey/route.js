import { getJourney, getUserPosition } from "@/features/learning/queries";
import { jsonError } from "@/lib/sql";
import { requireUser } from "@/features/auth/guard";

// GET /api/journey → every course across the caller's enrolled tracks, plus
// their own seniority level for the profile strip
export async function GET() {
  try {
    const user = await requireUser();
    const [courses, position] = await Promise.all([getJourney(user.uid), getUserPosition(user.uid)]);
    return Response.json({ courses, position });
  } catch (e) {
    return jsonError(e, "Could not load your journey.");
  }
}
