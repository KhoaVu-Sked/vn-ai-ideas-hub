"use client";

// Your Journey: every course across the tracks you're enrolled in.
// List view: ordered intern -> principal, scrolled after ~7 rows. Rows are
// drag-reorderable (persisted per account on course_assignments.position) —
// a drop only lands on a row in the same position tier, so a drag can never
// move a course into a different stage. This is the ONLY place reordering
// happens; Mind map just displays whatever order the query already returns.
// Reordering is disabled (readOnly) whenever a single track is selected in
// the filter, rather than "All tracks": reorderStage writes position for
// every course in a tier at once, but a tier can span more than one track —
// dragging while filtered to one track would only see (and rewrite) that
// track's slice of the tier, leaving the other track's same-tier courses
// with stale positions.
// Mind map view: columns by expected_by_position, each node explicitly
// linked to the next in list order within a column. A course is Locked
// until every course in the tier below it is complete or skipped — a tier
// gate, not a per-course prerequisite graph (this app has no course-to-
// course dependency data). "Skip prerequisite" on a locked course marks
// every course in the tier below it 'skipped' (satisfying the gate) and
// every course in its own tier 'not_started' — unlocking the whole tier
// into its normal, un-started state rather than a synthetic status.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import Avatar from "@/components/Avatar";
import Loading from "@/components/Loading";
import { useSession } from "@/features/auth/SessionProvider";
import { api } from "@/lib/apiClient";
import useRevalidateOnFocus from "@/lib/useRevalidateOnFocus";
import { card, errBanner, STATUS_META, statusPill, POSITION_LABEL, POSITION_ORDER, th, td, fmtDate, toDateStr, relTime } from "@/features/learning/shared";
import ProgressBar from "@/features/learning/ProgressBar";

const VISIBLE_ROWS = 7;
const ROW_H = 42;
const HEADER_H = 34;

