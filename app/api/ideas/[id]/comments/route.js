import { after } from "next/server";
import { addComment , assertNotMerged } from "@/features/ideas/queries";
import { jsonError } from "@/lib/sql";
import { requireUser } from "@/features/auth/guard";
import { ideaEvent } from "@/features/notifications/notify";
import { publishIdea } from "@/features/realtime/publish";

// POST /api/ideas/:id/comments { body } → the idea's Overview thread
export async function POST(request, { params }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    await assertNotMerged(id);
    const { body } = await request.json();
    const comment = await addComment(id, user.uid, body);
    const base = new URL(request.url).origin;
    const who = user.name || user.username;
    after(() => ideaEvent(id, {
      actorId: user.uid, actor: who, kind: "request", body: comment.body, base,
      auditAction: "posted a comment",
    }));
    // publish.js defers this itself, so it lands after the commit —
    // do not wrap it in after() here or the callback is dropped.
    publishIdea(id, "comment");
    return Response.json({ comment }, { status: 201 });
  } catch (e) {
    return jsonError(e, "Could not post the comment.");
  }
}
