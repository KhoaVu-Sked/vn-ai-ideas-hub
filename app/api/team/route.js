import { getTeamOverview } from "@/features/learning/queries";
import { jsonError } from "@/lib/sql";
import { requireAdmin } from "@/features/auth/guard";

// GET /api/team → every enrolled learner, admin only (org-wide — this app
// has no manager/report hierarchy, same gate as Dashboard/Manage/Activity)
export async function GET() {
  try {
    await requireAdmin();
    return Response.json({ members: await getTeamOverview() });
  } catch (e) {
    return jsonError(e, "Could not load the team.");
  }
}
