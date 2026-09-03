"use client";

// Your Journey: every course across the tracks you're enrolled in, as a
// List view only — ordered intern -> principal, scrolled after ~7 rows.
// Restricted to what's expected of this account BY NOW: an Intern only
// sees the Intern tier, a Junior sees Intern + Junior, and so on
// (isExpectedByNow, shared.js — the same rule the % completion numbers
// use). Finishing every course in your own tier earns early access to
// ONE stage ahead — never more (effectivePosition, shared.js: Intern who's
// done -> sees through Junior, Junior who's done -> sees through Middle,
// "max +1 stage"). The full roadmap, including tiers beyond that, is still
// visible on the Mind map (Learner Dashboard) — that view is meant to show
// the road ahead, this one is meant to show what's actually on your plate
// right now (plus whatever you've just earned).
// Rows are drag-reorderable (persisted per account on
// course_assignments.position) — a drop only lands on a row in the same
// position tier, so a drag can never move a course into a different stage.
// This is the ONLY place reordering happens; the Mind map (moved to the
// Learner Dashboard — features/learning/LearnerDashboardPage.jsx) just
// displays whatever order this table's query already returns.
// Reordering is disabled (readOnly) whenever a single track is selected in
// the filter, rather than "All tracks": reorderStage writes position for
// every course in a tier at once, but a tier can span more than one track —
// dragging while filtered to one track would only see (and rewrite) that
// track's slice of the tier, leaving the other track's same-tier courses
// with stale positions.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import Avatar from "@/components/Avatar";
import Loading from "@/components/Loading";
import { useSession } from "@/features/auth/SessionProvider";
import { api } from "@/lib/apiClient";
import useRevalidateOnFocus from "@/lib/useRevalidateOnFocus";
import {
  card, errBanner, STATUS_META, statusPill, POSITION_LABEL, POSITION_ORDER, HEADER_H, ROW_H, VISIBLE_ROWS, th, td,
  fmtDate, toDateStr, relTime, todayStr, nextAnnualReviewDateStr, addMonthsDateStr, monthsUntilDateStr,
  formatMonthDay, DEFAULT_ANNUAL_REVIEW_MONTH_DAY, isExpectedByNow, effectivePosition, isTierDone,
} from "@/features/learning/shared";
import ProgressBar from "@/features/learning/ProgressBar";

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

const modalBtn = { border: "1px solid var(--line)", background: "var(--card)", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, color: "var(--body)", cursor: "pointer", textDecoration: "none", display: "inline-block" };
const modalBtnPrimary = (busy) => ({ border: "none", background: "var(--blue)", color: "#fff", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: busy ? "wait" : "pointer", opacity: busy ? 0.7 : 1 });
const modalField = { display: "flex", flexDirection: "column", gap: 5, fontSize: 11.5, fontWeight: 700, color: "var(--muted)", flex: 1 };
const modalSelect = { border: "1px solid var(--line)", borderRadius: 8, padding: "7px 8px", fontSize: 13, color: "var(--ink)", fontWeight: 500, background: "var(--card)" };
const quickPick = { border: "1px solid var(--line)", background: "var(--bg)", borderRadius: 999, padding: "5px 12px", fontSize: 11.5, fontWeight: 700, color: "var(--body)", cursor: "pointer" };

