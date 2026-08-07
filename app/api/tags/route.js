import { addTag, deleteTag, listTags, setTagColor } from "@/features/admin/queries";
import { jsonError } from "@/lib/sql";
import { requireUser, requireAdmin } from "@/features/auth/guard";

// GET /api/tags → the tag catalog (for the submit form + filters)
export async function GET() {
  try {
    await requireUser();
    return Response.json({ tags: await listTags() });
  } catch (e) {
    return jsonError(e, "Could not load tags.");
  }
}

// POST /api/tags { name, color? } → add a tag (admin only)
export async function POST(request) {
  try {
    await requireAdmin();
    const { name, color } = await request.json();
    const tags = await addTag(name, color);
    return Response.json({ tags }, { status: 201 });
  } catch (e) {
    return jsonError(e, "Could not add the tag.");
  }
}

// PATCH /api/tags { name, color } → set a tag's color (admin only)
export async function PATCH(request) {
  try {
    await requireAdmin();
    const { name, color } = await request.json();
    const tags = await setTagColor(name, color);
    return Response.json({ tags });
  } catch (e) {
    return jsonError(e, "Could not update the tag.");
  }
}

// DELETE /api/tags { name } → remove a tag (admin only); strips it from ideas
export async function DELETE(request) {
  try {
    const user = await requireUser();
    if (user.role !== "admin") return Response.json({ error: "Only an admin can delete tags." }, { status: 403 });
    const { name } = await request.json();
    const tags = await deleteTag(name);
    return Response.json({ tags });
  } catch (e) {
    return jsonError(e, "Could not delete the tag.");
  }
}
