"use client";

// Break-glass admin sign-in. Not linked from anywhere and deliberately plain —
// the point is a way in that doesn't depend on Google being configured. The API
// only accepts admin accounts here, so a member's old password won't work.

import { useState } from "react";
import SkeduloMark from "@/components/SkeduloMark";
import { APP_NAME } from "@/lib/brand";

export default function AdminLoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e?.preventDefault();
    if (!username.trim() || !password) {
      setErr("Enter your username and password.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Sign-in failed (${res.status})`);
      // Full load: the session provider sits in the root layout and wouldn't
      // refetch on a client-side navigation.
      window.location.href = "/";
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--navy)", padding: 20 }}>
      <form
        onSubmit={submit}
        style={{ background: "#fff", borderRadius: 14, padding: 28, width: 360, boxShadow: "0 20px 60px rgba(10,22,44,0.35)" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: "var(--header-blue)", display: "flex", alignItems: "center", justifyContent: "center" }}><SkeduloMark size={20} /></div>
          <span style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 18, color: "var(--ink)" }}>{APP_NAME}</span>
        </div>
        <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 18 }}>Administrator sign-in</div>

        <label style={{ fontSize: 12, fontWeight: 600, color: "#5a6a82" }}>Username or email</label>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoFocus
          autoComplete="username"
          style={{ width: "100%", margin: "6px 0 14px", padding: "10px 12px", border: "1px solid #d5dce6", borderRadius: 8, fontSize: 13.5, outline: "none" }}
        />

        <label style={{ fontSize: 12, fontWeight: 600, color: "#5a6a82" }}>Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          style={{ width: "100%", margin: "6px 0 16px", padding: "10px 12px", border: "1px solid #d5dce6", borderRadius: 8, fontSize: 13.5, outline: "none" }}
        />

        {err && <div style={{ fontSize: 12.5, color: "#e03131", marginBottom: 12 }}>{err}</div>}

        <button
          type="submit"
          disabled={busy}
          style={{ width: "100%", padding: "11px 0", borderRadius: 9, border: "none", background: busy ? "#7b96ea" : "var(--blue)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: busy ? "wait" : "pointer" }}
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>

        <div style={{ fontSize: 12, color: "var(--faint)", marginTop: 14, textAlign: "center" }}>
          Everyone else signs in with Google at <a href="/login" style={{ color: "var(--blue)", fontWeight: 600 }}>/login</a>.
        </div>
      </form>
    </div>
  );
}
