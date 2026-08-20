import { listTracks } from "@/features/learning/queries";
import { jsonError } from "@/lib/sql";
import { requireUser } from "@/features/auth/guard";

// GET /api/tracks → suggested-tracks cards for My Learning (list only)
export async function GET() {
  try {
    const user = await requireUser();
    return Response.json({ tracks: await listTracks(user.uid) });
  } catch (e) {
    return jsonError(e, "Could not load tracks.");
  }
}