// Asks for a position range ("From" defaults to the learner's own current
// seniority) and a "Complete by" date — defaults to the next occurrence of
// the annual review (annualReviewDate, an admin-editable MM-DD — see Team
// view's header, TeamPage.jsx), so a roadmap naturally targets "done before
// the review" unless the learner picks something tighter (the quick-picks
// below, or typing any other date directly — e.g. someone busy who'd rather
// compress the same courses into 3 months). The date is converted to the
// fractional-months number the server actually wants (monthsUntilDateStr —
// see shared.js) only on submit; the field itself always shows the real
// calendar date, not a derived duration.
// Save calls the auto-schedule endpoint, which both books Google Calendar
// events AND writes target_date on each course, same field Up next's own
// pencil-edit writes — so results show up there immediately once
// onScheduled() reloads the journey.
//
// A 409 with error: "not_connected" means this account has never granted
// (or has since revoked) Google Calendar access — that's not a failure to
// show as an error banner, it's a real, expected first-run state, so it gets
// its own "Connect Google Calendar" screen instead. That's a real browser
// navigation (an <a>, not a fetch), since it has to leave the app for
// Google's consent screen and come back to a fresh page load.
function AutoScheduleModal({ currentPosition, annualReviewDate, onClose, onScheduled }) {
  const [from, setFrom] = useState(currentPosition || POSITION_ORDER[0]);
  const [to, setTo] = useState(currentPosition || POSITION_ORDER[POSITION_ORDER.length - 1]);
  const [targetDate, setTargetDate] = useState(nextAnnualReviewDateStr(annualReviewDate));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [needsConnect, setNeedsConnect] = useState(false);

  const submit = async () => {
    if (targetDate <= todayStr()) { setError("Pick a date after today."); return; }
    setBusy(true); setError(""); setResult(null); setNeedsConnect(false);
    const timeline_months = monthsUntilDateStr(targetDate);
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
            <label style={modalField}>Complete by
              <input
                type="date"
                min={todayStr()}
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                style={modalSelect}
              />
            </label>
            <p style={{ fontSize: 11, color: "var(--muted)", margin: "6px 0 8px" }}>
              Defaults to this year's annual review ({formatMonthDay(annualReviewDate || DEFAULT_ANNUAL_REVIEW_MONTH_DAY)}). Busy? Pick a closer date to compress the same courses into a tighter timeline.
            </p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 18 }}>
              <button type="button" onClick={() => setTargetDate(nextAnnualReviewDateStr(annualReviewDate))} style={quickPick}>
                Annual review · {formatMonthDay(annualReviewDate || DEFAULT_ANNUAL_REVIEW_MONTH_DAY)}
              </button>
              <button type="button" onClick={() => setTargetDate(addMonthsDateStr(3))} style={quickPick}>3 months</button>
              <button type="button" onClick={() => setTargetDate(addMonthsDateStr(6))} style={quickPick}>6 months</button>
            </div>
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

// Name, position badge, track tag(s) (one per enrolled track shown when the
// TRACK filter dropdown is on "All tracks", just the one otherwise), and
// core-course progress. "N/A" instead of a progress bar when the account
// isn't enrolled in any track yet — not just when the current filter
// happens to have zero core courses.
//
// A SEPARATE small selector (own local state, not the track filter above)
// appears only once early access is earned (visiblePosition !== position —
// effectivePosition, shared.js): "my level" shows the same cumulative
// "through X" number as always; "early access" swaps to the next tier's
// OWN core courses (nextTierCoreComplete/Total, computed by the parent) so
// the learner can monitor the bonus material on its own terms, not folded
// into a number that's already sitting near 100% because the tier below it
// is what earned the early access in the first place.
function ProfileStrip({ me, position, visiblePosition, trackTags, hasTracks, coreComplete, coreTotal, nextTierCoreComplete, nextTierCoreTotal, calendarConnected }) {
  const [scope, setScope] = useState("mine");
  const earlyAccess = Boolean(visiblePosition) && visiblePosition !== position;
  const showingNext = earlyAccess && scope === "next";
  const complete = showingNext ? nextTierCoreComplete : coreComplete;
  const total = showingNext ? nextTierCoreTotal : coreTotal;
  const pct = total ? Math.round((complete / total) * 100) : 0;
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
          {/* Permanent home for Calendar-connect — Get Started's own
              Calendar step is skippable, so this is where "do it later"
              actually happens. Same /api/calendar/connect route Auto
              Schedule's own connect flow uses, but back to the Learning Hub
              landing page (?returnTo=/learning-hub) rather than reopening
              Auto Schedule here — this button isn't part of that flow. */}
          <div style={{ marginTop: 8 }}>
            {calendarConnected ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, border: "1px solid #bfe3c9", background: "#e6f4ea", borderRadius: 999, padding: "4px 10px", fontSize: 11, fontWeight: 700, color: "#1f7a3c" }}>
                ✓ Google Calendar connected
              </span>
            ) : (
              <a href="/api/calendar/connect?returnTo=/learning-hub" style={{ display: "inline-flex", alignItems: "center", gap: 5, border: "1px solid #cddcff", background: "#e8f0ff", borderRadius: 999, padding: "4px 10px", fontSize: 11, fontWeight: 700, color: "var(--blue)", textDecoration: "none" }}>
                📅 Connect Google Calendar
              </a>
            )}
          </div>
        </div>
      </div>
      <div style={{ minWidth: 220, textAlign: "right" }}>
        {hasTracks ? (
          <>
            {earlyAccess && (
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                title="You've unlocked early access to the next stage — pick which one to monitor here"
                style={{ marginBottom: 6, border: "1px solid var(--line)", background: "var(--bg)", borderRadius: 8, padding: "3px 8px", fontSize: 11.5, fontWeight: 700, color: "var(--ink)" }}
              >
                <option value="mine">{POSITION_LABEL[position] || position}</option>
                <option value="next">{POSITION_LABEL[visiblePosition] || visiblePosition} · early access</option>
              </select>
            )}
            <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 6 }}>
              <strong style={{ color: "var(--ink)" }}>{complete} of {total}</strong> core courses complete
              {showingNext ? (
                <span style={{ color: "var(--faint)" }}> · {POSITION_LABEL[visiblePosition] || visiblePosition} only</span>
              ) : (
                position && <span style={{ color: "var(--faint)" }}> · through {POSITION_LABEL[position] || position}</span>
              )}
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

