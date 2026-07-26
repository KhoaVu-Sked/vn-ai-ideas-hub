import { toggleLike, jsonError } from "@/lib/db";
import { requireUser } from "@/lib/guard";

// POST /api/ideas/:id/like → toggle the current user's like
export async function POST(_request, { params }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    return Response.json(await toggleLike(id, user.uid));
  } catch (e) {
    return jsonError(e, "Could not update your like.");
  }
}
