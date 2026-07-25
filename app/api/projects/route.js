import { listProjects, createProject, jsonError } from "@/lib/db";
import { requireUser } from "@/lib/guard";

// GET /api/projects → light list for the board (the only thing Refresh fetches)
export async function GET() {
  try {
    await requireUser();
    return Response.json({ projects: await listProjects() });
  } catch (e) {
    return jsonError(e, "Could not load the board.");
  }
}

// POST /api/projects { name, tag } → create an idea (starts as Not started)
export async function POST(request) {
  try {
    await requireUser();
    const { name, tag } = await request.json();
    if (!name?.trim()) return Response.json({ error: "Idea name is required." }, { status: 400 });
    const project = await createProject({ name, tag });
    return Response.json({ project }, { status: 201 });
  } catch (e) {
    return jsonError(e, "Could not create the idea.");
  }
}
