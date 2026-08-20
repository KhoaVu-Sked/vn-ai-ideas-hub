"use client";

// Your Journey: every course across the tracks you're enrolled in.
// List view: ordered intern -> principal, scrolled after ~7 rows. Rows are
// drag-reorderable (persisted per account on course_assignments.position) —
// a drop only lands on a row in the same position tier, so a drag can never
// move a course into a different stage. This is the ONLY place reordering
// happens; Mind map just displays whatever order the query already returns.
// Mind map view: columns by expected_by_position, each node explicitly
// linked to the next in list order within a column. A course is Locked
// until every course in the tier below it is complete or skipped — a tier
// gate, not a per-course prerequisite graph (this app has no course-to-
// course dependency data). "Skip prerequisite" on a locked course marks
// every course in the tier below it 'skipped' (satisfying the gate) and
// every course in its own tier 'not_started' — unlocking the whole tier
// into its normal, un-started state rather than a synthetic status.

import { useCallback, useEffect, useState } from "react";
import AppHeader from "@/components/AppHeader";
import Loading from "@/components/Loading";
import { useSession } from "@/features/auth/SessionProvider";
import { api } from "@/lib/apiClient";
import useRevalidateOnFocus from "@/lib/useRevalidateOnFocus";
import { card, errBanner, STATUS_META, POSITION_LABEL, POSITION_ORDER, th, td, fmtDate } from "@/features/learning/shared";

const VISIBLE_ROWS = 7;
const ROW_H = 42;
const HEADER_H = 34;

