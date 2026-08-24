import { toggleLike } from "@/features/ideas/queries";
import { jsonError } from "@/lib/sql";
import { requireUser } from "@/features/auth/guard";
import { publishIdea, publishBoard } from "@/features/realtime/publish";

// POST /api/ideas/:id/like → toggle the current user's like
export async function POST(_request, { params }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    publishIdea(id, "like");
    publishBoard("like");
    return Response.json(await toggleLike(id, user.uid));
  } catch (e) {
    return jsonError(e, "Could not update your like.");
  }
}
