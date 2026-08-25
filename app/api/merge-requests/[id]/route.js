import { after } from "next/server";
import { approveMergeRequest, rejectMergeRequest } from "@/features/merge/queries";
import { jsonError } from "@/lib/sql";
import { requireAdmin } from "@/features/auth/guard";
import { ideaEvent, audit } from "@/features/notifications/notify";
import { publishIdea, publishBoard } from "@/features/realtime/publish";

// PATCH /api/merge-requests/:id { decision: "approve" | "reject", reason }
//
// An admin may approve a request they raised themselves. The queue is the
// control, not a second pair of eyes: requester and approver are separate
// columns, so a self-approval shows plainly in the log.
export async function PATCH(request, { params }) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const { decision, reason } = await request.json();

    if (decision === "reject") {
      await rejectMergeRequest(id, admin.uid, reason);
      after(() => audit({
        actorId: admin.uid, actor: admin.name || admin.username,
        action: `rejected a merge request${reason ? ` — ${reason}` : ""}`,
        entity: "merge_request", entityId: id,
      }));
      return Response.json({ ok: true, status: "rejected" });
    }

    const { main, merged } = await approveMergeRequest(id, admin.uid);
    publishIdea(main.id, "merge");
    publishBoard("merge");
    const base = new URL(request.url).origin;
    const names = merged.map((m) => `${m.number} ${m.name}`).join(", ");
    after(() => ideaEvent(main.id, {
      actorId: admin.uid, actor: admin.name || admin.username, kind: "merge",
      body: `Merged in: ${names}`, base,
      auditAction: `approved a merge of ${merged.length} idea(s) into "${main.name}"`,
    }));
    return Response.json({ ok: true, status: "approved", merged });
  } catch (e) {
    return jsonError(e, "Could not decide the merge request.");
  }
}
