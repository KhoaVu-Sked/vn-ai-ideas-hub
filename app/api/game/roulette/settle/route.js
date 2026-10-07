import { jsonError } from "@/lib/sql";
import { requireUser } from "@/features/auth/guard";
import { currentRound, settleRound, openRound } from "@/features/game/roulette/queries";
import { publishGame } from "@/features/game/realtime";

// POST /api/game/roulette/settle → close the open round if its time is up.
//
// Any client may ask. Whoever gets there first settles; everyone else writes
// nothing, because the claim is `where settled_at is null`. That is why this
// needs no scheduler and no leader.
//
// It returns nothing the screen draws with. Announcements are read back off
// the settled rows by /state, so they reach the whole table rather than only
// the one client whose timer happened to fire first.
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

    publishGame("settled");
    await openRound();
    publishGame("round");

    return Response.json({ ok: true, settled: true, result: outcome.result });
  } catch (e) {
    return jsonError(e, "Could not settle the round.");
  }
}
