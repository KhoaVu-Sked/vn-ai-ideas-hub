import { addFeedback, listFeedback, jsonError } from "@/lib/db";
import { requireUser, requireAdmin } from "@/lib/guard";

// GET /api/feedback → all feedback (admin only)
export async function GET() {
  try {
    await requireAdmin();
    return Response.json({ feedback: await listFeedback() });
  } catch (e) {
    return jsonError(e, "Could not load feedback.");
  }
}

// POST /api/feedback { body, page } → submit feedback (any signed-in user)
export async function POST(request) {
  try {
    const user = await requireUser();
    const { body, page } = await request.json();
    if (!body?.trim()) return Response.json({ error: "Please write something first." }, { status: 400 });
    await addFeedback(user.uid, body, page);
    return Response.json({ ok: true }, { status: 201 });
  } catch (e) {
    return jsonError(e, "Could not send your feedback.");
  }
}
