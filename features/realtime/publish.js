// Called from write routes after a change lands. Fire-and-forget: a failed
// publish costs a live update, never the write itself.

import { CHANNEL, encode, BOARD } from "./channel";
import { publisher } from "./redis";

function send(scope, kind) {
  const p = publisher();
  if (!p) return;                                  // realtime not configured
  p.publish(CHANNEL, encode(scope, kind)).catch((e) =>
    console.error("realtime publish failed:", e.message));
}

// Something inside one idea changed — a task moved, a comment landed.
export const publishIdea = (ideaId, kind) => send(String(ideaId), kind);

// The board's own list changed — an idea was created, or its status moved.
export const publishBoard = (kind) => send(BOARD, kind);
