// Holding the result back until the wheel has finished turning.
//
// The server settles a round, pays every bet and opens the next one in a single
// statement, so a client that refetches immediately learns the number before
// the wheel has turned a degree — the board, the balances and the announcement
// all land first and the spin becomes a replay of something already known.
//
// The fix is not to slow the server down; every screen must still agree on the
// same settled row. It is to freeze what THIS screen draws until THIS screen's
// wheel stops. The hold is measured from the moment the payload arrives, not
// from the server's settled_at, because the animation starts on arrival and
// the two clocks are not the same one.

// A beat after the wheel stops, so the board never updates first.
export const REVEAL_PAD_MS = 250;

// How long the screen holds the old numbers: exactly one spin, plus the beat.
export const holdMs = (spinMs) => Number(spinMs) + REVEAL_PAD_MS;

export const spinIdOf = (payload) => payload?.lastSpin?.settledAt ?? null;

// True when a payload carries a spin this screen has not shown yet.
//
// `seen` is undefined until the first payload lands. A page opened mid-spin has
// nothing to hold and no stale board to protect, so it shows what is already
// true rather than inventing a six-second lag out of nothing.
export function isNewSpin(seen, payload) {
  if (seen === undefined) return false;
  const at = spinIdOf(payload);
  return Boolean(at) && at !== seen;
}

// What the screen draws: the frozen snapshot while the wheel turns, the live
// payload otherwise.
//
// Chat is the one thing never frozen. People talk through a spin, and a message
// that disappears for six seconds after being sent reads as a bug, not a delay.
export function tableView(live, held) {
  if (!live) return null;
  if (!held?.snapshot) return live;
  return { ...held.snapshot, chat: live.chat, spinMs: live.spinMs };
}

// Which announcements to raise, given the spin the screen last announced.
//
// Returns null when nothing has changed, otherwise { at, raise }: the spin now
// being announced and the wins to float. `last` is undefined until the first
// payload has rendered, and that render adopts whatever is already on the table
// without replaying it — you should not walk in to someone else's win.
//
// The null-vs-undefined distinction is the whole point. A table that has never
// spun renders with `at` null, which must be ADOPTED, not left as undefined —
// otherwise the first real spin still looks like the first render and its
// winner never gets announced at all.
export function shoutsToRaise(last, spin) {
  const at = spin?.settledAt ?? null;
  if (last === undefined) return { at, raise: [] };
  if (at === last) return null;
  return { at, raise: spin?.shouts || [] };
}
