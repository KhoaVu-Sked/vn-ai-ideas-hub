import { getJourney } from "@/features/learning/queries";
import { jsonError } from "@/lib/sql";
import { requireUser } from "@/features/auth/guard";

// GET /api/journey → every course across the caller's enrolled tracks
export async function GET() {
  try {
    const user = await requireUser();
    return Response.json({ courses: await getJourney(user.uid) });
  } catch (e) {
    return jsonError(e, "Could not load your journey.");
  }
}
