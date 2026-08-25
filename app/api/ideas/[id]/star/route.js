import { after } from "next/server";
import { setStar } from "@/features/ideas/queries";
import { jsonError } from "@/lib/sql";
import { requireAdmin } from "@/features/auth/guard";
import { audit } from "@/features/notifications/notify";
import { publishIdea, publishBoard } from "@/features/realtime/publish";

// PATCH /api/ideas/:id/star { starred } → admin only
// A star pins the idea to the top of the board and weights its contributors'
// scores, so it is deliberately not something a project lead can award itself.
export async function PATCH(request, { params }) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const { starred } = await request.json();
    const idea = await setStar(id, starred, admin.uid);
    publishIdea(id, "star");
    publishBoard("star");
    after(() => audit({
      actorId: admin.uid, actor: admin.name || admin.username,
      action: `${idea.starred ? "starred" : "removed the star from"} "${idea.name}"`,
      entity: "idea", entityId: id,
    }));
    return Response.json({ idea });
  } catch (e) {
    return jsonError(e, "Could not change the star.");
  }
}
