import { listAuditEntries, AUDIT_RETENTION_DAYS, jsonError } from "@/lib/db";
import { requireAdmin } from "@/lib/guard";

// GET /api/audit → recent activity (admin only). Entries older than the
// retention window are pruned automatically whenever a new one is written.
export async function GET() {
  try {
    await requireAdmin();
    return Response.json({ entries: await listAuditEntries(200), retentionDays: AUDIT_RETENTION_DAYS });
  } catch (e) {
    return jsonError(e, "Could not load the audit log.");
  }
}
