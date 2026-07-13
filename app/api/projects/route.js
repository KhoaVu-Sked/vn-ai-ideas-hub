import { notion, PROJECTS_DB, toLightProject, jsonError } from "@/lib/notion";

// GET /api/projects → light list for the board (the only thing Refresh fetches)
export async function GET() {
  try {
    const body = await notion(`/databases/${PROJECTS_DB()}/query`, {
      method: "POST",
      body: JSON.stringify({
        page_size: 50,
        sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
      }),
    });
    return Response.json({ projects: (body.results || []).map(toLightProject) });
  } catch (e) {
    return jsonError(e, "Could not load the board.");
  }
}

// POST /api/projects { name, tag } → create an idea (starts as Not started)
export async function POST(request) {
  try {
    const { name, tag } = await request.json();
    if (!name?.trim()) return Response.json({ error: "Idea name is required." }, { status: 400 });

    const properties = {
      Name: { title: [{ text: { content: name.trim() } }] },
    };
    if (tag) properties.Tags = { multi_select: [{ name: tag }] };

    let page;
    try {
      page = await notion("/pages", {
        method: "POST",
        body: JSON.stringify({
          parent: { database_id: PROJECTS_DB() },
          properties: { ...properties, Status: { status: { name: "Not started" } } },
        }),
      });
    } catch (e) {
      if (e.status !== 400) throw e;
      // Status property is a plain select in some templates
      page = await notion("/pages", {
        method: "POST",
        body: JSON.stringify({
          parent: { database_id: PROJECTS_DB() },
          properties: { ...properties, Status: { select: { name: "Not started" } } },
        }),
      });
    }
    return Response.json({ project: toLightProject(page) }, { status: 201 });
  } catch (e) {
    return jsonError(e, "Could not create the idea.");
  }
}
