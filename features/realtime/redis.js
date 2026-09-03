// Redis connections, created lazily and shared for the life of the instance.
//
// Realtime is optional by design: with no REDIS_URL — or with Redis
// unreachable — the helpers below become no-ops, the WebSocket route refuses to
// upgrade, and the client falls back to refetch-on-focus. Nothing else notices.

import Redis from "ioredis";
import { CHANNEL, decode } from "./channel";

// Marketplace integrations disagree on the name: Upstash and Redis Cloud set
// REDIS_URL, the older Vercel KV store sets KV_URL. Accept either, so nobody has
// to hand-copy a value between two variables and redeploy to find out.
const redisUrl = () => process.env.REDIS_URL || process.env.KV_URL || "";

export const realtimeConfigured = () => Boolean(redisUrl());

let warned = false;
function warn(msg) {
  if (warned) return;
  warned = true;
  console.error("realtime disabled:", msg);
}

// NOT attachDatabasePool: that helper duck-types connection *pools* and throws
// "Unsupported database pool type" for an ioredis client, which is a single
// connection. Calling it meant every publish was silently a no-op and every
// socket leaked a live Redis connection.
function connect(label) {
  let client;
  try {
    client = new Redis(redisUrl(), {
      // A hung Redis must never hold up an HTTP response.
      maxRetriesPerRequest: 2,
      connectTimeout: 3000,
      enableOfflineQueue: false,   // fail fast instead of buffering forever
    });
  } catch (e) {
    warn(`${label} could not be created — ${e.message}`);
    return null;
  }
  // An error event with no listener is an uncaught exception in Node.
  client.on("error", (e) => console.error(`redis ${label}:`, e.message));
  return client;
}

let pub, pubFailed = false;
export function publisher() {
  if (!realtimeConfigured() || pubFailed) return null;
  if (!pub) {
    pub = connect("publisher");
    if (!pub) { pubFailed = true; return null; }
  }
  return pub;
}

// A subscribed Redis connection cannot issue other commands, so the subscriber
// is its own connection. One per instance, shared by every socket it holds.
let sub, subFailed = false;
const listeners = new Set();

// True only when this instance can actually receive fan-out. The socket route
// checks it: a connection that can never deliver anything is worse than none,
// because the client sits there believing it is live.
export const canReceive = () => Boolean(realtimeConfigured() && !subFailed);

export function onMessage(fn) {
  if (!realtimeConfigured() || subFailed) return () => {};
  if (!sub) {
    const client = connect("subscriber");
    if (!client) { subFailed = true; return () => {}; }
    sub = client;
    sub.subscribe(CHANNEL, (err) => {
      if (err) {
        subFailed = true;
        warn(`subscribe failed — ${err.message}`);
        try { client.disconnect(); } catch {}
        if (sub === client) sub = null;
      }
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
