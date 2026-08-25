import { after } from "next/server";
import { createMergeRequest, listMergeable } from "@/features/merge/queries";
import { isProjectLead } from "@/features/ideas/queries";
import { jsonError } from "@/lib/sql";
import { requireUser } from "@/features/auth/guard";
import { audit } from "@/features/notifications/notify";

// GET  /api/ideas/:id/merge          → the ideas this one could absorb
// POST /api/ideas/:id/merge { ids }  → ask an admin to merge them in
//
// Merging destroys other people's work, so raising the request is limited to an
// admin or the idea's acting lead, and carrying it out needs an admin.
export async function GET(_request, { params }) {
  try {
    await requireUser();
    const { id } = await params;
    return Response.json({ ideas: await listMergeable(id) });
  } catch (e) {
    return jsonError(e, "Could not load ideas.");
  }
}

export async function POST(request, { params }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const allowed = user.role === "admin" || (await isProjectLead(id, user.uid));
    if (!allowed) {
      return Response.json({ error: "Only an admin or the idea's lead can request a merge." }, { status: 403 });
    }
    const { ids } = await request.json();
    const res = await createMergeRequest(id, ids, user.uid);
    after(() => audit({
      actorId: user.uid, actor: user.name || user.username,
      action: `requested a merge of ${res.count} idea(s) into this one`,
      entity: "idea", entityId: id,
    }));
    return Response.json({ request: res }, { status: 201 });
  } catch (e) {
    return jsonError(e, "Could not request the merge.");
  }
}
