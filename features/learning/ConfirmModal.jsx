"use client";

// Shared "are you sure" dialog for AI Learning — a Skedulo-themed stand-in
// for a native confirm(), so every spot in this feature that needs one
// (Your Journey's Reset, the Get Started wizard's Calendar-skip warning)
// shares one component instead of each rolling its own copy of the same
// overlay/card/icon markup. Two tones, both drawn from colors this feature
// already uses elsewhere for the same meaning, not new ones invented for
// this: "caution" (STATUS_META's own "skipped" amber, shared.js — the
// register Up next's "Calendar not connected" banner already uses) for a
// heads-up with a real but recoverable cost, "danger" (errBanner's red)
// for something that actually deletes data. z-index above every other
// modal in this feature (TrackPreview 200, AutoScheduleModal 220, the Get
// Started wizard 150) since a confirm like this is always the last,
// topmost word on whatever action triggered it.
const TONE = {
  caution: { bg: "#fff4e0", fg: "#a15c00" },
  danger: { bg: "#fdeaea", fg: "#c92a2a" },
};

const confirmModalBtn = { border: "1px solid var(--line)", background: "var(--card)", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, color: "var(--body)", cursor: "pointer" };
const confirmModalBtnPrimary = { border: "none", background: "var(--blue)", color: "#fff", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" };

export default function ConfirmModal({ icon = "⚠️", tone = "caution", title, body, cancelLabel = "Cancel", confirmLabel = "Continue", onCancel, onConfirm }) {
  const t = TONE[tone] || TONE.caution;
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(10,22,44,0.5)", zIndex: 260, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onMouseDown={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div style={{ background: "var(--card)", borderRadius: 14, padding: 24, width: 420, maxWidth: "100%", boxShadow: "0 20px 60px rgba(10,22,44,0.35)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 18 }}>
          <span aria-hidden="true" style={{ width: 40, height: 40, borderRadius: "50%", background: t.bg, color: t.fg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19, flexShrink: 0 }}>
            {icon}
          </span>
          <div>
            <div style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 17, color: "var(--ink)", margin: "0 0 4px" }}>{title}</div>
            <p style={{ fontSize: 13, color: "var(--body)", margin: 0, lineHeight: 1.5 }}>{body}</p>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={onCancel} style={confirmModalBtn}>{cancelLabel}</button>
          <button onClick={onConfirm} style={confirmModalBtnPrimary}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
