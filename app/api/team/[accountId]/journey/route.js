import { getJourney } from "@/features/learning/queries";
import { jsonError } from "@/lib/sql";
import { requireAdmin } from "@/features/auth/guard";

// GET /api/team/:accountId/journey → read-only drill-down into one
// learner's roadmap, admin only. Reuses getJourney as-is — it was already
// generic on accountId, not hardcoded to the caller's own session.
export async function GET(_request, { params }) {
  try {
    await requireAdmin();
    const { accountId } = await params;
    return Response.json({ courses: await getJourney(accountId) });
  } catch (e) {
    return jsonError(e, "Could not load that learner's roadmap.");
  }
}
