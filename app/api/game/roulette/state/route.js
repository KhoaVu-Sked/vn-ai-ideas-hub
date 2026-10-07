import { jsonError } from "@/lib/sql";
import { requireUser } from "@/features/auth/guard";
import { worthShouting } from "@/features/game/roulette/payouts";
import {
  ensureBalance, currentRound, openRound, recentResults, betsFor,
  recentChat, heartbeat, whoIsHere, SPIN_MS,
} from "@/features/game/roulette/queries";

// GET /api/game/roulette/state → everything the table needs to draw itself.
//
// Also the heartbeat: asking for state is proof you are sitting here, so
// presence needs no separate call.
export async function GET() {
  try {
    const user = await requireUser();
    await heartbeat(user.uid);
    const coins = await ensureBalance(user.uid);

    // Open one if the table is idle. Safe to race: the partial unique index
    // means a second caller gets the existing round rather than a second one.
    let round = await currentRound();
    if (!round) round = await openRound();

    const [results, bets, chat, players] = await Promise.all([
      recentResults(10),
      round ? betsFor(round.id) : Promise.resolve([]),
      recentChat(),
      whoIsHere(),
    ]);

    // Who the last spin paid enough to announce. Read back off the settled
    // rows rather than handed to whoever settled, so every screen raises the
    // same shout at the same point in its own spin — before, the one client
    // that won the settle race was the only one that ever saw a win go up.
    const last = results[0] || null;
    const lastBets = last ? await betsFor(last.id) : [];
    const shouts = lastBets
      .filter((b) => b.payout != null && worthShouting(b, b.payout))
      .map((b) => ({ who: b.who, payout: b.payout, kind: b.kind, value: b.value }));

    return Response.json({
      me: { id: user.uid, coins },
      round: round && {
        id: String(round.id),
        closesAt: round.closes_at,
      },
      // The wheel animates the round that just FINISHED, not the one taking
      // bets — an open round has no result by definition, so reading the
      // result off it meant the wheel never turned at all.
      //
      // These two facts are the whole of the shared-table claim: every client
      // computes the same final angle from the same settled row.
      lastSpin: last
        ? { roundId: String(last.id), result: last.result, settledAt: last.settled_at, shouts }
        : null,
      spinMs: SPIN_MS,
      results: results.map((r) => ({ id: String(r.id), result: r.result, settledAt: r.settled_at })),
      bets: bets.map((b) => ({ ...b, id: String(b.id), accountId: b.account_id })),
      chat: chat.map((c) => ({ ...c, id: String(c.id) })),
      players,
      serverNow: new Date().toISOString(),
    });
  } catch (e) {
    return jsonError(e, "Could not read the table.");
  }
}
