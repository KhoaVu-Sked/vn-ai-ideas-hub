"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import SkeduloMark from "../SkeduloMark";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e?.preventDefault();
    if (!name.trim() || !email.trim() || !password) { setErr("Fill in every field."); return; }
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Sign-up failed (${res.status})`);
      router.replace("/");
      router.refresh();
    } catch (e) { setErr(e.message); setBusy(false); }
  };

  const label = { fontSize: 12, fontWeight: 600, color: "#5a6a82" };
  const field = { width: "100%", margin: "6px 0 14px", padding: "10px 12px", border: "1px solid #d5dce6", borderRadius: 8, fontSize: 13.5, outline: "none" };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--navy)", padding: 20 }}>
      <form onSubmit={submit} style={{ background: "#fff", borderRadius: 14, padding: 28, width: 360, boxShadow: "0 20px 60px rgba(10,22,44,0.35)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: "var(--header-blue)", display: "flex", alignItems: "center", justifyContent: "center" }}><SkeduloMark size={20} /></div>
          <span style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 18, color: "var(--ink)" }}>Create your account</span>
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 16 }}>Sign up with your <b>@skedulo.com</b> email.</div>

        <label style={label}>Full name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} autoFocus autoComplete="name" style={field} />

        <label style={label}>Email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@skedulo.com" autoComplete="email" style={field} />

        <label style={label}>Password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" placeholder="at least 6 characters" style={field} />

        {err && <div style={{ fontSize: 12.5, color: "#e03131", marginBottom: 12 }}>{err}</div>}

        <button type="submit" disabled={busy} style={{ width: "100%", padding: "11px 0", borderRadius: 9, border: "none", background: busy ? "#7b96ea" : "var(--blue)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: busy ? "wait" : "pointer" }}>
          {busy ? "Creating…" : "Create account"}
        </button>
        <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 14, textAlign: "center" }}>
          Already have an account? <Link href="/login" style={{ color: "var(--blue)", fontWeight: 700 }}>Sign in</Link>
        </div>
      </form>
    </div>
  );
}
