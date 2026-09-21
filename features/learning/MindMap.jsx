"use client";

// The roadmap Mind map — moved here from Your Journey (features/learning/
// JourneyPage.jsx), which now shows the List view only. Lives on the Learner
// Dashboard (features/learning/LearnerDashboardPage.jsx) instead. Columns by
// expected_by_position, nodes rendered as an explicit chain (course 1 -> 2 ->
// 3) within a column via a dot/line rail — the order itself comes from the
// catalog's own roadmap_order (queries.js); this is read-only display of
// whatever order the query returns.
//
// No tier locking: a role's own courses are always workable, regardless of
// whether the tier below has been finished — the roles below are assumed
// already fulfilled (that's what got someone promoted this far), so there's
// nothing left to gate on. "Skip prerequisite" existed only to satisfy that
// gate and has been removed along with it.

import { HEADER_H, POSITION_LABEL, POSITION_ORDER, ROW_H, STATUS_META, VISIBLE_ROWS } from "@/features/learning/shared";

function MindMapNode({ course, index }) {
  const status = STATUS_META[course.status] || STATUS_META.not_started;
  return (
    <div style={{
      border: "1px solid var(--line)", borderRadius: 10, padding: "10px 12px",
      background: "var(--card)", display: "flex", flexDirection: "column", gap: 6,
    }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: "var(--ink)", display: "flex", alignItems: "flex-start", gap: 6 }} title={course.title}>
        <span style={{ fontSize: 11, color: "var(--faint)", flexShrink: 0, marginTop: 1 }}>{index}</span>
        {course.status === "complete" && (
          <span style={{ width: 16, height: 16, borderRadius: "50%", background: "#1f7a3c", color: "#fff", fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>✓</span>
        )}
        <span>{course.outcome || course.title}</span>
      </div>
      <div style={{ fontSize: 11, color: "var(--muted)" }}>{course.track_name}{course.platform ? ` · ${course.platform}` : ""}</div>
      <span style={{ alignSelf: "flex-start", fontSize: 10.5, fontWeight: 700, borderRadius: 999, padding: "2px 9px", background: status.bg, color: status.color }}>{status.label}</span>
    </div>
  );
}

// Each node explicitly links to the next — course 1 -> course 2 -> course 3
// — via a dot-line-arrow-dot connector. Purely a display of whatever order
// the courses arrive in (courses.roadmap_order, queries.js) — nothing here
// or on the List view changes it; there's no reordering anywhere anymore.
function NodeRail({ courses }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {courses.map((c, i) => (
        <div key={c.id}>
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--blue)", flexShrink: 0, marginTop: 6 }} />
            <div style={{ flex: 1 }}>
              <MindMapNode course={c} index={i + 1} />
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

// Columns by expected_by_position, in ladder order — a plain arrow between
// adjacent columns, no gate: every tier is workable regardless of the one
// before it (see the file header).
export function JourneyMindMap({ courses }) {
  const groups = POSITION_ORDER
    .map((pos) => ({ position: pos, courses: courses.filter((c) => c.expected_by_position === pos) }))
    .filter((g) => g.courses.length > 0);
  const other = courses.filter((c) => !POSITION_ORDER.includes(c.expected_by_position));
  if (other.length) groups.push({ position: null, courses: other });

  const colMaxHeight = HEADER_H + VISIBLE_ROWS * ROW_H;

  return (
    <div style={{ display: "flex", alignItems: "flex-start", overflowX: "auto", paddingBottom: 8 }}>
      {groups.map((g, i) => (
        <div key={g.position || "other"} style={{ display: "flex", alignItems: "flex-start" }}>
          <div style={{ minWidth: 230, maxWidth: 230 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--muted)", letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 10, textAlign: "center" }}>
              {g.position ? POSITION_LABEL[g.position] : "Other"}
            </div>
            <div style={{ maxHeight: colMaxHeight, overflowY: "auto", paddingRight: 4 }}>
              <NodeRail courses={g.courses} />
            </div>
          </div>
          {i < groups.length - 1 && (
            <div style={{ width: 74, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ fontSize: 18, color: "var(--faint)" }}>→</div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
