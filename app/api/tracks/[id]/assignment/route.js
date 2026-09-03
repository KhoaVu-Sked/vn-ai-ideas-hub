import { toggleTrackAssignment } from "@/features/learning/queries";
import { jsonError } from "@/lib/sql";
import { requireUser } from "@/features/auth/guard";

// POST /api/tracks/:id/assignment → toggle "I'm on this track"
export async function POST(_request, { params }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    return Response.json(await toggleTrackAssignment(id, user.uid));
  } catch (e) {
    return jsonError(e, "Could not update your track assignment.");
  }
}