// Draggable row (native HTML5 DnD, no library) — drop is only accepted onto
// a row in the SAME position tier (checked in JourneyTable.handleDrop), so a
// drag can never move a course into a different stage.
function JourneyRow({ course, index, expanded, onToggle, drag }) {
  const status = STATUS_META[course.status] || STATUS_META.not_started;
  return (
    <>
      <tr
        draggable
        onDragStart={drag.onDragStart}
        onDragOver={drag.onDragOver}
        onDrop={drag.onDrop}
        onDragEnd={drag.onDragEnd}
        onClick={onToggle}
        style={{
          borderTop: "1px solid var(--line)", cursor: "grab",
          opacity: drag.dragging ? 0.4 : 1,
          outline: drag.dropTarget ? "2px dashed var(--blue)" : "none", outlineOffset: -2,
        }}
      >
        <td style={{ ...td, color: "var(--faint)" }}>{index}</td>
        <td style={{ ...td, fontWeight: 700, fontSize: 13.5, color: "var(--ink)" }}>{course.title}</td>
        <td style={td}>{course.track_name}</td>
        <td style={td}>{course.platform || "—"}</td>
        <td style={td}>{course.est_hours ?? "—"}</td>
        <td style={td}>{fmtDate(course.target_date)}</td>
        <td style={td}><span style={{ fontSize: 11, fontWeight: 700, borderRadius: 999, padding: "3px 10px", background: status.bg, color: status.color, whiteSpace: "nowrap" }}>{status.label}</span></td>
        <td style={{ ...td, textAlign: "right", color: "var(--muted)" }}>{expanded ? "︿" : "﹀"}</td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={8} style={{ padding: 0, background: "var(--bg)" }}>
            <div style={{ padding: "12px 8px 16px 8px", display: "flex", flexDirection: "column", gap: 8 }}>
              {course.link && (
                <a href={course.link} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12.5, color: "var(--blue)", fontWeight: 700, textDecoration: "none" }}>
                  Open course{course.platform ? ` on ${course.platform}` : ""} ↗
                </a>
              )}
              {course.outcome && <div style={{ fontSize: 12.5, color: "var(--body)" }}><strong>After this course:</strong> {course.outcome}</div>}
              {(course.wrap_up_url || course.exam_score != null) && (
                <div>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--muted)", letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                    <span>📄</span> Knowledge artifacts
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    {course.wrap_up_url && (
                      <a href={course.wrap_up_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12.5, color: "var(--blue)", fontWeight: 700, textDecoration: "none" }}>Wrap-up</a>
                    )}
                    {course.exam_score != null && (
                      <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 999, padding: "3px 10px", background: "#e6f4ea", color: "#1f7a3c" }}>
                        Passed {course.exam_score}%
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// Scrolls after ~7 rows; header stays pinned while the body scrolls.
// Rows are drag-reorderable, but a drop only lands if the dragged row and
// the drop target share the same expected_by_position — the ordering this
// table already has (tier first) puts same-tier rows in one contiguous
// block, so reordering can only ever happen within a stage.
function JourneyTable({ courses, onReorder }) {
  const [order, setOrder] = useState(courses.map((c) => c.id));
  const [dragId, setDragId] = useState(null);
  const [overId, setOverId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  useEffect(() => { setOrder(courses.map((c) => c.id)); }, [courses]);

  const byId = new Map(courses.map((c) => [c.id, c]));
  const ordered = order.map((id) => byId.get(id)).filter(Boolean);
  const draggingCourse = dragId ? byId.get(dragId) : null;

  const handleDrop = (targetId) => {
    setOverId(null);
    const target = byId.get(targetId);
    if (!dragId || dragId === targetId || !draggingCourse || !target) { setDragId(null); return; }
    if (draggingCourse.expected_by_position !== target.expected_by_position) { setDragId(null); return; } // different stage — reject
    const next = order.filter((id) => id !== dragId);
    next.splice(next.indexOf(targetId), 0, dragId); // drop before the target's current slot
    setOrder(next);
    setDragId(null);
    const tierIds = next.filter((id) => byId.get(id)?.expected_by_position === target.expected_by_position);
    onReorder(target.expected_by_position, tierIds);
  };

  return (
    <div style={{ overflow: "auto", maxHeight: HEADER_H + VISIBLE_ROWS * ROW_H, border: "1px solid var(--line)", borderRadius: 10 }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ textAlign: "left", color: "var(--muted)" }}>
            <th style={{ ...th, position: "sticky", top: 0, background: "var(--card)" }}>#</th>
            <th style={{ ...th, position: "sticky", top: 0, background: "var(--card)" }}>Course</th>
            <th style={{ ...th, position: "sticky", top: 0, background: "var(--card)" }}>Track</th>
            <th style={{ ...th, position: "sticky", top: 0, background: "var(--card)" }}>Platform</th>
            <th style={{ ...th, position: "sticky", top: 0, background: "var(--card)" }}>Est. hrs</th>
            <th style={{ ...th, position: "sticky", top: 0, background: "var(--card)" }}>Target</th>
            <th style={{ ...th, position: "sticky", top: 0, background: "var(--card)" }}>Status</th>
            <th style={{ position: "sticky", top: 0, background: "var(--card)" }} />
          </tr>
        </thead>
        <tbody>
          {ordered.map((c, i) => (
            <JourneyRow
              key={c.id}
              course={c}
              index={i + 1}
              expanded={expandedId === c.id}
              onToggle={() => setExpandedId((id) => (id === c.id ? null : c.id))}
              drag={{
                dragging: dragId === c.id,
                dropTarget: overId === c.id && dragId && dragId !== c.id && draggingCourse?.expected_by_position === c.expected_by_position,
                onDragStart: () => setDragId(c.id),
                onDragOver: (e) => { e.preventDefault(); if (overId !== c.id) setOverId(c.id); },
                onDrop: () => handleDrop(c.id),
                onDragEnd: () => { setDragId(null); setOverId(null); },
              }}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

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
function JourneyMindMap({ courses, onRequestSkip }) {
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

function SkipConfirmModal({ course, onCancel, onConfirm, busy, err }) {
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

function ViewToggle({ view, onChange }) {
  const seg = (active) => ({
    height: 30, padding: "0 16px", fontSize: 12.5, fontWeight: 700, fontFamily: "inherit",
    border: "none", cursor: "pointer", background: active ? "var(--bg)" : "var(--card)", color: active ? "var(--ink)" : "var(--muted)",
  });
  return (
    <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", border: "1px solid var(--line)", flexShrink: 0 }}>
      <button onClick={() => onChange("list")} style={{ ...seg(view === "list"), borderRight: "1px solid var(--line)" }}>List</button>
      <button onClick={() => onChange("mindmap")} style={seg(view === "mindmap")}>Mind map</button>
    </div>
  );
}

export default function JourneyPage() {
  const { user: me } = useSession();
  const [journey, setJourney] = useState([]);
  const [err, setErr] = useState("");
  const [ready, setReady] = useState(false);
  const [view, setView] = useState("list");
  const [skipTarget, setSkipTarget] = useState(null);
  const [skipping, setSkipping] = useState(false);
  const [skipErr, setSkipErr] = useState("");
  const [resetting, setResetting] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState("all");

  const load = useCallback(async () => {
    setErr("");
    try { const { courses } = await api("/api/journey"); setJourney(courses); } catch (e) { setErr(e.message); } finally { setReady(true); }
  }, []);

  useEffect(() => { if (me) load(); }, [me, load]);
  useRevalidateOnFocus(() => { if (me) load(); });

  // Derived straight from the journey data already on hand — no extra fetch.
  const trackOptions = Array.from(new Map(journey.map((c) => [c.track_id, c.track_name])).entries())
    .map(([id, name]) => ({ id, name }));
  // If the previously selected track was un-enrolled (reset, or dropped a
  // track), fall back to "all" rather than silently showing nothing.
  useEffect(() => {
    if (selectedTrack !== "all" && !trackOptions.some((t) => t.id === selectedTrack)) setSelectedTrack("all");
  }, [journey]); // eslint-disable-line react-hooks/exhaustive-deps
  const filteredJourney = selectedTrack === "all" ? journey : journey.filter((c) => c.track_id === selectedTrack);

  const resetJourney = async () => {
    if (!confirm("Reset your journey back to the original track? This clears all recorded progress and skips — every course reverts to not started (only Intern stays unlocked).")) return;
    setResetting(true);
    setErr("");
    try {
      await api("/api/journey/reset", { method: "POST" });
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setResetting(false);
    }
  };

  // JourneyTable already reordered itself locally for instant feedback; this
  // just persists it. No reload — a stale-order fetch racing the drop would
  // visibly snap the rows back, and the local order is already correct.
  const reorderStage = (position, courseIds) => {
    api("/api/journey/reorder", { method: "POST", body: JSON.stringify({ position, courseIds }) })
      .catch((e) => setErr(e.message));
  };

  // Completes every course in the tier below the clicked one, not just that
  // course — so a full reload rather than a single-row patch.
  const confirmSkip = async () => {
    setSkipping(true);
    setSkipErr("");
    try {
      await api(`/api/courses/${skipTarget.id}/skip`, { method: "POST" });
      await load();
      setSkipTarget(null);
    } catch (e) {
      setSkipErr(e.message);
    } finally {
      setSkipping(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", paddingBottom: 40 }}>
      <AppHeader crumb="Your Journey" />
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "24px 22px 0" }}>
        {me === undefined || (me && !ready) ? (
          <Loading label="Loading your journey" />
        ) : (
          <section style={card}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 18 }}>
              <div>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginBottom: 4 }}>
                  <h1 style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 20, color: "var(--ink)", margin: 0 }}>Your Journey</h1>
                  {journey.length > 0 && (
                    <select
                      value={selectedTrack}
                      onChange={(e) => setSelectedTrack(e.target.value)}
                      style={{ border: "1px solid var(--line)", background: "var(--card)", borderRadius: 8, padding: "0 10px", height: 28, fontSize: 12.5, fontWeight: 700, color: "var(--ink)" }}
                    >
                      <option value="all">All tracks</option>
                      {trackOptions.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  )}
                </div>
                <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>
                  Ordered intern → principal, across every track you're enrolled in.
                  {view === "list" && " Drag a row to reorder it within its stage."}
                </p>
              </div>
              {journey.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, maxWidth: "100%" }}>
                  <button
                    onClick={resetJourney}
                    disabled={resetting}
                    title="Clear all recorded progress and skips"
                    style={{ border: "1px solid var(--line)", background: "var(--card)", borderRadius: 8, padding: "0 14px", height: 30, fontSize: 12.5, fontWeight: 700, color: "var(--muted)", cursor: resetting ? "wait" : "pointer", whiteSpace: "nowrap" }}
                  >
                    {resetting ? "Resetting…" : "Reset"}
                  </button>
                  <ViewToggle view={view} onChange={setView} />
                </div>
              )}
            </div>
            {err && <div style={{ ...errBanner, marginBottom: 14 }}>{err}</div>}
            {journey.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--muted)" }}>Nothing here yet — enroll in a track from the Learning Hub to start your journey.</div>
            ) : filteredJourney.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--muted)" }}>No courses in this track.</div>
            ) : view === "list" ? (
              <JourneyTable courses={filteredJourney} onReorder={reorderStage} />
            ) : (
              <JourneyMindMap courses={filteredJourney} onRequestSkip={(c) => { setSkipErr(""); setSkipTarget(c); }} />
            )}
          </section>
        )}
      </main>

      {skipTarget && (
        <SkipConfirmModal
          course={skipTarget}
          busy={skipping}
          err={skipErr}
          onCancel={() => setSkipTarget(null)}
          onConfirm={confirmSkip}
        />
      )}
    </div>
  );
}
