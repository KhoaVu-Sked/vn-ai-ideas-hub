import { listMergeRequests } from "@/features/merge/queries";
import { jsonError } from "@/lib/sql";
import { requireAdmin } from "@/features/auth/guard";

// GET /api/merge-requests?status=pending → the admin queue
export async function GET(request) {
  try {
    await requireAdmin();
    const status = new URL(request.url).searchParams.get("status") || "pending";
    return Response.json({ requests: await listMergeRequests(status === "all" ? null : status) });
  } catch (e) {
    return jsonError(e, "Could not load merge requests.");
  }
}
