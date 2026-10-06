import { jsonError } from "@/lib/sql";
import { requireUser } from "@/features/auth/guard";
import { postChat, recentChat } from "@/features/game/roulette/queries";
import { publishGame } from "@/features/game/realtime";

// GET  /api/game/roulette/chat → the last ten minutes
// POST /api/game/roulette/chat { body }
export async function GET() {
  try {
    await requireUser();
    const chat = await recentChat();
    return Response.json({ chat: chat.map((c) => ({ ...c, id: String(c.id) })) });
  } catch (e) {
    return jsonError(e, "Could not read the chat.");
  }
}

export async function POST(request) {
  try {
    const user = await requireUser();
    const { body } = await request.json();
    const msg = await postChat(user.uid, body);
    if (!msg) return Response.json({ error: "Write something first." }, { status: 400 });
    publishGame("chat");
    return Response.json({ ok: true });
  } catch (e) {
    return jsonError(e, "Could not send that.");
  }
}
