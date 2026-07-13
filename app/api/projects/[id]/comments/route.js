import { notion, jsonError } from "@/lib/notion";

// POST /api/projects/:id/comments { text } → in-project change
// (the frontend follows this with a refetch of THIS project's detail only)
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const { text } = await request.json();
    if (!text?.trim()) return Response.json({ error: "Comment text is required." }, { status: 400 });

    const comment = await notion("/comments", {
      method: "POST",
      body: JSON.stringify({
        parent: { page_id: id },
        rich_text: [{ text: { content: text.trim().slice(0, 1800) } }],
      }),
    });
    return Response.json(
      {
        comment: {
          id: comment.id,
          text,
          author: comment.created_by?.name || "Member",
          date: (comment.created_time || "").slice(0, 10),
        },
      },
      { status: 201 }
    );
  } catch (e) {
    // Most common failure: the integration lacks comment capabilities
    if (e.status === 403) {
      return Response.json(
        { error: "The Notion integration needs 'Insert comments' capability — enable it in the integration settings." },
        { status: 403 }
      );
    }
    return jsonError(e, "Could not post the comment.");
  }
}
