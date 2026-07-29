"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import SkeduloMark from "../SkeduloMark";
import { APP_NAME } from "@/lib/brand";

export default function LoginPage() {
  return <Suspense fallback={null}><LoginForm /></Suspense>;
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [resetDone, setResetDone] = useState(false);
  useEffect(() => { if (searchParams.get("reset") === "1") setResetDone(true); }, [searchParams]);
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
      router.replace("/");
      router.refresh();
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

        {resetDone && (
          <div style={{ background: "#ebf6ed", border: "1px solid #bde2c5", color: "#2f7a43", borderRadius: 8, padding: "9px 12px", fontSize: 12.5, fontWeight: 600, marginBottom: 14 }}>
            ✓ Password updated — sign in with your new password.
          </div>
        )}
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
        <div style={{ fontSize: 12.5, marginTop: 14, textAlign: "center" }}>
          <Link href="/forgot" style={{ color: "var(--blue)", fontWeight: 700 }}>Forgot your password?</Link>
        </div>
        <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 8, textAlign: "center" }}>
          New here? <Link href="/register" style={{ color: "var(--blue)", fontWeight: 700 }}>Create an account</Link>
        </div>
      </form>
    </div>
  );
}
