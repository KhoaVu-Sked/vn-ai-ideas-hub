"use client";

// A single socket for the whole tab, shared by every component that wants live
// updates. One connection with two subscriptions, not two connections.
//
// Everything here degrades to nothing: if the endpoint refuses (no Redis
// configured, or the experimental upgrade API breaks), we stop trying and the
// app keeps working on refetch-on-focus alone. Realtime is an improvement on
// the existing behaviour, never a dependency of it.

import { endSession } from "@/lib/apiClient";

const scopes = new Map();      // scope -> Set<callback>
let socket = null;
let retry = 0;
let giveUp = false;            // endpoint said no — stop asking
let idleTimer = null;
let reconnectTimer = null;
let replacing = false;         // a make-before-break swap is in flight

const url = () =>
  `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/ws`;

function open() {
  if (giveUp || socket || typeof WebSocket === "undefined") return;
  let ws;
  try { ws = new WebSocket(url()); } catch { return; }
  socket = ws;

  ws.onopen = () => {
    retry = 0;
    replacing = false;
    for (const scope of scopes.keys()) {
      ws.send(JSON.stringify({ type: "subscribe", scope }));
    }
  };

  ws.onmessage = (e) => {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }

    if (msg.type === "changed") {
      for (const cb of scopes.get(msg.scope) || []) cb(msg.kind);
      return;
    }
    // Open the replacement while this one is still delivering, so there is no
    // window where a change could be missed.
    if (msg.type === "closing-soon" && !replacing) {
      replacing = true;
      const old = socket;
      socket = null;
      open();
      setTimeout(() => { try { old.close(1000, "replaced"); } catch {} }, 5000);
      return;
    }
    if (msg.type === "session-ended") {
      giveUp = true;
      endSession();
    }
  };

  ws.onclose = (e) => {
    if (socket === ws) socket = null;
    if (replacing || giveUp) return;
    // 1008/4001 and friends are deliberate refusals — retrying won't help.
    if (e.code === 4001) { giveUp = true; return; }
    schedule();
  };

  // A failed handshake (503 when Redis isn't configured) lands here. Back off
  // hard rather than hammering an endpoint that is telling us no.
  ws.onerror = () => { if (retry >= 4) giveUp = true; };
}

function schedule() {
  if (giveUp || reconnectTimer || !scopes.size) return;
  // Jitter matters: a deploy closes every socket at once, and without it every
  // client reconnects and refetches in the same instant.
  const base = Math.min(1000 * 2 ** retry, 30_000);
  const wait = base * (0.5 + Math.random() / 2);
  retry += 1;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (document.visibilityState === "visible") open();
  }, wait);
}

// An abandoned tab should not hold a connection open and bill for it. Focus
// brings it back, and the caller's own refetch-on-focus covers the gap.
function watchVisibility() {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      idleTimer = setTimeout(() => {
        try { socket?.close(1000, "idle"); } catch {}
        socket = null;
      }, 120_000);
    } else {
      clearTimeout(idleTimer);
      retry = 0;
      if (scopes.size) open();
    }
  });
}
let watching = false;

export function subscribe(scope, cb) {
  if (!watching) { watching = true; watchVisibility(); }
  if (!scopes.has(scope)) scopes.set(scope, new Set());
  scopes.get(scope).add(cb);

  if (!socket) open();
  else if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: "subscribe", scope }));
  }

  return () => {
    const set = scopes.get(scope);
    set?.delete(cb);
    if (set && set.size === 0) {
      scopes.delete(scope);
      try { socket?.send(JSON.stringify({ type: "unsubscribe", scope })); } catch {}
    }
    if (scopes.size === 0) {
      try { socket?.close(1000, "no subscribers"); } catch {}
      socket = null;
    }
  };
}
