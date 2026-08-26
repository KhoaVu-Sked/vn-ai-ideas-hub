"use client";

// The roadmap Mind map — moved here from Your Journey (features/learning/
// JourneyPage.jsx), which now shows the List view only. Lives on the Learner
// Dashboard (features/learning/LearnerDashboardPage.jsx) instead. Columns by
// expected_by_position, nodes rendered as an explicit chain (course 1 -> 2 ->
// 3) within a column via a dot/line rail — the order itself is still set on
// the List view's table (drag-reorder lives there); this is read-only display
// of whatever order the query returns.
//
// A course is Locked until every course in the tier below it is complete or
// skipped — a tier gate, not a per-course prerequisite graph (this app has no
// course-to-course dependency data). "Skip prerequisite" on a locked course
// marks every course in the tier below it 'skipped' (satisfying the gate) and
// every course in its own tier 'not_started' — unlocking the whole tier into
// its normal, un-started state rather than a synthetic status.

import { HEADER_H, POSITION_LABEL, POSITION_ORDER, STATUS_META, VISIBLE_ROWS, errBanner } from "@/features/learning/shared";

const DONE_STATUSES = new Set(["complete", "skipped"]);

// A node is Locked when it's not itself done/skipped AND the tier below it
// isn't fully done/skipped yet. An empty (or missing) lower tier can't block
// anything — .every() on an empty array is vacuously true.
function computeLocks(groups) {
  const locked = new Map();
  let prevTierClear = true;
  for (const g of groups) {
    for (const c of g.courses) {
      locked.set(c.id, prevTierClear ? false : !DONE_STATUSES.has(c.status));
    }
    prevTierClear = g.courses.every((c) => DONE_STATUSES.has(c.status));
  }
  return locked;
}

