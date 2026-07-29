"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import SkeduloMark from "../SkeduloMark";

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState("details");   // details → verify
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [notice, setNotice] = useState(false);   // "check your inbox and spam" popup
  const [ttl, setTtl] = useState(10);
  const [secondsLeft, setSecondsLeft] = useState(0);

  // Countdown so people can see the code is time-limited.
  useEffect(() => {
    if (step !== "verify" || secondsLeft <= 0) return;
    const t = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [step, secondsLeft]);

  const post = async (path, body) => {
    const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  };

  const sendCode = async (e) => {
    e?.preventDefault();
    if (!name.trim() || !email.trim() || !password) { setErr("Fill in every field."); return; }
    setBusy(true); setErr("");
    try {
      const d = await post("/api/auth/register", { name: name.trim(), email: email.trim(), password });
      setTtl(d.expiresInMinutes || 10);
      setSecondsLeft((d.expiresInMinutes || 10) * 60);
      setNotice(true);            // popup: check inbox AND spam
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const verify = async (e) => {
    e?.preventDefault();
    setBusy(true); setErr("");
    try {
      await post("/api/auth/register/verify", { email: email.trim(), code: code.trim() });
      router.replace("/");
      router.refresh();
    } catch (e) { setErr(e.message); setBusy(false); }
  };

  const resend = async () => {
    setBusy(true); setErr(""); setCode("");
    try {
      const d = await post("/api/auth/register", { name: name.trim(), email: email.trim(), password });
      setSecondsLeft((d.expiresInMinutes || 10) * 60);
      setNotice(true);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const label = { fontSize: 12, fontWeight: 600, color: "#5a6a82" };
  const field = { width: "100%", margin: "6px 0 14px", padding: "10px 12px", border: "1px solid #d5dce6", borderRadius: 8, fontSize: 13.5, outline: "none" };
  const primary = (on) => ({ width: "100%", padding: "11px 0", borderRadius: 9, border: "none", background: on ? "#7b96ea" : "var(--blue)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: on ? "wait" : "pointer" });
  const mmss = `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}`;

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--navy)", padding: 20 }}>
      <div style={{ background: "#fff", borderRadius: 14, padding: 28, width: 380, boxShadow: "0 20px 60px rgba(10,22,44,0.35)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: "var(--header-blue)", display: "flex", alignItems: "center", justifyContent: "center" }}><SkeduloMark size={20} /></div>
          <span style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 18, color: "var(--ink)" }}>Create your account</span>
        </div>

        {step === "details" ? (
          <form onSubmit={sendCode}>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 16 }}>
              Sign up with your <b>@skedulo.com</b> email. We&apos;ll send a code to confirm it&apos;s yours.
            </div>

            <label style={label}>Full name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} autoFocus autoComplete="name" style={field} />

            <label style={label}>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@skedulo.com" autoComplete="email" style={field} />

            <label style={label}>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" placeholder="at least 6 characters" style={field} />

            {err && <div style={{ fontSize: 12.5, color: "#d53c30", marginBottom: 12 }}>{err}</div>}

            <button type="submit" disabled={busy} style={primary(busy)}>{busy ? "Sending…" : "Send code"}</button>
          </form>
        ) : (
          <form onSubmit={verify}>
            <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 16, lineHeight: 1.6 }}>
              Enter the 6-digit code we sent to <b style={{ color: "var(--ink)" }}>{email.trim()}</b>.
              {secondsLeft > 0
                ? <> It expires in <b style={{ color: "var(--ink)" }}>{mmss}</b>.</>
                : <> <b style={{ color: "#d53c30" }}>The code has expired</b> — send a new one.</>}
            </div>
            <label style={label}>Verification code</label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric" autoComplete="one-time-code" placeholder="123456" autoFocus
              style={{ ...field, letterSpacing: 8, fontSize: 20, fontWeight: 700, textAlign: "center", fontFamily: "ui-monospace, Menlo, monospace" }}
            />
            {err && <div style={{ fontSize: 12.5, color: "#d53c30", marginBottom: 12 }}>{err}</div>}
            <button type="submit" disabled={busy || code.length !== 6} style={primary(busy)}>{busy ? "Verifying…" : "Verify and create account"}</button>
            <button type="button" onClick={resend} disabled={busy} style={{ width: "100%", marginTop: 8, padding: "9px 0", borderRadius: 9, border: "1px solid #d5dce6", background: "#fff", color: "#44536b", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              Send a new code
            </button>
            <button type="button" onClick={() => { setStep("details"); setCode(""); setErr(""); }} style={{ width: "100%", marginTop: 8, padding: "9px 0", borderRadius: 9, border: "none", background: "none", color: "var(--muted)", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
              Use a different email
            </button>
          </form>
        )}

        <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 14, textAlign: "center" }}>
          Already have an account? <Link href="/login" style={{ color: "var(--blue)", fontWeight: 700 }}>Sign in</Link>
        </div>
      </div>

      {/* Check your inbox — and your spam folder */}
      {notice && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(10,22,44,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20 }}>
          <div style={{ background: "#fff", borderRadius: 14, padding: 26, width: 380, maxWidth: "100%", boxShadow: "0 20px 60px rgba(10,22,44,0.35)" }}>
            <div style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 17, color: "var(--ink)", marginBottom: 8 }}>Check your email</div>
            <div style={{ fontSize: 13.5, color: "var(--body)", lineHeight: 1.6 }}>
              We&apos;ve sent a 6-digit code to <b>{email.trim()}</b>. It&apos;s valid for <b>{ttl} minutes</b>.
              Your account is created once you enter it.
            </div>
            <div style={{ marginTop: 12, background: "#fcf1e8", border: "1px solid #f4c8a4", borderRadius: 8, padding: "10px 12px", fontSize: 12.5, color: "#9f5314", lineHeight: 1.6 }}>
              <b>Don&apos;t see it?</b> Check your <b>spam</b> or <b>junk</b> folder — these emails often land there. Mark it &ldquo;Not spam&rdquo; so future ones arrive in your inbox.
            </div>
            <button
              onClick={() => { setNotice(false); setStep("verify"); }}
              style={{ width: "100%", marginTop: 16, padding: "11px 0", borderRadius: 9, border: "none", background: "var(--blue)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
            >
              I have the code
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
