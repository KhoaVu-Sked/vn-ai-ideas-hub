// One Redis channel for the whole app, not one per idea.
//
// Every instance receives every message and drops the ones it has no sockets
// for. That is wasteful in principle and free in practice at this size — a
// handful of concurrent users generating a message per write. Per-idea channels
// would mean SUBSCRIBE/UNSUBSCRIBE churn on every navigation for no gain.
// Revisit if this ever carries thousands of connections.
export const CHANNEL = "hub:changes";

// The message is deliberately only an id and a kind. No idea content crosses
// Redis, and a client can never learn something the API would not have told it:
// the ping just prompts a normal, authenticated refetch. It also means the
// payload shape can't drift between two deployments that are briefly live at
// the same time.
export const BOARD = "board";           // list-level: new idea, status moved

export const encode = (scope, kind) => JSON.stringify({ scope, kind });
export function decode(raw) {
  try {
    const m = JSON.parse(raw);
    return m && typeof m.scope === "string" ? m : null;
  } catch { return null; }
}