function MindMapNode({ course, index, locked, onRequestSkip }) {
  const status = locked ? { label: "Locked", bg: "#eef0f4", color: "#5e687a" } : (STATUS_META[course.status] || STATUS_META.not_started);
  return (
    <div style={{
      border: locked ? "1px dashed #c9d3e6" : "1px solid var(--line)", borderRadius: 10, padding: "10px 12px",
      background: locked ? "var(--bg)" : "var(--card)", display: "flex", flexDirection: "column", gap: 6, opacity: locked ? 0.85 : 1,
    }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: locked ? "var(--muted)" : "var(--ink)", display: "flex", alignItems: "flex-start", gap: 6 }} title={course.title}>
        <span style={{ fontSize: 11, color: "var(--faint)", flexShrink: 0, marginTop: 1 }}>{index}</span>
        {course.status === "complete" && (
          <span style={{ width: 16, height: 16, borderRadius: "50%", background: "#1f7a3c", color: "#fff", fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>✓</span>
        )}
        <span>{course.outcome || course.title}</span>
      </div>
      <div style={{ fontSize: 11, color: "var(--muted)" }}>{course.track_name}{course.platform ? ` · ${course.platform}` : ""}</div>
      <span style={{ alignSelf: "flex-start", fontSize: 10.5, fontWeight: 700, borderRadius: 999, padding: "2px 9px", background: status.bg, color: status.color }}>{status.label}</span>
      {locked && (
        <button
          onClick={() => onRequestSkip(course)}
          style={{ alignSelf: "flex-start", background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 11.5, color: "var(--blue)", fontWeight: 700, textDecoration: "underline" }}
        >
          Skip prerequisite
        </button>
      )}
    </div>
  );
}

// Each node explicitly links to the next — course 1 -> course 2 -> course 3
// — via a dot-line-arrow-dot connector. Purely a display of whatever order
// the courses arrive in; the order itself is set on the List view's table
// (drag-reorder lives there), not here, so there's only one place that
// implements reordering.
function NodeRail({ courses, locked, onRequestSkip }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {courses.map((c, i) => (
        <div key={c.id}>
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: locked.get(c.id) ? "#c9d3e6" : "var(--blue)", flexShrink: 0, marginTop: 6 }} />
            <div style={{ flex: 1 }}>
              <MindMapNode course={c} index={i + 1} locked={locked.get(c.id)} onRequestSkip={onRequestSkip} />
            </div>
          </div>
          {i < courses.length - 1 && (
            <div style={{ display: "flex", justifyContent: "flex-start", width: 8 }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 8 }}>
                <div style={{ width: 2, height: 10, background: "var(--line)" }} />
                <div style={{ fontSize: 11, color: "var(--faint)", lineHeight: 1 }}>↓</div>
                <div style={{ width: 2, height: 10, background: "var(--line)" }} />
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// Columns by expected_by_position, in ladder order. A gate connector sits
// between adjacent columns: green + "Unlocked" once every course in the
// column to its left is complete/skipped, otherwise gray + naming what's
// required. This is a tier gate (all of one position before the next),
// not a per-course prerequisite graph — nothing here models individual
// course-to-course dependencies.
export function JourneyMindMap({ courses, onRequestSkip }) {
  const groups = POSITION_ORDER
    .map((pos) => ({ position: pos, courses: courses.filter((c) => c.expected_by_position === pos) }))
    .filter((g) => g.courses.length > 0);
  const other = courses.filter((c) => !POSITION_ORDER.includes(c.expected_by_position));
  if (other.length) groups.push({ position: null, courses: other });

  const locked = computeLocks(groups);
  const colMaxHeight = HEADER_H + VISIBLE_ROWS * ROW_H;

  return (
    <div style={{ display: "flex", alignItems: "flex-start", overflowX: "auto", paddingBottom: 8 }}>
      {groups.map((g, i) => {
        const clear = g.courses.every((c) => DONE_STATUSES.has(c.status));
        return (
          <div key={g.position || "other"} style={{ display: "flex", alignItems: "flex-start" }}>
            <div style={{ minWidth: 230, maxWidth: 230 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--muted)", letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 10, textAlign: "center" }}>
                {g.position ? POSITION_LABEL[g.position] : "Other"}
              </div>
              <div style={{ maxHeight: colMaxHeight, overflowY: "auto", paddingRight: 4 }}>
                <NodeRail courses={g.courses} locked={locked} onRequestSkip={onRequestSkip} />
              </div>
            </div>
            {i < groups.length - 1 && (
              <div style={{ width: 74, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", paddingTop: 40 }}>
                <div style={{ fontSize: 18, color: clear ? "#1f7a3c" : "var(--faint)" }}>→</div>
                <div style={{ fontSize: 10, color: clear ? "#1f7a3c" : "var(--muted)", textAlign: "center", marginTop: 4 }}>
                  {clear ? "Unlocked" : `Requires all ${POSITION_LABEL[g.position] || "previous"} courses`}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function SkipConfirmModal({ course, onCancel, onConfirm, busy, err }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(10,22,44,0.5)", zIndex: 220, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div style={{ background: "var(--card)", borderRadius: 14, padding: 24, width: 420, maxWidth: "100%", boxShadow: "0 20px 60px rgba(10,22,44,0.35)" }}>
        <div style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 17, color: "var(--ink)", marginBottom: 10 }}>Skip prerequisite?</div>
        <p style={{ fontSize: 13, color: "var(--body)", margin: "0 0 18px", lineHeight: 1.5 }}>
          Previous courses are required before "{course.title}". Skipping lets you move on now. The skip is recorded on your roadmap and visible to your manager.
        </p>
        {err && <div style={{ ...errBanner, marginBottom: 14 }}>{err}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={onCancel} disabled={busy} style={{ border: "1px solid var(--line)", background: "var(--card)", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, color: "var(--body)", cursor: "pointer" }}>Cancel</button>
          <button onClick={onConfirm} disabled={busy} style={{ border: "none", background: "#a15c00", color: "#fff", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: busy ? "wait" : "pointer", opacity: busy ? 0.7 : 1 }}>
            {busy ? "Skipping…" : "Skip prerequisite"}
          </button>
        </div>
      </div>
    </div>
  );
}
