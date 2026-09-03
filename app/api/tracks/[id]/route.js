import { getTrackWithCourses } from "@/features/learning/queries";
import { err, jsonError } from "@/lib/sql";
import { requireUser } from "@/features/auth/guard";

// GET /api/tracks/:id → one track's roadmap: its courses plus the caller's
// own status per course. Fetched on demand when a track card is opened —
// the list endpoint above never carries this.
export async function GET(_request, { params }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const track = await getTrackWithCourses(id, user.uid);
    if (!track) throw err(404, "Track not found.");
    return Response.json({ track });
  } catch (e) {
    return jsonError(e, "Could not load the track.");
  }
}
