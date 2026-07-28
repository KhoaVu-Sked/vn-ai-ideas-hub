import { del } from "@vercel/blob";
import { getIdea, updateContent, isProjectLead, deleteIdea, LEAD_ROLE, jsonError } from "@/lib/db";
import { requireUser } from "@/lib/guard";
import { after } from "next/server";
import { ideaEvent } from "@/lib/notify";

// GET /api/ideas/:id → full detail for the /idea/[id] page
export async function GET(_request, { params }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const data = await getIdea(id, user.uid);
    data.meId = user.uid;
    data.isAdmin = user.role === "admin";
    // Whether the viewer may edit content / change status.
    data.canEdit = data.isAdmin || data.myRole === LEAD_ROLE;
    return Response.json(data);
  } catch (e) {
    return jsonError(e, "Could not load this idea.");
  }
}

// PATCH /api/ideas/:id { context, pain_points, expected_benefit, target_date }
// → edit core content (idea lead or admin only)
export async function PATCH(request, { params }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const allowed = user.role === "admin" || (await isProjectLead(id, user.uid));
    if (!allowed) return Response.json({ error: "Only the project lead can edit this idea." }, { status: 403 });
    const body = await request.json();
    const res = await updateContent(id, body);
    if (res.changed.length) {
      const base = new URL(request.url).origin;
      const who = user.name || user.username;
      after(() => ideaEvent(id, {
        actorId: user.uid, actor: who, kind: "content", detail: res.changed.join(", "), base,
        auditAction: `edited ${res.changed.join(", ")} on "${res.name}"`,
      }));
    }
    return Response.json({ ok: true });
  } catch (e) {
    return jsonError(e, "Could not update the idea.");
  }
}

// DELETE /api/ideas/:id → delete the idea (admin only); cleans up its blobs
export async function DELETE(_request, { params }) {
  try {
    const user = await requireUser();
    if (user.role !== "admin") return Response.json({ error: "Only an admin can delete an idea." }, { status: 403 });
    const { id } = await params;
    const { urls } = await deleteIdea(id);
    if ((process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN) && urls?.length) {
      for (const u of urls) { try { await del(u); } catch { /* ignore */ } }
    }
    return Response.json({ ok: true });
  } catch (e) {
    return jsonError(e, "Could not delete the idea.");
  }
}
