import { toggleFollow, jsonError } from "@/lib/db";
import { requireUser } from "@/lib/guard";

// POST /api/ideas/:id/follow → toggle following (email notifications come later)
export async function POST(_request, { params }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    return Response.json(await toggleFollow(id, user.uid));
  } catch (e) {
    return jsonError(e, "Could not update follow.");
  }
}
