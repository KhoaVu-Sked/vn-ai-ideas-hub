import { addComment, jsonError } from "@/lib/db";
import { requireUser } from "@/lib/guard";

// POST /api/projects/:id/comments { text } → in-project change
// (the frontend follows this with a refetch of THIS project's detail only)
export async function POST(request, { params }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const { text } = await request.json();
    if (!text?.trim()) return Response.json({ error: "Comment text is required." }, { status: 400 });

    const comment = await addComment(id, text, user.username);
    return Response.json({ comment }, { status: 201 });
  } catch (e) {
    return jsonError(e, "Could not post the comment.");
  }
}
