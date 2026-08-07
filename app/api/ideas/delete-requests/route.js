import { listDeleteRequests } from "@/features/ideas/queries";
import { jsonError } from "@/lib/sql";
import { requireAdmin } from "@/features/auth/guard";

// GET /api/ideas/delete-requests → ideas a project lead asked to delete (admin)
export async function GET() {
  try {
    await requireAdmin();
    return Response.json({ requests: await listDeleteRequests() });
  } catch (e) {
    return jsonError(e, "Could not load delete requests.");
  }
}
