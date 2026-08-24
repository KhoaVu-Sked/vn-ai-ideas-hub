import { clearDeleteRequest, isProjectLead, requestIdeaDeletion } from "@/features/ideas/queries";
import { jsonError } from "@/lib/sql";
import { requireUser } from "@/features/auth/guard";
import { after } from "next/server";
import { adminEvent } from "@/features/notifications/notify";
import { publishIdea, publishBoard } from "@/features/realtime/publish";

// POST /api/ideas/:id/delete-request { reason } → project lead asks admin to delete
export async function POST(request, { params }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const isLead = await isProjectLead(id, user.uid);
    if (!isLead && user.role !== "admin") {
      return Response.json({ error: "Only the project lead can request deletion." }, { status: 403 });
    }
    const { reason } = await request.json();
    await requestIdeaDeletion(id, user.uid, reason);
    const base = new URL(request.url).origin;
    const who = user.name || user.username;
    after(() => adminEvent({
      actorId: user.uid, actor: who, entity: "idea", entityId: id,
      auditAction: "requested deletion of an idea",
      subject: "Idea deletion requested",
      heading: "Deletion requested",
      intro: `<b>${who}</b> asked an admin to delete an idea.`,
      quote: reason || "",
      ctaPath: `/idea/${id}`, base,
    }));
    // After the write, never before: a ping that outruns the commit makes
    // every other client refetch the old row and see nothing change.
    after(() => {
      publishIdea(id, "delete-request");
      publishBoard("delete-request");
      publishIdea(id, "delete-request");
      publishBoard("delete-request");
    });
    return Response.json({ ok: true }, { status: 201 });
  } catch (e) {
    return jsonError(e, "Could not send the request.");
  }
}

// DELETE /api/ideas/:id/delete-request → admin dismisses the request
export async function DELETE(_request, { params }) {
  try {
    const user = await requireUser();
    if (user.role !== "admin") return Response.json({ error: "Admins only." }, { status: 403 });
    const { id } = await params;
    await clearDeleteRequest(id);
    // After the write, never before: a ping that outruns the commit makes
    // every other client refetch the old row and see nothing change.
    after(() => {
      publishIdea(id, "delete-request");
      publishBoard("delete-request");
      publishIdea(id, "delete-request");
      publishBoard("delete-request");
    });
    return Response.json({ ok: true });
  } catch (e) {
    return jsonError(e, "Could not update the request.");
  }
}