// Draggable row (native HTML5 DnD, no library) — drop is only accepted onto
// a row in the SAME position tier (checked in JourneyTable.handleDrop), so a
// drag can never move a course into a different stage.
function JourneyRow({ course, index, expanded, onToggle, drag, draggable = true, ownRoadmap = true }) {
  const status = STATUS_META[course.status] || STATUS_META.not_started;
  return (
    <>
      <tr
        draggable={draggable}
        onDragStart={drag.onDragStart}
        onDragOver={drag.onDragOver}
        onDrop={drag.onDrop}
        onDragEnd={drag.onDragEnd}
        onClick={onToggle}
        style={{
          borderTop: "1px solid var(--line)", cursor: draggable ? "grab" : "pointer",
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
        <td style={td}><span style={statusPill(course.status)}>{status.label}</span></td>
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
              {/* Own roadmap only — an admin viewing someone else's read-only
                  drill-down shouldn't see an action button for someone else's
                  wrap-up. Independent of `draggable`: filtering the List view
                  to one track disables reordering but is still your own
                  roadmap, so Wrap-up should stay visible there. The quiz page
                  itself handles a course with no quiz content yet. */}
              {ownRoadmap && (
                <Link
                  href={`/learning-hub/journey/${course.id}/quiz`}
                  style={{ alignSelf: "flex-start", border: "1px solid var(--line)", background: "var(--card)", borderRadius: 8, padding: "6px 14px", fontSize: 12.5, fontWeight: 700, color: "var(--body)", cursor: "pointer", textDecoration: "none" }}
                >
                  Wrap-up
                </Link>
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
export function JourneyTable({ courses, onReorder, readOnly = false, ownRoadmap = true }) {
  const [order, setOrder] = useState(courses.map((c) => c.id));
  const [dragId, setDragId] = useState(null);
  const [overId, setOverId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  // `courses` is a new array reference on every parent render (it's `journey.
  // filter(...)`), including ones unrelated to a real reorder — e.g. an
  // unrelated course's status flips via auto-start or a target-date edit, or
  // a tab-focus revalidate. Resetting `order` on every reference change would
  // snap a just-dragged row back to server order before the fire-and-forget
  // reorderStage() POST (no reload, by design) has landed. Reset only when
  // the actual SET of course ids changed — a real reload, or the track
  // filter switching to a different subset — not merely the reference.
  useEffect(() => {
    const nextIds = courses.map((c) => c.id);
    const nextSet = new Set(nextIds);
    setOrder((prev) => (prev.length === nextSet.size && prev.every((id) => nextSet.has(id)) ? prev : nextIds));
  }, [courses]);

  const byId = new Map(courses.map((c) => [c.id, c]));
  const ordered = order.map((id) => byId.get(id)).filter(Boolean);
  const draggingCourse = dragId ? byId.get(dragId) : null;

  const handleDrop = (targetId) => {
    if (readOnly) return;
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
              draggable={!readOnly}
              ownRoadmap={ownRoadmap}
              drag={{
                dragging: !readOnly && dragId === c.id,
                dropTarget: !readOnly && overId === c.id && dragId && dragId !== c.id && draggingCourse?.expected_by_position === c.expected_by_position,
                onDragStart: readOnly ? undefined : () => setDragId(c.id),
                onDragOver: readOnly ? undefined : (e) => { e.preventDefault(); if (overId !== c.id) setOverId(c.id); },
                onDrop: readOnly ? undefined : () => handleDrop(c.id),
                onDragEnd: readOnly ? undefined : () => { setDragId(null); setOverId(null); },
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

const modalBtn = { border: "1px solid var(--line)", background: "var(--card)", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, color: "var(--body)", cursor: "pointer", textDecoration: "none", display: "inline-block" };
const modalBtnPrimary = (busy) => ({ border: "none", background: "var(--blue)", color: "#fff", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: busy ? "wait" : "pointer", opacity: busy ? 0.7 : 1 });
const modalField = { display: "flex", flexDirection: "column", gap: 5, fontSize: 11.5, fontWeight: 700, color: "var(--muted)", flex: 1 };
const modalSelect = { border: "1px solid var(--line)", borderRadius: 8, padding: "7px 8px", fontSize: 13, color: "var(--ink)", fontWeight: 500, background: "var(--card)" };

// Asks for a position range ("From" defaults to the learner's own current
// seniority) and a timeline (a number + unit, converted to months on submit
// — the server only knows months). Save calls the auto-schedule endpoint,
// which both books Google Calendar events AND writes target_date on each
// course, same field Up next's own pencil-edit writes — so results show up
// there immediately once onScheduled() reloads the journey.
//
// A 409 with error: "not_connected" means this account has never granted
// (or has since revoked) Google Calendar access — that's not a failure to
// show as an error banner, it's a real, expected first-run state, so it gets
// its own "Connect Google Calendar" screen instead. That's a real browser
// navigation (an <a>, not a fetch), since it has to leave the app for
// Google's consent screen and come back to a fresh page load.
function AutoScheduleModal({ currentPosition, onClose, onScheduled }) {
  const [from, setFrom] = useState(currentPosition || POSITION_ORDER[0]);
  const [to, setTo] = useState(currentPosition || POSITION_ORDER[POSITION_ORDER.length - 1]);
  const [amount, setAmount] = useState(6);
  const [unit, setUnit] = useState("months");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [needsConnect, setNeedsConnect] = useState(false);

  const submit = async () => {
    setBusy(true); setError(""); setResult(null); setNeedsConnect(false);
    const timeline_months = unit === "years" ? Number(amount) * 12 : Number(amount);
    try {
      const res = await api("/api/courses/auto-schedule", {
        method: "POST",
        body: JSON.stringify({ from_position: from, to_position: to, timeline_months }),
      });
      setResult(res);
      if (res.scheduled?.length) onScheduled();
    } catch (e) {
      if (e.message === "not_connected") setNeedsConnect(true);
      else setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(10,22,44,0.5)", zIndex: 220, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{ background: "var(--card)", borderRadius: 14, padding: 24, width: 440, maxWidth: "100%", boxShadow: "0 20px 60px rgba(10,22,44,0.35)" }}>
        <div style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 17, color: "var(--ink)", marginBottom: 6 }}>🪄 Auto Schedule</div>

        {needsConnect ? (
          <>
            <p style={{ fontSize: 13, color: "var(--body)", margin: "0 0 18px", lineHeight: 1.5 }}>
              Connect your Google Calendar first — this only asks once. You'll come back here automatically.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button onClick={onClose} style={modalBtn}>Cancel</button>
              <a href="/api/calendar/connect" style={{ ...modalBtn, border: "none", background: "var(--blue)", color: "#fff" }}>Connect Google Calendar</a>
            </div>
          </>
        ) : result ? (
          <>
            <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "0 0 14px" }}>
              {result.message || (result.scheduled.length > 0
                ? `Booked ${result.scheduled.length} study block${result.scheduled.length === 1 ? "" : "s"} on your calendar.`
                : "Couldn't book any study blocks — see below.")}
            </p>
            {result.scheduled?.length > 0 && (
              <div style={{ marginBottom: 12, display: "flex", flexDirection: "column", gap: 4 }}>
                {result.scheduled.map((s) => (
                  <div key={s.course_id} style={{ fontSize: 12.5, color: "var(--body)" }}>
                    <strong>{s.title}</strong> — {fmtDate(s.target_date)}
                    {s.event_link && <> · <a href={s.event_link} target="_blank" rel="noopener noreferrer" style={{ color: "var(--blue)" }}>view</a></>}
                    {s.capped && <span style={{ color: "var(--muted)" }}> · capped at 4h</span>}
                  </div>
                ))}
              </div>
            )}
            {result.skipped?.length > 0 && (
              <div style={{ marginBottom: 4, display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--muted)" }}>Couldn't place {result.skipped.length}:</div>
                {result.skipped.map((s) => (
                  <div key={s.course_id} style={{ fontSize: 12, color: "var(--muted)" }}>{s.title} — {s.reason}</div>
                ))}
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
              <button onClick={onClose} style={modalBtnPrimary(false)}>Done</button>
            </div>
          </>
        ) : (
          <>
            <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "0 0 18px", lineHeight: 1.5 }}>
              Books one study block per not-yet-done course in this range, working around your existing meetings.
            </p>
            <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
              <label style={modalField}>From
                <select value={from} onChange={(e) => setFrom(e.target.value)} style={modalSelect}>
                  {POSITION_ORDER.map((p) => <option key={p} value={p}>{POSITION_LABEL[p]}</option>)}
                </select>
              </label>
              <label style={modalField}>To
                <select value={to} onChange={(e) => setTo(e.target.value)} style={modalSelect}>
                  {POSITION_ORDER.map((p) => <option key={p} value={p}>{POSITION_LABEL[p]}</option>)}
                </select>
              </label>
            </div>
            <label style={{ ...modalField, marginBottom: 18 }}>Timeline
              <div style={{ display: "flex", gap: 8 }}>
                <input type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ ...modalSelect, width: 80 }} />
                <select value={unit} onChange={(e) => setUnit(e.target.value)} style={modalSelect}>
                  <option value="months">months</option>
                  <option value="years">years</option>
                </select>
              </div>
            </label>
            {error && <div style={{ ...errBanner, marginBottom: 14 }}>{error}</div>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button onClick={onClose} disabled={busy} style={modalBtn}>Cancel</button>
              <button onClick={submit} disabled={busy} style={modalBtnPrimary(busy)}>{busy ? "Scheduling…" : "Save"}</button>
            </div>
          </>
        )}
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

// Name, position badge, track tag(s) (one per enrolled track shown when the
// dropdown is on "All tracks", just the one otherwise), and core-course
// progress scoped to whatever the dropdown currently shows. "N/A" instead
// of a progress bar when the account isn't enrolled in any track yet —
// not just when the current filter happens to have zero core courses.
function ProfileStrip({ me, position, trackTags, hasTracks, coreComplete, coreTotal }) {
  const pct = coreTotal ? Math.round((coreComplete / coreTotal) * 100) : 0;
  return (
    <section style={{ ...card, marginBottom: 18, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <Avatar person={me} size={44} />
        <div>
          <div style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 17, color: "var(--ink)" }}>{me.name || me.username}</div>
          {(position || trackTags.length > 0) && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
              {position && (
                <span style={{ fontSize: 11.5, fontWeight: 700, borderRadius: 999, padding: "3px 10px", background: "#ece9fb", color: "#5c4ea3" }}>
                  {POSITION_LABEL[position] || position}
                </span>
              )}
              {trackTags.map((name) => (
                <span key={name} style={{ fontSize: 11.5, fontWeight: 700, borderRadius: 999, padding: "3px 10px", background: "#e8f0ff", color: "var(--blue)" }}>{name}</span>
              ))}
            </div>
          )}
        </div>
      </div>
      <div style={{ minWidth: 220, textAlign: "right" }}>
        {hasTracks ? (
          <>
            <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 6 }}>
              <strong style={{ color: "var(--ink)" }}>{coreComplete} of {coreTotal}</strong> core courses complete
            </div>
            <ProgressBar pct={pct} />
          </>
        ) : (
          <div style={{ fontSize: 13, color: "var(--muted)", fontWeight: 700 }}>N/A</div>
        )}
      </div>
    </section>
  );
}

// The next 2 courses, not yet complete/skipped: dated ones first (soonest
// target_date first), then undated ones filling any remaining slots in the
// roadmap's own order (courses arrives already sorted intern -> principal,
// tier order, track/stage/created_at — that's the "order" fallback).
// target_date is a suggestion the learner sets themselves via the edit
// icon here, never an enforced deadline — editable anytime, no locking
// check. Date picks are staged locally (drafts) and only sent when the
// confirm tick is clicked, not on every keystroke/pick. Sync re-fetches
// in case editing elsewhere changed what qualifies.
//
// The soonest/next pick (upcoming[0]) auto-flips not_started -> in_progress
// — "this is the one you're on now" — the moment it becomes the top pick,
// not on any click. Guarded by a ref so the same course only gets the
// start call once per mount, not on every re-render.
function UpNextCard({ courses, onSetTargetDate, onSync, syncing, onAutoStart, onAutoSchedule }) {
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState({}); // courseId -> date string, staged until confirmed
  const today = new Date().toISOString().slice(0, 10);

  const eligible = courses.filter((c) => c.status !== "complete" && c.status !== "skipped");
  const dated = eligible.filter((c) => c.target_date).sort((a, b) => new Date(a.target_date) - new Date(b.target_date));
  const undated = eligible.filter((c) => !c.target_date);
  const upcoming = [...dated, ...undated].slice(0, 2);

  const startedRef = useRef(new Set());
  useEffect(() => {
    const top = upcoming[0];
    if (top && top.status === "not_started" && !startedRef.current.has(top.id)) {
      startedRef.current.add(top.id);
      onAutoStart(top.id);
    }
  }, [upcoming[0]?.id, upcoming[0]?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const startEditing = () => { setDrafts({}); setEditing(true); };
  // Only sends what actually changed, and only on confirm — typing/picking a
  // date never talks to the server by itself.
  const confirmEditing = () => {
    for (const [courseId, dateStr] of Object.entries(drafts)) {
      const original = upcoming.find((c) => c.id === courseId)?.target_date;
      if (dateStr !== toDateStr(original)) onSetTargetDate(courseId, dateStr || null);
    }
    setDrafts({});
    setEditing(false);
  };

  return (
    <section style={card}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 15 }}>📅</span>
          <h2 style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 15, color: "var(--ink)", margin: 0 }}>Up next</h2>
          <button
            onClick={onSync}
            disabled={syncing}
            className="icon-tip"
            data-tip="Refresh which courses show here"
            aria-label="Refresh which courses show here"
            style={{ border: "1px solid var(--line)", background: "var(--card)", borderRadius: 6, width: 26, height: 26, fontSize: 12.5, lineHeight: 1, cursor: syncing ? "wait" : "pointer", opacity: syncing ? 0.6 : 1 }}
          >
            🔄
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button
            onClick={onAutoSchedule}
            className="icon-tip"
            data-tip="Auto Schedule"
            aria-label="Auto Schedule"
            style={{ border: "1px solid var(--line)", background: "var(--card)", borderRadius: 6, width: 26, height: 26, fontSize: 12.5, lineHeight: 1, cursor: "pointer" }}
          >
            🪄
          </button>
          <button
            onClick={startEditing}
            className="icon-tip"
            data-tip="Suggest a target date for these courses"
            aria-label="Suggest a target date for these courses"
            style={{ border: "1px solid var(--line)", background: editing ? "var(--bg)" : "var(--card)", borderRadius: 6, width: 26, height: 26, fontSize: 12.5, lineHeight: 1, cursor: "pointer" }}
          >
            ✏️
          </button>
          {editing && (
            <button
              onClick={confirmEditing}
              className="icon-tip"
              data-tip="Done editing"
              aria-label="Done editing"
              style={{ border: "1px solid #bfe3c9", background: "#e6f4ea", color: "#1f7a3c", borderRadius: 6, width: 26, height: 26, fontSize: 13, lineHeight: 1, cursor: "pointer" }}
            >
              ✓
            </button>
          )}
        </div>
      </div>
      {upcoming.length === 0 ? (
        <p style={{ fontSize: 12.5, color: "var(--muted)", margin: 0, lineHeight: 1.5 }}>
          Nothing left to plan — every course is complete or skipped.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {upcoming.map((c, i) => {
            const status = STATUS_META[c.status] || STATUS_META.not_started;
            return (
              <div key={c.id} style={{ padding: i > 0 ? "12px 0 0" : "0 0 12px", borderTop: i > 0 ? "1px solid var(--line)" : "none" }}>
                <div style={{ fontWeight: 700, fontSize: 13.5, color: "var(--ink)", marginBottom: 6 }}>{c.title}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={statusPill(c.status)}>{status.label}</span>
                  {editing ? (
                    <input
                      type="date"
                      min={today}
                      value={drafts[c.id] ?? toDateStr(c.target_date)}
                      onChange={(e) => setDrafts((d) => ({ ...d, [c.id]: e.target.value }))}
                      style={{ border: "1px solid var(--line)", borderRadius: 6, padding: "3px 6px", fontSize: 11.5, color: "var(--ink)" }}
                    />
                  ) : (
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>
                      {c.target_date ? `Target ${fmtDate(c.target_date)}` : "No target set"}{c.est_hours != null ? ` · ${c.est_hours} hrs` : ""}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// The 3 most recently completed courses, with their wrap-up quiz stats —
// questions, when, and first-try accuracy. quiz_total_questions/
// quiz_correct_first_try are a snapshot taken at completion (queries.js ->
// completeCourse), not a live join, so a course whose quiz changed later
// still shows what was actually answered. Both null for a course completed
// before this existed (or completed with no stats sent) — shown honestly as
// "No quiz data recorded" rather than a fabricated number.
// inProgressCourse: the account's own current in_progress pick (from the
// already-fetched journey list — no extra fetch), shown as one more row
// below the completions so the card also points at what's next, not just
// what's done. Null when nothing's in progress; no fallback fabricated.
function KnowledgeArtifactsCard({ completions, inProgressCourse }) {
  return (
    <section style={card}>
      <h2 style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 15, color: "var(--ink)", margin: "0 0 2px" }}>Knowledge artifacts</h2>
      <p style={{ fontSize: 12, color: "var(--muted)", margin: "0 0 12px" }}>Your most recently completed quizzes</p>
      {completions.length === 0 ? (
        <p style={{ fontSize: 12.5, color: "var(--muted)", margin: 0, lineHeight: 1.5 }}>
          Complete a course's wrap-up quiz to see your results here.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {completions.map((c, i) => {
            const hasStats = c.quiz_total_questions != null && c.quiz_correct_first_try != null;
            const accuracy = hasStats && c.quiz_total_questions > 0
              ? Math.round((c.quiz_correct_first_try / c.quiz_total_questions) * 100)
              : null;
            return (
              <div key={c.id} style={{ padding: i > 0 ? "10px 0 0" : "0 0 10px", borderTop: i > 0 ? "1px solid var(--line)" : "none" }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: "var(--ink)", marginBottom: 4 }}>{c.title}</div>
                <div style={{ fontSize: 11.5, color: "var(--muted)" }}>
                  {hasStats
                    ? `${c.quiz_total_questions} question${c.quiz_total_questions === 1 ? "" : "s"} · ${relTime(c.completed_at)} · ${accuracy}% accuracy`
                    : `No quiz data recorded · ${relTime(c.completed_at)}`}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {inProgressCourse && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: "var(--ink)", marginBottom: 4 }}>{inProgressCourse.title}</div>
          <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 6 }}>
            In progress — waiting on the wrap-up quiz for more information
          </div>
          <Link href={`/learning-hub/journey/${inProgressCourse.id}/quiz`} style={{ fontSize: 11.5, fontWeight: 700, color: "var(--blue)", textDecoration: "none" }}>
            Take the quiz →
          </Link>
        </div>
      )}
    </section>
  );
}

export default function JourneyPage() {
  const { user: me } = useSession();
  const [journey, setJourney] = useState([]);
  const [recentCompletions, setRecentCompletions] = useState([]);
  const [err, setErr] = useState("");
  const [ready, setReady] = useState(false);
  const [view, setView] = useState("list");
  const [skipTarget, setSkipTarget] = useState(null);
  const [skipping, setSkipping] = useState(false);
  const [skipErr, setSkipErr] = useState("");
  const [resetting, setResetting] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState("all");
  const [position, setPosition] = useState(null);
  const [syncingUpNext, setSyncingUpNext] = useState(false);
  const [autoScheduleOpen, setAutoScheduleOpen] = useState(false);

  // Landing back here from /api/calendar/connect/callback — ?calendar=connected
  // means the consent just succeeded, so reopen Auto Schedule right where the
  // learner left off rather than making them click the wand a second time.
  // Any other value is a real failure, shown as the page's own error banner.
  // Read via window.location rather than next/navigation's useSearchParams so
  // this client component doesn't need a Suspense boundary just for this.
  useEffect(() => {
    const cal = new URLSearchParams(window.location.search).get("calendar");
    if (!cal) return;
    if (cal === "connected") setAutoScheduleOpen(true);
    else if (cal !== "cancelled") setErr("Couldn't connect Google Calendar — try again from the Auto Schedule button.");
    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  const load = useCallback(async () => {
    setErr("");
    try {
      const { courses, position: pos, recentCompletions: completions } = await api("/api/journey");
      setJourney(courses);
      setPosition(pos);
      setRecentCompletions(completions || []);
    } catch (e) { setErr(e.message); } finally { setReady(true); }
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
  // Knowledge artifacts' "waiting on the quiz" row — the account's current
  // in_progress pick, across every enrolled track (not scoped to the track
  // dropdown, same as recentCompletions isn't). Already on hand from the
  // journey fetch, so no extra request. First match is enough: in practice
  // there's only ever one, since only the top Up next pick auto-starts.
  const inProgressCourse = journey.find((c) => c.status === "in_progress") || null;
  // Core-course progress for the profile strip, scoped to whatever the
  // track dropdown currently shows.
  const coreCourses = filteredJourney.filter((c) => c.priority === "core");
  const coreComplete = coreCourses.filter((c) => c.status === "complete").length;
  // "All tracks" shows a tag per enrolled track; one specific track shows just that one.
  const trackTags = selectedTrack === "all" ? trackOptions.map((t) => t.name) : trackOptions.filter((t) => t.id === selectedTrack).map((t) => t.name);

  const resetJourney = async () => {
    if (!confirm("Reset your journey back to the original track? This clears all recorded progress and skips, any custom reordering, and any target dates you've set — every course reverts to not started (only Intern stays unlocked). Any Auto Schedule events on your Google Calendar are deleted too.")) return;
    setResetting(true);
    setErr("");
    try {
      const { calendarError } = await api("/api/journey/reset", { method: "POST" });
      await load();
      // Non-fatal: the roadmap reset already succeeded by this point — this
      // just tells the learner their Google Calendar may still have a
      // leftover event or two to clear by hand.
      if (calendarError) setErr(calendarError);
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

  // Optimistic — updates immediately so the date input doesn't feel laggy;
  // resyncs from the server on failure rather than leaving a stale value.
  const setCourseTarget = (courseId, dateStr) => {
    setJourney((cs) => cs.map((c) => (c.id === courseId ? { ...c, target_date: dateStr } : c)));
    api(`/api/courses/${courseId}/target`, { method: "POST", body: JSON.stringify({ target_date: dateStr }) })
      .catch((e) => { setErr(e.message); load(); });
  };

  const syncUpNext = async () => {
    setSyncingUpNext(true);
    try { await load(); } finally { setSyncingUpNext(false); }
  };

  // Best-effort and silent — this is a background auto-signal, not a user
  // action, so a failure here shouldn't surface a scary error banner.
  const autoStartCourse = (courseId) => {
    setJourney((cs) => cs.map((c) => (c.id === courseId ? { ...c, status: "in_progress" } : c)));
    api(`/api/courses/${courseId}/start`, { method: "POST" }).catch(() => {});
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
      <main style={{ maxWidth: 1080, margin: "0 auto", padding: "24px 22px 0" }}>
        {me === undefined || (me && !ready) ? (
          <Loading label="Loading your journey" />
        ) : (
          <>
            <ProfileStrip
              me={me}
              position={position}
              trackTags={trackTags}
              hasTracks={journey.length > 0}
              coreComplete={coreComplete}
              coreTotal={coreCourses.length}
            />
            <div style={{ display: "flex", gap: 18, alignItems: "flex-start", flexWrap: "wrap" }}>
            <section style={{ ...card, flex: "2 1 480px", minWidth: 0 }}>
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
              <JourneyTable courses={filteredJourney} onReorder={reorderStage} readOnly={selectedTrack !== "all"} />
            ) : (
              <JourneyMindMap courses={filteredJourney} onRequestSkip={(c) => { setSkipErr(""); setSkipTarget(c); }} />
            )}
          </section>

          <div style={{ display: "flex", flexDirection: "column", gap: 18, flex: "1 1 260px", minWidth: 260 }}>
            <UpNextCard courses={filteredJourney} onSetTargetDate={setCourseTarget} onSync={syncUpNext} syncing={syncingUpNext} onAutoStart={autoStartCourse} onAutoSchedule={() => setAutoScheduleOpen(true)} />
            <KnowledgeArtifactsCard completions={recentCompletions} inProgressCourse={inProgressCourse} />
          </div>
          </div>
          </>
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

      {autoScheduleOpen && (
        <AutoScheduleModal
          currentPosition={position}
          onClose={() => setAutoScheduleOpen(false)}
          onScheduled={load}
        />
      )}
    </div>
  );
}
