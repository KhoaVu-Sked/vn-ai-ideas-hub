import { enrollInTrack } from "@/features/learning/queries";
import { jsonError } from "@/lib/sql";
import { requireUser } from "@/features/auth/guard";

// POST /api/tracks/:id/assignment → enroll in a track. One-directional —
// see enrollInTrack()'s own comment for why; calling this again for an
// already-enrolled track just no-ops.
export async function POST(_request, { params }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    return Response.json(await enrollInTrack(id, user.uid));
  } catch (e) {
    return jsonError(e, "Could not enroll you in that track.");
  }
}
