import { jsonError } from "@/lib/sql";
import { requireUser } from "@/features/auth/guard";
import { currentRound, settleRound, openRound } from "@/features/game/roulette/queries";
import { worthShouting } from "@/features/game/roulette/payouts";
import { publishGame } from "@/features/game/realtime";

// POST /api/game/roulette/settle → close the open round if its time is up.
//
// Any client may ask. Whoever gets there first settles; everyone else writes
// nothing, because the claim is `where settled_at is null`. That is why this
// needs no scheduler and no leader.
export async function POST() {
  try {
    await requireUser();
    const round = await currentRound();
    if (!round) return Response.json({ ok: true, settled: false });

    // The deadline is checked against the database clock, not the caller's.
    if (new Date(round.closes_at).getTime() > Date.now()) {
      return Response.json({ ok: true, settled: false, reason: "still open" });
    }

    const outcome = await settleRound(round.id);
    if (!outcome) return Response.json({ ok: true, settled: false, reason: "someone else got there first" });

    const shouts = outcome.paid
      .map((p) => ({ p, bet: outcome.bets.find((b) => String(b.id) === String(p.id)) }))
      .filter(({ p, bet }) => bet && worthShouting(bet, p.payout))
      .map(({ p, bet }) => ({ who: bet.who, payout: p.payout, kind: bet.kind, value: bet.value }));

    publishGame("settled");
    await openRound();
    publishGame("round");

    return Response.json({ ok: true, settled: true, result: outcome.result, shouts });
  } catch (e) {
    return jsonError(e, "Could not settle the round.");
  }
}
