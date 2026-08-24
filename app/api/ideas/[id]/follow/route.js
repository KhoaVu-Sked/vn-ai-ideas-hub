import { toggleFollow } from "@/features/ideas/queries";
import { jsonError } from "@/lib/sql";
import { requireUser } from "@/features/auth/guard";
import { publishIdea } from "@/features/realtime/publish";

// POST /api/ideas/:id/follow → toggle following (email notifications come later)
export async function POST(_request, { params }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const result = await toggleFollow(id, user.uid);
    // After the write. publish.js defers the send itself, so this must
    // not be wrapped in after() — nesting would drop the callback.
    publishIdea(id, "follow");
    return Response.json(result);
  } catch (e) {
    return jsonError(e, "Could not update follow.");
  }
}
