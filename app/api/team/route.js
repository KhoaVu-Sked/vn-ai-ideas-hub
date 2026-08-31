import { getTeamOverview, getTeamIdeas } from "@/features/learning/queries";
import { jsonError } from "@/lib/sql";
import { requireAdmin } from "@/features/auth/guard";

// GET /api/team → every enrolled learner, admin only (org-wide — this app
// has no manager/report hierarchy, same gate as Dashboard/Manage/Activity).
// ideas rides along in the same response (one browser round trip) for the
// "Ideas shipped" KPI and Application card — two independent queries on the
// server (roster, ideas), run concurrently rather than back to back.
export async function GET() {
  try {
    await requireAdmin();
    const [members, ideas] = await Promise.all([getTeamOverview(), getTeamIdeas()]);
    return Response.json({ members, ideas });
  } catch (e) {
    return jsonError(e, "Could not load the team.");
  }
}
