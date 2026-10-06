// Telling every table the state moved. Server side only.
//
// Redis accelerates; it does not decide. Postgres holds the round, so a push
// that never arrives costs a few seconds of lag rather than a stuck game — the
// client polls as well. This layer has previously looked alive in this project
// while delivering nothing, which is why nothing depends on it.

import { publishIdea } from "@/features/realtime/publish";
import { GAME_SCOPE } from "@/features/game/scope";

// Reuses the ideas publisher: same channel, a scope of its own, so nothing
// already subscribed starts receiving game traffic.
export function publishGame(kind) {
  try {
    publishIdea(GAME_SCOPE, kind);
  } catch (e) {
    console.error("game publish skipped:", e.message);
  }
}
