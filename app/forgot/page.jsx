"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import SkeduloMark from "../SkeduloMark";

export default function ForgotPage() {
  const router = useRouter();
  const [step, setStep] = useState("request");   // request → verify
  const [identifier, setIdentifier] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
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

  const requestCode = async (e) => {
    e?.preventDefault();
    if (!identifier.trim()) { setErr("Enter your username or email."); return; }
    setBusy(true); setErr("");
    try {
      const d = await post("/api/auth/forgot", { identifier: identifier.trim() });
      setTtl(d.expiresInMinutes || 10);
      setSecondsLeft((d.expiresInMinutes || 10) * 60);
      setNotice(true);            // popup: check inbox AND spam
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const resetPassword = async (e) => {
    e?.preventDefault();
    if (password !== confirm) { setErr("The two passwords don't match."); return; }
    setBusy(true); setErr("");
    try {
      await post("/api/auth/reset", { identifier: identifier.trim(), code: code.trim(), password });
      router.replace("/login?reset=1");
    } catch (e) { setErr(e.message); setBusy(false); }
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
          <span style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 18, color: "var(--ink)" }}>Reset your password</span>
        </div>

        {step === "request" ? (
          <form onSubmit={requestCode}>
            <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 16, lineHeight: 1.6 }}>
              Enter your username or email and we&apos;ll send a verification code to the email on your account.
            </div>
            <label style={label}>Username or email</label>
            <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoFocus autoComplete="username" style={field} />
            {err && <div style={{ fontSize: 12.5, color: "#d53c30", marginBottom: 12 }}>{err}</div>}
            <button type="submit" disabled={busy} style={primary(busy)}>{busy ? "Sending…" : "Send code"}</button>
          </form>
        ) : (
          <form onSubmit={resetPassword}>
            <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 16, lineHeight: 1.6 }}>
              Enter the 6-digit code we emailed you, then choose a new password.
              {secondsLeft > 0
                ? <> The code expires in <b style={{ color: "var(--ink)" }}>{mmss}</b>.</>
                : <> <b style={{ color: "#d53c30" }}>The code has expired</b> — request a new one.</>}
            </div>
            <label style={label}>Verification code</label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric" autoComplete="one-time-code" placeholder="123456" autoFocus
              style={{ ...field, letterSpacing: 8, fontSize: 20, fontWeight: 700, textAlign: "center", fontFamily: "ui-monospace, Menlo, monospace" }}
            />
            <label style={label}>New password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" placeholder="at least 6 characters" style={field} />
            <label style={label}>Confirm new password</label>
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" style={field} />
            {err && <div style={{ fontSize: 12.5, color: "#d53c30", marginBottom: 12 }}>{err}</div>}
            <button type="submit" disabled={busy || code.length !== 6} style={primary(busy)}>{busy ? "Saving…" : "Set new password"}</button>
            <button type="button" onClick={() => { setStep("request"); setCode(""); setErr(""); }} style={{ width: "100%", marginTop: 8, padding: "9px 0", borderRadius: 9, border: "1px solid #d5dce6", background: "#fff", color: "#44536b", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              Send a new code
            </button>
          </form>
        )}

        <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 14, textAlign: "center" }}>
          <Link href="/login" style={{ color: "var(--blue)", fontWeight: 700 }}>Back to sign in</Link>
        </div>
      </div>

      {/* Check your inbox — and your spam folder */}
      {notice && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(10,22,44,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20 }}>
          <div style={{ background: "#fff", borderRadius: 14, padding: 26, width: 380, maxWidth: "100%", boxShadow: "0 20px 60px rgba(10,22,44,0.35)" }}>
            <div style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 17, color: "var(--ink)", marginBottom: 8 }}>Check your email</div>
            <div style={{ fontSize: 13.5, color: "var(--body)", lineHeight: 1.6 }}>
              If an account matches <b>{identifier.trim()}</b>, we&apos;ve sent a 6-digit code to its email address.
              It&apos;s valid for <b>{ttl} minutes</b>.
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
