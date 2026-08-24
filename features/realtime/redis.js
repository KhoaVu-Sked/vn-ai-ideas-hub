// Redis connections, created lazily and shared for the life of the instance.
//
// Realtime is optional by design: with no REDIS_URL the helpers below become
// no-ops, the WebSocket route refuses to upgrade, and the client falls back to
// refetch-on-focus. Nothing else in the app notices. That is what makes this
// safe to deploy before the Redis add-on exists, and what makes removing the
// env var a working kill switch.

import Redis from "ioredis";
import { attachDatabasePool } from "@vercel/functions";
import { CHANNEL, decode } from "./channel";

export const realtimeConfigured = () => Boolean(process.env.REDIS_URL);

// Must never throw. A malformed REDIS_URL makes `new Redis()` throw
// synchronously, and this is called from inside route handlers — so a bad
// realtime config would surface as a 500 on a write that actually succeeded.
function connect() {
  try {
    return build();
  } catch (e) {
    if (!warned) { warned = true; console.error("redis unavailable, realtime disabled:", e.message); }
    return null;
  }
}
let warned = false;

function build() {
  const client = new Redis(process.env.REDIS_URL, {
    // A hung Redis must never hold up an HTTP response. Fail fast and let the
    // write succeed without a ping rather than time the request out.
    maxRetriesPerRequest: 2,
    connectTimeout: 3000,
    lazyConnect: false,
  });
  client.on("error", (e) => console.error("redis:", e.message));
  attachDatabasePool(client);   // Fluid: release idle clients before suspend
  return client;
}

let pub, pubFailed = false;
export function publisher() {
  if (!realtimeConfigured() || pubFailed) return null;
  if (!pub) {
    pub = connect();
    if (!pub) pubFailed = true;       // don't retry a broken config every write
  }
  return pub;
}

// A subscribed Redis connection cannot issue other commands, so the subscriber
// has to be its own connection. One per instance, shared by every socket it
// holds.
let sub;
const listeners = new Set();

export function onMessage(fn) {
  if (!realtimeConfigured()) return () => {};
  if (!sub) {
    sub = connect();
    if (!sub) return () => {};
    sub.subscribe(CHANNEL, (err) => {
      if (err) console.error("redis subscribe failed:", err.message);
    });
    sub.on("message", (_channel, raw) => {
      const msg = decode(raw);
      if (!msg) return;
      for (const l of listeners) {
        try { l(msg); } catch (e) { console.error("realtime listener:", e.message); }
      }
    });
  }
  listeners.add(fn);
  return () => listeners.delete(fn);
}
