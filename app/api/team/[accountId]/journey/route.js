import { getJourney } from "@/features/learning/queries";
import { jsonError } from "@/lib/sql";
import { requireAdmin } from "@/features/auth/guard";

// GET /api/team/:accountId/journey → read-only drill-down into one
// learner's roadmap, admin only. Reuses getJourney as-is — it was already
// generic on accountId, not hardcoded to the caller's own session. position
// rides along (previously dropped here) so the client can scope the
// roadmap to what's actually expected of this person by now — same
// isExpectedByNow/effectivePosition rule "My courses" applies to the
// learner's own view — instead of showing every tier of the whole track.
export async function GET(_request, { params }) {
  try {
    await requireAdmin();
    const { accountId } = await params;
    const { courses, position } = await getJourney(accountId);
    return Response.json({ courses, position });
  } catch (e) {
    return jsonError(e, "Could not load that learner's roadmap.");
  }
}
