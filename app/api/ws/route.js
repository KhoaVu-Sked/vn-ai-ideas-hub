import { experimental_upgradeWebSocket } from "@vercel/functions";
import { getUser } from "@/features/auth/guard";
import { getSessionId } from "@/features/auth/queries";
import { onMessage, realtimeConfigured } from "@/features/realtime/redis";

// Sockets are pinned to one instance for their lifetime, and instances don't
// share memory — so a change published by whichever instance handled the write
// reaches everyone via Redis, not via this file.
//
// The connection dies when the function hits its maximum duration. That is
// expected: the client reconnects, and it is told in advance so it can open the
// next connection before this one closes.
export const maxDuration = 300;

const LIFETIME_MS = (maxDuration - 15) * 1000;   // warn with time to reconnect
const SESSION_RECHECK_MS = 60_000;

export async function GET(request) {
  // No Redis means no fan-out, and a socket that can never deliver anything is
  // worse than none — the client would sit there believing it is live. Refuse,
  // and let it fall back to refetch-on-focus.
  if (!realtimeConfigured()) {
    return new Response("realtime is not configured", { status: 503 });
  }

  // The upgrade arrives as an ordinary GET carrying the session cookie, so it
  // authenticates exactly like every other route. Nothing is upgraded for a
  // signed-out caller.
  const user = await getUser();
  if (!user) return new Response("unauthorized", { status: 401 });

  return experimental_upgradeWebSocket((ws) => {
    // Which scopes this socket cares about — an idea id, or "board".
    const scopes = new Set();
    let closed = false;

    const stopListening = onMessage((msg) => {
      if (closed || !scopes.has(msg.scope)) return;
      send({ type: "changed", scope: msg.scope, kind: msg.kind, origin: msg.origin });
    });

    function send(obj) {
      try { ws.send(JSON.stringify(obj)); } catch { /* socket already gone */ }
    }

    // This app allows one live session per account: signing in elsewhere
    // retires the old one. An already-open socket would otherwise outlive that
    // and keep feeding a revoked session.
    const recheck = setInterval(async () => {
      try {
        if ((await getSessionId(user.uid)) !== user.sid) {
          send({ type: "session-ended" });
          ws.close(4001, "session ended");
        }
      } catch { /* transient DB error — try again next tick */ }
    }, SESSION_RECHECK_MS);

    // Make-before-break: tell the client to open its replacement while this
    // connection is still carrying messages, so there is no gap.
    const expiring = setTimeout(() => send({ type: "closing-soon" }), LIFETIME_MS);

    ws.on("message", (raw) => {
      let msg;
      try { msg = JSON.parse(String(raw)); } catch { return; }
      if (msg?.type === "subscribe" && typeof msg.scope === "string") {
        // Subscribing is not an authorisation decision: a scope only ever
        // yields "something changed", and the refetch it triggers is
        // authenticated on its own.
        scopes.add(msg.scope);
        send({ type: "subscribed", scope: msg.scope });
      } else if (msg?.type === "unsubscribe") {
        scopes.delete(msg.scope);
      } else if (msg?.type === "ping") {
        send({ type: "pong" });
      }
    });

    ws.on("close", () => {
      closed = true;
      stopListening();
      clearInterval(recheck);
      clearTimeout(expiring);
    });
  });
}
