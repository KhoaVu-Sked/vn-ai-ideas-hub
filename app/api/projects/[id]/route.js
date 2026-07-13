import { notion, toLightProject, blocksToContent, updateStatusProperty, jsonError } from "@/lib/notion";

// GET /api/projects/:id → one project's full detail
// (fetched only when a card is clicked; the board list never includes this)
export async function GET(_request, { params }) {
  try {
    const { id } = await params;
    const [page, blocks, comments] = await Promise.all([
      notion(`/pages/${id}`),
      notion(`/blocks/${id}/children?page_size=30`),
      notion(`/comments?block_id=${id}&page_size=20`),
    ]);
    return Response.json({
      project: toLightProject(page),
      content: blocksToContent(blocks.results),
      comments: (comments.results || []).map((c) => ({
        id: c.id,
        text: (c.rich_text || []).map((r) => r.plain_text || "").join(""),
        author: c.created_by?.name || "Member",
        date: (c.created_time || "").slice(0, 10),
      })),
    });
  } catch (e) {
    return jsonError(e, "Could not load this project.");
  }
}

// PATCH /api/projects/:id { status } → board-level change
// (the frontend follows this with a LIST refetch only)
export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const { status } = await request.json();
    const allowed = ["Not started", "In progress", "On Hold", "Done"];
    if (!allowed.includes(status)) {
      return Response.json({ error: `Status must be one of: ${allowed.join(", ")}` }, { status: 400 });
    }
    const page = await updateStatusProperty(id, status);
    return Response.json({ project: toLightProject(page) });
  } catch (e) {
    return jsonError(e, "Could not update the status.");
  }
}
