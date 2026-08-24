// Called from write routes after a change lands. Fire-and-forget: a failed
// publish costs a live update, never the write itself.

import { headers } from "next/headers";
import { CHANNEL, encode, BOARD } from "./channel";
import { publisher } from "./redis";

// Read the caller's tab id here rather than threading it through thirty route
// handlers. after() runs inside the request's async context, so the headers are
// still reachable; if that ever stops being true we lose sender-exclusion, not
// correctness, so it fails soft.
async function originTab() {
  try { return (await headers()).get("x-client-id") || null; }
  catch { return null; }
}

async function send(scope, kind) {
  const p = publisher();
  if (!p) return;                                  // realtime not configured
  try {
    await p.publish(CHANNEL, encode(scope, kind, await originTab()));
  } catch (e) {
    console.error("realtime publish failed:", e.message);
  }
}

// Something inside one idea changed — a task moved, a comment landed.
export const publishIdea = (ideaId, kind) => send(String(ideaId), kind);

// The board's own list changed — an idea was created, or its status moved.
export const publishBoard = (kind) => send(BOARD, kind);
