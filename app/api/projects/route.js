import { listProjects, createProject, jsonError } from "@/lib/db";
import { requireUser } from "@/lib/guard";
import { after } from "next/server";
import { adminEvent } from "@/lib/notify";

// GET /api/projects → light board list (with a per-user `mine` flag)
export async function GET() {
  try {
    const user = await requireUser();
    return Response.json({ projects: await listProjects(user.uid) });
  } catch (e) {
    return jsonError(e, "Could not load the board.");
  }
}

// POST /api/projects { name, tags[], context, pain_points, expected_benefit, target_date }
// → create an idea (starts as Submitted; the creator becomes its Project Lead)
export async function POST(request) {
  try {
    const user = await requireUser();
    const { name, tags, context, pain_points, expected_benefit, target_date } = await request.json();
    if (!name?.trim()) return Response.json({ error: "Idea name is required." }, { status: 400 });
    const project = await createProject({
      name, tags, context, pain_points, expected_benefit, target_date, initiatorAccountId: user.uid,
    });
    const base = new URL(request.url).origin;
    const who = user.name || user.username;
    after(() => adminEvent({
      actorId: user.uid, actor: who, entity: "idea", entityId: project.id,
      auditAction: `submitted a new idea "${project.name}"`,
      subject: `[AI Ideas Hub] New idea: ${project.name}`,
      heading: "New idea submitted",
      intro: `<b>${who}</b> submitted <b>${project.name}</b>.`,
      rows: [["Idea", project.name], ["Submitted by", who], ["Tags", (project.tags || []).join(", ") || "—"]],
      ctaPath: `/idea/${project.id}`, base,
    }));
    return Response.json({ project }, { status: 201 });
  } catch (e) {
    return jsonError(e, "Could not create the idea.");
  }
}
