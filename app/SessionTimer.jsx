"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

// Idle session management:
//  • Slides the session (re-issues the 30-min cookie) while the user is active.
//  • At 25 min idle, shows a "stay or log out" modal.
//  • At 30 min idle, logs out automatically.
const WARN_AT = 25 * 60 * 1000;
const LOGOUT_AT = 30 * 60 * 1000;
const REFRESH_EVERY = 20 * 60 * 1000;

export default function SessionTimer() {
  const pathname = usePathname();
  const active = pathname !== "/login";
  const [warn, setWarn] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const lastActivity = useRef(Date.now());
  const lastRefresh = useRef(Date.now());
  const warnRef = useRef(false);

  useEffect(() => {
    if (!active) return;
    warnRef.current = false;
    setWarn(false);
    lastActivity.current = Date.now();
    lastRefresh.current = Date.now();

    // Activity resets the idle clock — but not once the warning is up (the user
    // must explicitly choose Stay).
    const onActivity = () => { if (!warnRef.current) lastActivity.current = Date.now(); };
    const events = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"];
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));

    const refresh = () => fetch("/api/auth/refresh", { method: "POST" }).catch(() => {});
    const logout = async () => {
      try { await fetch("/api/auth/logout", { method: "POST" }); } finally { window.location.href = "/login"; }
    };

    const tick = setInterval(() => {
      const idle = Date.now() - lastActivity.current;
      if (idle >= LOGOUT_AT) { logout(); return; }
      if (idle >= WARN_AT) {
        warnRef.current = true;
        setWarn(true);
        setRemaining(Math.ceil((LOGOUT_AT - idle) / 1000));
      } else {
        if (warnRef.current) { warnRef.current = false; setWarn(false); }
        if (Date.now() - lastRefresh.current >= REFRESH_EVERY) { lastRefresh.current = Date.now(); refresh(); }
      }
    }, 1000);

    return () => { clearInterval(tick); events.forEach((e) => window.removeEventListener(e, onActivity)); };
  }, [active]);

  if (!active || !warn) return null;

  const stay = () => {
    lastActivity.current = Date.now();
    lastRefresh.current = Date.now();
    warnRef.current = false;
    setWarn(false);
    fetch("/api/auth/refresh", { method: "POST" }).catch(() => {});
  };
  const logoutNow = async () => {
    try { await fetch("/api/auth/logout", { method: "POST" }); } finally { window.location.href = "/login"; }
  };
  const mm = String(Math.floor(remaining / 60)).padStart(1, "0");
  const ss = String(remaining % 60).padStart(2, "0");

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(10,22,44,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
      <div style={{ background: "#fff", borderRadius: 14, padding: 24, width: 340, boxShadow: "0 20px 60px rgba(10,22,44,0.35)", textAlign: "center" }}>
        <div style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 18, color: "var(--ink)", marginBottom: 8 }}>Still there?</div>
        <div style={{ fontSize: 13, color: "var(--body)", lineHeight: 1.5, marginBottom: 4 }}>
          You&apos;ve been inactive. For security you&apos;ll be signed out in
        </div>
        <div style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 22, color: "var(--blue)", marginBottom: 16 }}>{mm}:{ss}</div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={logoutNow} style={{ flex: 1, padding: "10px 0", borderRadius: 9, border: "1px solid #d5dce6", background: "#fff", fontSize: 13, fontWeight: 700, color: "#44536b", cursor: "pointer" }}>Log out</button>
          <button onClick={stay} style={{ flex: 1, padding: "10px 0", borderRadius: 9, border: "none", background: "var(--blue)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Stay signed in</button>
        </div>
      </div>
    </div>
  );
}
