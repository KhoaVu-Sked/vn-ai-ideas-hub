import { toggleFollow } from "@/features/ideas/queries";
import { jsonError } from "@/lib/sql";
import { requireUser } from "@/features/auth/guard";
import { publishIdea } from "@/features/realtime/publish";

// POST /api/ideas/:id/follow → toggle following (email notifications come later)
export async function POST(_request, { params }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    publishIdea(id, "follow");
    return Response.json(await toggleFollow(id, user.uid));
  } catch (e) {
    return jsonError(e, "Could not update follow.");
  }
}
