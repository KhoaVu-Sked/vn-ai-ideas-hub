// Called from write routes. Fire-and-forget: a failed publish costs a live
// update, never the write itself.

import { after } from "next/server";
import { headers } from "next/headers";
import { CHANNEL, encode, BOARD } from "./channel";
import { publisher } from "./redis";

function send(scope, kind) {
  // Nothing in here may throw. It is called synchronously inside route
  // handlers, so an exception would be caught by the route's own try/catch and
  // returned as a 500 — failing a write that had already succeeded, and making
  // the client revert a change the database had accepted.
  try {
    trySend(scope, kind);
  } catch (e) {
    console.error("realtime publish skipped:", e.message);
  }
}

function trySend(scope, kind) {
  const p = publisher();
  if (!p) return;                                  // realtime not configured

  // headers() is called HERE, while we are still in the request, and only
  // awaited later. Reading it inside the after() callback was unreliable — the
  // origin came back null, so tabs stopped recognising their own pings and
  // refetched changes they had already applied.
  const originP = Promise.resolve(headers())
    .then((h) => h.get("x-client-id"))
    .catch(() => null);

  // Deferred so the publish cannot outrun the commit, and so the invocation
  // stays alive long enough for it to flush. Callers therefore must NOT wrap
  // these in after() themselves — nesting would drop the callback.
  after(async () => {
    try {
      await p.publish(CHANNEL, encode(scope, kind, await originP));
    } catch (e) {
      console.error("realtime publish failed:", e.message);
    }
  });
}

// Something inside one idea changed — a task moved, a comment landed.
export const publishIdea = (ideaId, kind) => send(String(ideaId), kind);

// The board's own list changed — an idea was created, or its status moved.
export const publishBoard = (kind) => send(BOARD, kind);