// Up next's action row (see UpNextCard). Auto Schedule is the headline
// action — a labeled, accented pill, always visible. Refresh and Edit dates
// are lower-frequency (Refresh is mostly a defensive re-fetch; editing a
// target date is occasional, not a per-visit action), so they live behind
// the "⋯" menu (UpNextMenu below) instead of competing for header space.
const pillBtnAccent = { display: "inline-flex", alignItems: "center", gap: 5, border: "1px solid #cddcff", background: "#e8f0ff", borderRadius: 999, padding: "5px 12px", fontSize: 11.5, fontWeight: 700, color: "var(--blue)", cursor: "pointer", whiteSpace: "nowrap" };
const pillBtnDone = { display: "inline-flex", alignItems: "center", gap: 5, border: "1px solid #bfe3c9", background: "#e6f4ea", borderRadius: 999, padding: "5px 12px", fontSize: 11.5, fontWeight: 700, color: "#1f7a3c", cursor: "pointer", whiteSpace: "nowrap" };
// Milestone banners (tierJustFinished/atCeiling, below) — same light-blue
// accent combo as pillBtnAccent above, not the generic green a progress-app
// reflex reaches for by default. Skedulo's own brand palette (CLAUDE.md)
// is navy/blue; it has no green in it, so a green "success" banner would
// be the one thing on this page that isn't actually on-brand.
const milestoneBanner = { background: "#e8f0ff", border: "1px solid #cddcff", color: "var(--navy)", borderRadius: 8, padding: "10px 14px", fontSize: 12.5, fontWeight: 600, marginBottom: 14 };
const ellipsisBtn = { border: "1px solid var(--line)", background: "var(--card)", borderRadius: 8, width: 28, height: 28, fontSize: 15, lineHeight: 1, color: "var(--muted)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 };
const menuPopover = { position: "absolute", top: "calc(100% + 6px)", right: 0, background: "var(--card)", border: "1px solid var(--line)", borderRadius: 10, boxShadow: "0 8px 24px rgba(10,22,44,0.16)", padding: 6, display: "flex", flexDirection: "column", gap: 2, minWidth: 170, zIndex: 30 };
const menuItem = { display: "flex", alignItems: "center", gap: 8, border: "none", background: "none", borderRadius: 6, padding: "8px 10px", fontSize: 12.5, fontWeight: 600, color: "var(--body)", cursor: "pointer", textAlign: "left", width: "100%" };

// "⋯" overflow for Up next's lower-frequency actions (Refresh, Edit dates).
// Click-to-open, click-outside-to-close — same idiom AppHeader's own avatar
// menu uses (a mousedown listener checked against a ref), not hover, since
// hover menus don't work on touch and are easy to trigger by accident.
function UpNextMenu({ onRefresh, syncing, onEdit }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const hoverable = (e, on) => { e.currentTarget.style.background = on ? "var(--bg)" : "none"; };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="More actions"
        aria-haspopup="true"
        aria-expanded={open}
        style={ellipsisBtn}
      >
        ⋯
      </button>
      {open && (
        <div style={menuPopover}>
          <button
            onClick={() => { setOpen(false); onRefresh(); }}
            disabled={syncing}
            style={{ ...menuItem, cursor: syncing ? "wait" : "pointer", opacity: syncing ? 0.6 : 1 }}
            onMouseEnter={(e) => hoverable(e, true)}
            onMouseLeave={(e) => hoverable(e, false)}
          >
            🔄 {syncing ? "Refreshing…" : "Refresh"}
          </button>
          <button
            onClick={() => { setOpen(false); onEdit(); }}
            style={menuItem}
            onMouseEnter={(e) => hoverable(e, true)}
            onMouseLeave={(e) => hoverable(e, false)}
          >
            ✏️ Edit dates
          </button>
        </div>
      )}
    </div>
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
function UpNextCard({ courses, onSetTargetDate, onSync, syncing, onAutoStart, onAutoSchedule, calendarConnected }) {
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
      {/* Single row: title left, actions right — Auto Schedule is the only
          always-visible, labeled action; Refresh/Edit dates live behind the
          "⋯" menu (lower-frequency actions, see UpNextMenu above). While
          editing, the menu is replaced by a visible "✓ Done" pill in the
          same slot, so exiting edit mode never requires reopening a menu. */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 15 }}>📅</span>
          <h2 style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 15, color: "var(--ink)", margin: 0 }}>Up next</h2>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {/* Greyed out (not just left to fail on click) once Calendar isn't
              connected — connecting is skippable during Get Started, and
              this is the one thing that stops being available afterward
              until it's done, from the profile strip above or here.
              AutoScheduleModal's own 409 `needsConnect` screen stays as a
              defensive fallback for a connection that dies between this
              page's load and the click. */}
          <button
            onClick={calendarConnected ? onAutoSchedule : undefined}
            disabled={!calendarConnected}
            aria-label={calendarConnected ? "Auto Schedule — book study time on your calendar" : "Auto Schedule — connect Google Calendar first, above"}
            className={calendarConnected ? undefined : "icon-tip"}
            data-tip={calendarConnected ? undefined : "Connect Google Calendar first — see your profile above"}
            style={calendarConnected ? pillBtnAccent : { ...pillBtnAccent, background: "var(--bg)", border: "1px solid var(--line)", color: "var(--faint)", cursor: "not-allowed" }}
          >
            🪄 Auto Schedule
          </button>
          {editing ? (
            <button onClick={confirmEditing} aria-label="Done editing target dates" style={pillBtnDone}>
              ✓ Done
            </button>
          ) : (
            <UpNextMenu onRefresh={onSync} syncing={syncing} onEdit={startEditing} />
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
  const { user: me, refresh } = useSession();
  const router = useRouter();
  const [journey, setJourney] = useState([]);
  const [recentCompletions, setRecentCompletions] = useState([]);
  const [err, setErr] = useState("");
  const [ready, setReady] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState("all");
  const [position, setPosition] = useState(null);
  const [syncingUpNext, setSyncingUpNext] = useState(false);
  const [autoScheduleOpen, setAutoScheduleOpen] = useState(false);
  const [annualReviewDate, setAnnualReviewDate] = useState(DEFAULT_ANNUAL_REVIEW_MONTH_DAY);
  const [calendarConnected, setCalendarConnected] = useState(false);

  // The admin-editable annual review date (Team view's header — TeamPage.jsx)
  // that Auto Schedule defaults its "Complete by" field to. Fetched once on
  // mount, independent of load() below — it's a global setting, not part of
  // this account's own journey, and any signed-in user can read it (GET
  // /api/settings — only writing it is admin-only). Falls back to the same
  // default shared.js itself uses if this fails, so Auto Schedule still has
  // a sane date to default to.
  useEffect(() => {
    if (!me) return;
    api("/api/settings").then(({ settings }) => setAnnualReviewDate(settings.annual_review_date))
      .catch(() => {});
  }, [me]);

  // Landing back here from /api/calendar/connect/callback — ?calendar=connected
  // means the consent just succeeded, so reopen Auto Schedule right where the
  // learner left off rather than making them click the wand a second time.
  // Any other value is a real failure, shown as the page's own error banner.
  // Read via window.location rather than next/navigation's useSearchParams so
  // this client component doesn't need a Suspense boundary just for this.
  //
  // The Get Started wizard's own Calendar step passes ?returnTo=/learning-hub
  // (app/api/calendar/connect/route.js), so it lands there directly and
  // never touches this page in the common case. This bounce is a defensive
  // fallback for the one other way a not-yet-onboarded visitor can still
  // reach Google Calendar-connect while sitting on THIS page: Auto
  // Schedule's own inline prompt (a 409 mid-modal), which doesn't pass
  // returnTo and defaults back here on purpose (see 4.7's own comment) — if
  // that happens before the account has enrolled in a track, send them to
  // /learning-hub instead, same param, so the wizard is what reopens and
  // resumes rather than this page reacting to a param the wizard actually
  // owns. Gated on `me` actually having loaded, so a not-yet-resolved
  // session can't misread as "not onboarded" and bounce someone who's
  // really done with setup.
  useEffect(() => {
    if (me === undefined) return;
    const cal = new URLSearchParams(window.location.search).get("calendar");
    if (!cal) return;
    if (!me.onboarded) { router.replace(`/learning-hub?calendar=${encodeURIComponent(cal)}`); return; }
    if (cal === "connected") setAutoScheduleOpen(true);
    else if (cal !== "cancelled") setErr("Couldn't connect Google Calendar — try again from the Auto Schedule button.");
    window.history.replaceState({}, "", window.location.pathname);
  }, [me]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async () => {
    setErr("");
    try {
      const { courses, position: pos, recentCompletions: completions, calendarConnected: cc } = await api("/api/journey");
      setJourney(courses);
      setPosition(pos);
      setRecentCompletions(completions || []);
      setCalendarConnected(Boolean(cc));
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
  // The List (and Up next, below) only show courses in tiers at or below
  // this account's current position — an Intern sees the Intern tier, a
  // Junior sees Intern + Junior, and so on (isExpectedByNow, shared.js).
  // Once every course in the account's OWN tier is complete/skipped,
  // they've earned one stage of early access too (effectivePosition —
  // "max +1 stage": Intern -> Junior, Junior -> Middle, never further),
  // computed off the FULL journey (every enrolled track), not
  // filteredJourney — whether you've finished your stage shouldn't depend
  // on which track happens to be selected in the dropdown.
  //
  // Deliberately NOT used for the % completion numbers below (coreCourses
  // stays on the raw, officially-assigned position) — % completion is a
  // graded expectation, and earning early access to bonus material you
  // haven't had time to touch yet shouldn't make your score go DOWN the
  // moment you unlock it. % only grows to cover a new tier once an admin
  // actually reassigns the account's position, same as before this feature.
  //
  // trackOptions/trackTags above deliberately stay unrestricted: which
  // tracks you're ENROLLED in is a different fact from which courses are
  // relevant to see right now.
  const visiblePosition = effectivePosition(journey, position);
  const visibleJourney = filteredJourney.filter((c) => isExpectedByNow(c, visiblePosition));
  // The "max +1 stage" cap is flat, not recursive (effectivePosition,
  // shared.js) — so someone who finishes the +1 stage TOO hits a wall:
  // nothing new becomes visible until an admin reassigns their position.
  // atCeiling catches that exact state (earned +1, AND that +1 tier is
  // also fully done) so the empty-handed moment gets an explicit message
  // instead of just... nothing happening.
  const atCeiling = visiblePosition !== position && isTierDone(journey, visiblePosition);
  // Whether the account has an early-access tier at all to unlock (false
  // once you're already at the top of the ladder — effectivePosition caps
  // at the last position rather than going past it, so finishing Principal
  // never makes visiblePosition diverge from position). Shared by the
  // congrats banner below and, identically, by ProfileStrip's own selector.
  const earlyAccess = position && visiblePosition !== position;
  // The congrats banner below fires the moment the account's OWN official
  // tier alone is done — real courses required, not vacuously true for an
  // empty tier (isTierDone alone would say "done" for a tier with zero
  // courses in it, which isn't an achievement). Deliberately checked
  // BEFORE atCeiling, and suppressed once atCeiling is also true (below) —
  // atCeiling is a strictly later state (it requires this tier done AND
  // the +1 tier done too), so once reached, its own "you've completed
  // everything visible" message supersedes this one rather than stacking
  // two congrats banners.
  const ownTierCourses = journey.filter((c) => c.expected_by_position === position);
  const tierJustFinished = position && ownTierCourses.length > 0 && isTierDone(journey, position);
  // Knowledge artifacts' "waiting on the quiz" row — the account's current
  // in_progress pick, across every enrolled track (not scoped to the track
  // dropdown, same as recentCompletions isn't). Already on hand from the
  // journey fetch, so no extra request. First match is enough: in practice
  // there's only ever one, since only the top Up next pick auto-starts.
  const inProgressCourse = journey.find((c) => c.status === "in_progress") || null;
  // Core-course progress for the profile strip — the RAW position, not
  // visiblePosition/visibleJourney (see the comment above visibleJourney's
  // own definition for why the % stays uncoupled from early access).
  const coreCourses = filteredJourney.filter((c) => c.priority === "core" && isExpectedByNow(c, position));
  const coreComplete = coreCourses.filter((c) => c.status === "complete").length;
  // The early-access tier's OWN core courses only (expected_by_position ===
  // visiblePosition), not accumulated with the tier(s) below it the way
  // coreCourses above is ("through X"). That lower tier is already fully
  // done — early access only unlocks once it is — so folding it back in
  // would just show ~100% again and tell the learner nothing about the
  // bonus material they just unlocked. ProfileStrip only surfaces this
  // (as a second, selectable view) once visiblePosition !== position.
  const nextTierCoreCourses = filteredJourney.filter((c) => c.priority === "core" && c.expected_by_position === visiblePosition);
  const nextTierCoreComplete = nextTierCoreCourses.filter((c) => c.status === "complete").length;
  // "All tracks" shows a tag per enrolled track; one specific track shows just that one.
  const trackTags = selectedTrack === "all" ? trackOptions.map((t) => t.name) : trackOptions.filter((t) => t.id === selectedTrack).map((t) => t.name);

  // A full account reset, not just course progress — clears
  // course_assignments, un-enrolls from every track (account_tracks — the
  // Get Started gateway's own "onboarded" check reads this), clears the
  // assigned role (user_role), and disconnects Google Calendar
  // (calendar_connections). Lands back on /learning-hub afterward, since
  // that's now the same gateway a genuinely new account sees — the whole
  // point of resetting this much is being able to re-test Get Started
  // itself, not just re-run the roadmap with the same setup still in place.
  const resetJourney = async () => {
    if (!confirm("Reset your account completely? This clears all course progress (skips, custom order, target dates), un-enrolls you from every track, clears your assigned role, and disconnects Google Calendar — deleting any Auto Schedule events booked there too. You'll land back on the Get Started gateway, exactly like a brand-new account.")) return;
    setResetting(true);
    setErr("");
    try {
      const { calendarError } = await api("/api/journey/reset", { method: "POST" });
      await refresh(); // session's onboarded flips back to false
      if (calendarError) {
        // Non-fatal: everything else already reset successfully by this
        // point — stay here (rather than navigating on) so the learner
        // actually sees that Google Calendar may still have a leftover
        // event or two to clear by hand.
        await load();
        setErr(calendarError);
        setResetting(false);
        return;
      }
      router.push("/learning-hub");
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
              visiblePosition={visiblePosition}
              trackTags={trackTags}
              hasTracks={journey.length > 0}
              coreComplete={coreComplete}
              coreTotal={coreCourses.length}
              nextTierCoreComplete={nextTierCoreComplete}
              nextTierCoreTotal={nextTierCoreCourses.length}
              calendarConnected={calendarConnected}
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
                  {position
                    ? visiblePosition !== position
                      ? `Showing Intern through ${POSITION_LABEL[visiblePosition] || visiblePosition} — you've finished ${POSITION_LABEL[position] || position} and unlocked early access to the next stage — across every track you're enrolled in.`
                      : `Showing Intern through ${POSITION_LABEL[position] || position} — your current stage — across every track you're enrolled in.`
                    : "Ordered intern → principal, across every track you're enrolled in."}
                  {" "}Drag a row to reorder it within its stage.
                </p>
              </div>
              {(journey.length > 0 || position || calendarConnected) && (
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, maxWidth: "100%" }}>
                  <button
                    onClick={resetJourney}
                    disabled={resetting}
                    title="Clear course progress, tracks, role, and Google Calendar — back to a brand-new account"
                    style={{ border: "1px solid var(--line)", background: "var(--card)", borderRadius: 8, padding: "0 14px", height: 30, fontSize: 12.5, fontWeight: 700, color: "var(--muted)", cursor: resetting ? "wait" : "pointer", whiteSpace: "nowrap" }}
                  >
                    {resetting ? "Resetting…" : "Reset everything"}
                  </button>
                </div>
              )}
            </div>
            {err && <div style={{ ...errBanner, marginBottom: 14 }}>{err}</div>}
            {tierJustFinished && !atCeiling && (
              // Fires once, the moment the account's own official tier is
              // fully done — the real annual-review milestone. Suppressed
              // once atCeiling (below) is also true, so this doesn't stack
              // with that later, more-complete message.
              <div style={milestoneBanner}>
                {earlyAccess ? (
                  <>🎉 You've completed every course in {POSITION_LABEL[position] || position} — you're all set for your annual review on {formatMonthDay(annualReviewDate)}. Early access to {POSITION_LABEL[visiblePosition] || visiblePosition} is open now — your {POSITION_LABEL[position] || position} completion rate for this review stays exactly as it is, whatever you do next.</>
                ) : (
                  <>🎉 You've completed every course in {POSITION_LABEL[position] || position} — you've reached the top of the ladder, and you're all set for your annual review on {formatMonthDay(annualReviewDate)}.</>
                )}
              </div>
            )}
            {atCeiling && (
              // The +1 cap is flat (effectivePosition, shared.js) — finishing
              // that stage too doesn't push it to +2, so without this the
              // learner would just see the same fully-complete list with no
              // explanation of why nothing new ever shows up.
              <div style={milestoneBanner}>
                🎉 You've completed everything visible through {POSITION_LABEL[visiblePosition] || visiblePosition} — the next stage unlocks once your manager updates your level.
              </div>
            )}
            {journey.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--muted)" }}>Nothing here yet — enroll in a track from the Learning Hub to start your journey.</div>
            ) : filteredJourney.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--muted)" }}>No courses in this track.</div>
            ) : visibleJourney.length === 0 ? (
              // The track has courses, just none at or below the current stage yet
              // (e.g. a track whose earliest tier is above where this account is) —
              // a different situation from "no courses in this track," so it gets
              // its own message rather than reusing that one.
              <div style={{ fontSize: 13, color: "var(--muted)" }}>
                Nothing in this track for the {POSITION_LABEL[visiblePosition] || visiblePosition} stage yet — check back as you progress.
              </div>
            ) : (
              <JourneyTable courses={visibleJourney} onReorder={reorderStage} readOnly={selectedTrack !== "all"} />
            )}
          </section>

          <div style={{ display: "flex", flexDirection: "column", gap: 18, flex: "1 1 260px", minWidth: 260 }}>
            <UpNextCard courses={visibleJourney} onSetTargetDate={setCourseTarget} onSync={syncUpNext} syncing={syncingUpNext} onAutoStart={autoStartCourse} onAutoSchedule={() => setAutoScheduleOpen(true)} calendarConnected={calendarConnected} />
            <KnowledgeArtifactsCard completions={recentCompletions} inProgressCourse={inProgressCourse} />
          </div>
          </div>
          </>
        )}
      </main>

      {autoScheduleOpen && (
        <AutoScheduleModal
          currentPosition={position}
          annualReviewDate={annualReviewDate}
          onClose={() => setAutoScheduleOpen(false)}
          onScheduled={load}
        />
      )}
    </div>
  );
}
