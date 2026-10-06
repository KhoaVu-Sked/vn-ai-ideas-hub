import { jsonError } from "@/lib/sql";
import { requireUser } from "@/features/auth/guard";
import { validateBet } from "@/features/game/roulette/payouts";
import { ensureBalance, placeBet, currentRound } from "@/features/game/roulette/queries";
import { publishGame } from "@/features/game/realtime";

// POST /api/game/roulette/bet { kind, value, stake }
export async function POST(request) {
  try {
    const user = await requireUser();
    const { kind, value, stake } = await request.json();

    const bad = validateBet({ kind, value, stake });
    if (bad) return Response.json({ error: bad }, { status: 400 });

    await ensureBalance(user.uid);
    const round = await currentRound();
    if (!round) return Response.json({ error: "No round is open just now." }, { status: 409 });

    const placed = await placeBet(user.uid, round.id, kind, value == null ? null : String(value), stake);
    // The statement writes nothing when the round has closed or the balance is
    // short, so there is no state where coins left but no bet landed.
    if (!placed) {
      return Response.json(
        { error: "That did not go on — either betting has closed or you do not have the coins." },
        { status: 409 },
      );
    }

    publishGame("bet");
    return Response.json({ ok: true, coins: placed.coins });
  } catch (e) {
    return jsonError(e, "Could not place that bet.");
  }
}
