import { listTags, addTag, jsonError } from "@/lib/db";
import { requireUser } from "@/lib/guard";

// GET /api/tags → the tag catalog (for the submit form + filters)
export async function GET() {
  try {
    await requireUser();
    return Response.json({ tags: await listTags() });
  } catch (e) {
    return jsonError(e, "Could not load tags.");
  }
}

// POST /api/tags { name } → add a tag (admin only)
export async function POST(request) {
  try {
    const user = await requireUser();
    if (user.role !== "admin") return Response.json({ error: "Only an admin can add tags." }, { status: 403 });
    const { name } = await request.json();
    const tags = await addTag(name);
    return Response.json({ tags }, { status: 201 });
  } catch (e) {
    return jsonError(e, "Could not add the tag.");
  }
}
