import { reorderStage } from "@/features/learning/queries";
import { jsonError } from "@/lib/sql";
import { requireUser } from "@/features/auth/guard";

// POST /api/journey/reorder { position, courseIds } → set the caller's own
// display order for every course in one position tier (e.g. 'intern').
// courseIds not actually in that tier (or not reachable via an enrolled
// track) are silently dropped server-side — see reorderStage.
export async function POST(request) {
  try {
    const user = await requireUser();
    const { position, courseIds } = await request.json();
    if (!position || !Array.isArray(courseIds) || courseIds.length === 0) {
      return Response.json({ error: "position and courseIds are required." }, { status: 400 });
    }
    return Response.json(await reorderStage(user.uid, position, courseIds));
  } catch (e) {
    return jsonError(e, "Could not reorder that stage.");
  }
}
