"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import SkeduloMark from "../SkeduloMark";
import { APP_NAME } from "@/lib/brand";
import { PASSWORD_LOGIN } from "@/lib/authMode";

export default function LoginPage() {
  return <Suspense fallback={null}><LoginForm /></Suspense>;
}

function LoginForm() {
  const searchParams = useSearchParams();
  const [resetDone, setResetDone] = useState(false);
  // Why they landed here, when it wasn't their own doing.
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (searchParams.get("reset") === "1") setResetDone(true);
    const sso = searchParams.get("sso");
    if (sso) setNotice({
      unconfigured: PASSWORD_LOGIN
        ? "Google sign-in isn't set up yet. Use your username and password."
        : "Google sign-in isn't set up yet — ask an admin to finish configuring it.",
      domain: "Sign in with your @skedulo.com Google account.",
      cancelled: "Google sign-in was cancelled.",
      state: "That sign-in attempt expired. Please try again.",
    }[sso] || "Google sign-in didn't work. Please try again.");
    else if (searchParams.get("changed") === "1") setNotice("Password changed. Sign in with your new one.");
    else if (searchParams.get("ended") === "1") setNotice("Your session ended — you signed in on another device, or your password changed.");
  }, [searchParams]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e?.preventDefault();
    if (!PASSWORD_LOGIN) return;
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
      // Full load, not router.replace: the session provider lives in the root
      // layout and wouldn't refetch on a client-side navigation.
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
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: "var(--header-blue)", display: "flex", alignItems: "center", justifyContent: "center" }}><SkeduloMark size={20} /></div>
          <span style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 18, color: "var(--ink)" }}>{APP_NAME}</span>
        </div>

        {notice && !resetDone && (
          <div style={{ background: "#fcf1e8", border: "1px solid #f4c8a4", color: "#9f5314", borderRadius: 8, padding: "9px 12px", fontSize: 12.5, fontWeight: 600, marginBottom: 14 }}>
            {notice}
          </div>
        )}
        {resetDone && (
          <div style={{ background: "#ebf6ed", border: "1px solid #bde2c5", color: "#2f7a43", borderRadius: 8, padding: "9px 12px", fontSize: 12.5, fontWeight: 600, marginBottom: 14 }}>
            ✓ Password updated — sign in with your new password.
          </div>
        )}
        {err && <div style={{ fontSize: 12.5, color: "#e03131", marginBottom: 12 }}>{err}</div>}

        {PASSWORD_LOGIN && (<>
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

          <button
            type="submit"
            disabled={busy}
            style={{ width: "100%", padding: "11px 0", borderRadius: 9, border: "none", background: busy ? "#7b96ea" : "var(--blue)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: busy ? "wait" : "pointer" }}
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </>)}

        {PASSWORD_LOGIN ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "16px 0" }}>
            <span style={{ flex: 1, height: 1, background: "#e4e7ed" }} />
            <span style={{ fontSize: 11, color: "var(--faint)", fontWeight: 600 }}>OR</span>
            <span style={{ flex: 1, height: 1, background: "#e4e7ed" }} />
          </div>
        ) : (
          <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 16px", lineHeight: 1.5 }}>
            Sign in with your Skedulo Google account. There's no separate password to remember.
          </p>
        )}

        <a
          href="/api/auth/google"
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
            width: "100%", padding: "10px 0", borderRadius: 9, border: "1px solid #d5dce6",
            background: "#fff", color: "#3a4a63", fontSize: 14, fontWeight: 700,
            textDecoration: "none", boxSizing: "border-box",
          }}
        >
          <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-2.8-.4-4H24v7.6h11.9c-.2 2-1.5 5-4.4 7l-.1.3 6.4 5 .4.1c4.1-3.8 6.9-9.4 6.9-16z"/>
            <path fill="#34A853" d="M24 46c5.9 0 10.9-1.9 14.5-5.3l-6.9-5.3c-1.8 1.3-4.3 2.2-7.6 2.2-5.8 0-10.7-3.8-12.5-9.1l-.3.1-6.6 5.1-.1.3C7.6 41 15.2 46 24 46z"/>
            <path fill="#FBBC05" d="M11.5 28.5c-.5-1.4-.7-2.9-.7-4.5s.3-3.1.7-4.5v-.3l-6.9-5.3-.2.1C2.8 17.1 2 20.4 2 24s.8 6.9 2.4 10l7.1-5.5z"/>
            <path fill="#EA4335" d="M24 10.2c4.1 0 6.9 1.8 8.5 3.3l6.2-6C34.9 4 29.9 2 24 2 15.2 2 7.6 7 4.4 14l7.1 5.5c1.8-5.3 6.7-9.3 12.5-9.3z"/>
          </svg>
          Continue with Google
        </a>

        {PASSWORD_LOGIN ? (<>
          <div style={{ fontSize: 12.5, marginTop: 14, textAlign: "center" }}>
            <Link href="/forgot" style={{ color: "var(--blue)", fontWeight: 700 }}>Forgot your password?</Link>
          </div>
          <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 8, textAlign: "center" }}>
            New here? <Link href="/register" style={{ color: "var(--blue)", fontWeight: 700 }}>Create an account</Link>
          </div>
        </>) : (
          <div style={{ fontSize: 12, color: "var(--faint)", marginTop: 14, textAlign: "center" }}>
            First time? Signing in creates your account.
          </div>
        )}
      </form>
    </div>
  );
}
