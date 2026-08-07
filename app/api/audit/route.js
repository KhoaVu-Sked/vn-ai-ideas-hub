import { AUDIT_RETENTION_DAYS, listAuditEntries } from "@/features/admin/queries";
import { jsonError } from "@/lib/sql";
import { requireAdmin } from "@/features/auth/guard";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const clean = (v) => (v && v.trim() ? v.trim() : null);
const day = (v) => (v && DATE.test(v) ? v : null);
// Postgres rejects an unknown zone name, so bounce it off Intl first.
function zone(v) {
  if (!v) return "UTC";
  try { new Intl.DateTimeFormat("en", { timeZone: v }); return v; } catch { return "UTC"; }
}

// GET /api/audit?actor=&type=&from=&to=&tz= → recent activity (admin only).
// Entries older than the retention window are pruned whenever a new one lands.
export async function GET(request) {
  try {
    await requireAdmin();
    const p = new URL(request.url).searchParams;
    const data = await listAuditEntries({
      actor: clean(p.get("actor")),
      type: clean(p.get("type")),
      from: day(p.get("from")),
      to: day(p.get("to")),
      tz: zone(p.get("tz")),
    });
    return Response.json({ ...data, retentionDays: AUDIT_RETENTION_DAYS });
  } catch (e) {
    return jsonError(e, "Could not load the audit log.");
  }
}
