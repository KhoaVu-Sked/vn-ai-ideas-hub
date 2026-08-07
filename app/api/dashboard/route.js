import { getDashboard } from "@/features/dashboard/queries";
import { jsonError } from "@/lib/sql";
import { requireAdmin } from "@/features/auth/guard";

// GET /api/dashboard?period=all|quarter → leader dashboard metrics (admin only)
export async function GET(request) {
  try {
    await requireAdmin();
    const period = new URL(request.url).searchParams.get("period");
    const now = new Date();
    const qStart = new Date(Date.UTC(now.getUTCFullYear(), Math.floor(now.getUTCMonth() / 3) * 3, 1)).toISOString();
    const since = period === "quarter" ? qStart : null;
    return Response.json(await getDashboard({ since, quarterStart: qStart }));
  } catch (e) {
    return jsonError(e, "Could not load the dashboard.");
  }
}
