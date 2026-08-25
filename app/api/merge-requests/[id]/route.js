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

    const { main, merged, failed, affected } = await approveMergeRequest(id, admin.uid);

    publishIdea(main.id, "merge");
    publishBoard("merge");
    // Each source changed more than the main idea did — its comments, team and
    // requests are gone. Anyone sitting on one of those pages needs the ping, or
    // their tab keeps rendering an idea that no longer exists.
    for (const m of merged) publishIdea(m.id, "merge");

    const base = new URL(request.url).origin;
    const names = merged.map((m) => `${m.number} ${m.name}`).join(", ");
    after(() => ideaEvent(main.id, {
      actorId: admin.uid, actor: admin.name || admin.username, kind: "merge",
      body: `Merged in: ${names}`, base,
      // `also` carries the people who followed or worked on the ideas that were
      // absorbed. Their follow rows were just deleted, so this is the last
      // moment they can be reached.
      also: affected,
      auditAction: `approved a merge of ${merged.length} idea(s) into "${main.name}"`
                 + (failed.length ? ` — ${failed.length} could not be merged` : ""),
    }));

    // A partial merge must not read as a clean success: some sources are gone
    // and some are untouched, and the admin is the only one who can tell.
    return Response.json({
      ok: failed.length === 0,
      status: "approved",
      merged,
      failed,
      message: failed.length
        ? `Merged ${merged.length}. ${failed.length} could not be merged and are unchanged.`
        : undefined,
    });
  } catch (e) {
    return jsonError(e, "Could not decide the merge request.");
  }
}
