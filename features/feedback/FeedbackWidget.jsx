"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { api } from "@/lib/apiClient";

export default function FeedbackWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");

  // Only for signed-in pages (auth pages have no session yet).
  if (["/login", "/register", "/forgot", "/skedadmin"].includes(pathname)) return null;

  const submit = async () => {
    const body = text.trim();
    if (!body) return;
    setBusy(true); setErr("");
    try {
      await api("/api/feedback", { method: "POST", body: JSON.stringify({ body, page: pathname }) });
      setSent(true); setText("");
      setTimeout(() => { setOpen(false); setSent(false); }, 1400);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="fab-layer" style={{ position: "fixed", right: 20, bottom: 20, zIndex: 90 }}>
      {open && (
        <div style={{ position: "absolute", bottom: 54, right: 0, width: 300, background: "#fff", border: "1px solid var(--line)", borderRadius: 14, boxShadow: "0 12px 32px rgba(11,30,73,0.18)", padding: 16 }}>
          {sent ? (
            <div style={{ fontSize: 13.5, color: "var(--body)", padding: "12px 4px", textAlign: "center" }}>Thanks — we&apos;ve got it. 🙌</div>
          ) : (
            <>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15, color: "var(--ink)", marginBottom: 4 }}>Send feedback</div>
              <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 10 }}>Hit a bug or have an idea for the Hub? Tell us.</div>
              <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} autoFocus placeholder="What happened, or what would help?" style={{ width: "100%", border: "1px solid #d5dce6", borderRadius: 8, padding: "8px 10px", fontSize: 13, outline: "none", resize: "vertical", fontFamily: "inherit" }} />
              {err && <div style={{ fontSize: 12, color: "#d53c30", marginTop: 6 }}>{err}</div>}
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 10 }}>
                <button onClick={() => setOpen(false)} style={{ border: "1px solid #d5dce6", background: "#fff", color: "#44536b", borderRadius: 8, padding: "7px 12px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>Cancel</button>
                <button onClick={submit} disabled={busy || !text.trim()} style={{ border: "none", background: busy ? "#7b96ea" : "var(--blue)", color: "#fff", borderRadius: 8, padding: "7px 14px", fontSize: 12.5, fontWeight: 700, cursor: busy ? "wait" : "pointer" }}>{busy ? "Sending…" : "Send"}</button>
              </div>
            </>
          )}
        </div>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Send feedback"
        style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--blue)", color: "#fff", border: "none", borderRadius: 999, padding: "11px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", boxShadow: "0 6px 18px rgba(0,85,255,0.35)" }}
      >
        <span style={{ fontSize: 15, lineHeight: 1 }}>💬</span> Feedback
      </button>
    </div>
  );
}
