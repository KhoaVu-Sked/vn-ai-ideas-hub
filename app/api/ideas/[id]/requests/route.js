import { after } from "next/server";
import { addRequest, jsonError } from "@/lib/db";
import { requireUser } from "@/lib/guard";
import { notifyIdeaEvent } from "@/lib/notify";

// POST /api/ideas/:id/requests { body } → add a request/input
export async function POST(request, { params }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const { body } = await request.json();
    if (!body?.trim()) return Response.json({ error: "Write something first." }, { status: 400 });
    const created = await addRequest(id, user.uid, body);
    const base = new URL(request.url).origin;
    after(() => notifyIdeaEvent(id, { actorId: user.uid, kind: "request", base }));
    return Response.json({ request: created }, { status: 201 });
  } catch (e) {
    return jsonError(e, "Could not post the request.");
  }
}
