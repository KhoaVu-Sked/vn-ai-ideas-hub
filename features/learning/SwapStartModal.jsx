"use client";

// Shown instead of a plain ConfirmModal when starting a course would push a
// track past MAX_IN_PROGRESS_PER_TRACK (shared.js) — a genuine choice ("which
// of these do I set aside?"), not a yes/no, so it gets its own small modal
// rather than stretching ConfirmModal's single-confirm shape to fit. Same
// overlay/card conventions as ConfirmModal (z-index 260, same caution
// coloring) so it reads as part of the same family of dialogs.
import { TONE } from "@/features/learning/ConfirmModal";

const cancelBtn = { border: "1px solid var(--line)", background: "var(--card)", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, color: "var(--body)", cursor: "pointer" };
const optionBtn = { textAlign: "left", border: "1px solid var(--line)", background: "var(--bg)", borderRadius: 10, padding: "10px 14px", cursor: "pointer", fontFamily: "inherit" };
// The "just focus on this one" option is a different KIND of choice than
// the per-course swaps above it (drop everything currently active, not
// trade one course for another), so it gets the accent blue rather than
// the same neutral treatment — a learner who'd rather single-thread this
// track shouldn't have to read it as one option among identical-looking
// others.
const soloBtn = { ...optionBtn, background: "#e8f0ff", borderColor: "#cddcff" };

export default function SwapStartModal({ newCourseTitle, current, onResolve, onCancel }) {
  const t = TONE.caution;
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(10,22,44,0.5)", zIndex: 260, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onMouseDown={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div style={{ background: "var(--card)", borderRadius: 14, padding: 24, width: 440, maxWidth: "100%", boxShadow: "0 20px 60px rgba(10,22,44,0.35)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 18 }}>
          <span aria-hidden="true" style={{ width: 40, height: 40, borderRadius: "50%", background: t.bg, color: t.fg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19, flexShrink: 0 }}>
            📚
          </span>
          <div>
            <div style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 17, color: "var(--ink)", margin: "0 0 4px" }}>
              Make room for "{newCourseTitle}"?
            </div>
            <p style={{ fontSize: 13, color: "var(--body)", margin: 0, lineHeight: 1.5 }}>
              You're already working on {current.length} courses in this track. Set one aside to keep working on the other, or set both aside and focus on just this one — nothing is lost either way, and you can pick anything back up any time.
            </p>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
          {current.map((c) => (
            <button key={c.id} type="button" onClick={() => onResolve([c.id])} style={optionBtn}>
              <div style={{ fontWeight: 700, fontSize: 13, color: "var(--ink)" }}>Set aside "{c.title}"</div>
              <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>Back to Not started</div>
            </button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "4px 0 10px" }}>
          <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--faint)" }}>or</span>
          <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
        </div>
        <div style={{ marginBottom: 18 }}>
          <button type="button" onClick={() => onResolve(current.map((c) => c.id))} style={soloBtn}>
            <div style={{ fontWeight: 700, fontSize: 13, color: "var(--blue)" }}>Just focus on "{newCourseTitle}"</div>
            <div style={{ fontSize: 11.5, color: "var(--blue)", marginTop: 2, opacity: 0.8 }}>Set both aside — back to Not started</div>
          </button>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button type="button" onClick={onCancel} style={cancelBtn}>Never mind</button>
        </div>
      </div>
    </div>
  );
}
