"use client";

// Up next's 🪄 button (JourneyPage.jsx) — the editable, day-to-day Auto
// Schedule tool. The Get Started wizard has its own, separate step for a
// FIXED Intern-through-your-level range (AutoScheduleStep,
// LearningHubPage.jsx) — deliberately not this component, since letting a
// brand-new account pick an arbitrary range at setup time isn't the same
// job as this one; that step duplicates the small amount of matching logic
// (the date field, the endpoint call) rather than bending this component's
// editable-range shape to also support a locked one.

import { useEffect, useState } from "react";
import { api } from "@/lib/apiClient";
import {
  errBanner, POSITION_LABEL, POSITION_ORDER, fmtDate, todayStr,
  nextAnnualReviewDateStr, addMonthsDateStr, monthsUntilDateStr,
  formatMonthDay, DEFAULT_ANNUAL_REVIEW_MONTH_DAY,
} from "@/features/learning/shared";

const modalBtn = { border: "1px solid var(--line)", background: "var(--card)", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, color: "var(--body)", cursor: "pointer", textDecoration: "none", display: "inline-block" };
const modalBtnPrimary = (busy) => ({ border: "none", background: "var(--blue)", color: "#fff", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: busy ? "wait" : "pointer", opacity: busy ? 0.7 : 1 });
const modalField = { display: "flex", flexDirection: "column", gap: 5, fontSize: 11.5, fontWeight: 700, color: "var(--muted)", flex: 1 };
const modalSelect = { border: "1px solid var(--line)", borderRadius: 8, padding: "7px 8px", fontSize: 13, color: "var(--ink)", fontWeight: 500, background: "var(--card)" };
const modalLabel = { fontSize: 11.5, fontWeight: 700, color: "var(--muted)", marginBottom: 5 };
const quickPick = { border: "1px solid var(--line)", background: "var(--bg)", borderRadius: 999, padding: "5px 12px", fontSize: 11.5, fontWeight: 700, color: "var(--body)", cursor: "pointer" };
// The selected state of a quick-pick that's a real persistent choice (study
// session length), not just a one-off shortcut like the "Complete by" date
// quick-picks below (which never stay visually "chosen" — the date field
// itself is the source of truth for those). Same pill shape, filled with
// the brand blue instead of the neutral canvas tint.
const quickPickSelected = { ...quickPick, border: "1px solid var(--blue)", background: "var(--blue)", color: "#fff" };

// Auto Schedule's own study-session-length choices — the only three this
// form offers, validated against this exact list server-side too
// (app/api/courses/auto-schedule/route.js's own ALLOWED_SESSION_HOURS).
const SESSION_LENGTH_OPTIONS = [
  { label: "15 min", hours: 0.25 },
  { label: "30 min", hours: 0.5 },
  { label: "1 hour", hours: 1 },
];

// A "?" badge next to the header explains the calculation this modal's own
// title doesn't have room for — same computeSchedule() logic on both this
// form and the wizard's AutoScheduleStep, so this same explanation applies
// wherever it's shown. .icon-tip-wide (globals.css) lets the tip actually
// wrap instead of running a paragraph off the edge of the screen.
const HOW_IT_WORKS_HINT = "Each course's estimated hours are split into sessions of your chosen length (the last one may be shorter). Sessions land on the earliest open weekday slot — 9am–6pm, never 11am–1pm lunch — one per day per course, working around your calendar.";
const helpBadge = { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 16, height: 16, borderRadius: "50%", border: "1px solid var(--line)", background: "none", color: "var(--muted)", fontSize: 10.5, fontWeight: 700, cursor: "help", padding: 0 };

// Asks for a position range — capped at the learner's own current level, or
// one level further once early access to it is earned (ceiling/earlyAccess
// below) — scoped to whichever track is currently selected on Your Journey
// (trackId/trackName, passed down from JourneyPage.jsx's own track filter —
// there's no separate track choice in this form). Picking a range surfaces
// every not-yet-done course it currently covers as a scrollable checklist
// (eligibleCourses, derived from the `journey` prop — the same array
// JourneyPage.jsx already has loaded, so this needs no extra fetch and
// re-derives instantly as From/To change) — every course starts checked,
// and unchecking one just leaves it for a later run rather than excluding
// it from the roadmap. Below that, a "Complete by"
// date — defaults to the next occurrence of
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
// Google's consent screen and come back to a fresh page load — back to
// /learning/journey specifically, so it reopens right where the
// learner left off (see app/api/calendar/connect/route.js's own ?returnTo).
export default function AutoScheduleModal({ currentPosition, visiblePosition, trackId, trackName, journey, annualReviewDate, onClose, onScheduled }) {
  // Never lets you plan past your own level — or one level further once
  // early access to it is earned (effectivePosition, shared.js).
  const ceiling = visiblePosition || currentPosition || POSITION_ORDER[POSITION_ORDER.length - 1];
  const ceilingIdx = POSITION_ORDER.indexOf(ceiling);
  const allowedPositions = ceilingIdx === -1 ? POSITION_ORDER : POSITION_ORDER.slice(0, ceilingIdx + 1);
  const earlyAccess = Boolean(visiblePosition) && visiblePosition !== currentPosition;

  // Early access means the old range is already fully booked — default
  // straight to the newly unlocked level instead of re-offering it.
  const [from, setFrom] = useState(earlyAccess ? ceiling : (currentPosition || POSITION_ORDER[0]));
  const [to, setTo] = useState(ceiling);
  const [sessionHours, setSessionHours] = useState(0.5); // 30 min default
  const [targetDate, setTargetDate] = useState(nextAnnualReviewDateStr(annualReviewDate));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [needsConnect, setNeedsConnect] = useState(false);
  const [overflowWarning, setOverflowWarning] = useState(null);

  // Every not-yet-done course the current From/To + track actually covers —
  // same three conditions getCoursesForAutoSchedule() (queries.js) filters
  // on server-side (track, position range, status not complete/skipped),
  // computed here client-side from the journey the caller already has
  // loaded rather than a round trip, so the list updates the instant From/To
  // changes. journey's own order (getJourney()'s SQL) already sorts by
  // position tier then roadmap_order, so no re-sort is needed here.
  const fromIdx = POSITION_ORDER.indexOf(from);
  const toIdx = POSITION_ORDER.indexOf(to);
  const eligibleCourses = journey.filter((c) => {
    if (trackId && c.track_id !== trackId) return false;
    const idx = POSITION_ORDER.indexOf(c.expected_by_position);
    if (idx < 0 || idx < fromIdx || idx > toIdx) return false;
    return c.status !== "complete" && c.status !== "skipped";
  });
  const eligibleKey = eligibleCourses.map((c) => c.id).join(",");

  // Every eligible course starts checked — unchecking one just leaves it
  // for a later run. Resets to "all checked" whenever the eligible SET
  // itself changes (From/To or track), not preserved piecemeal across a
  // range change, since a course that dropped out of range wouldn't mean
  // anything to keep track of anyway.
  const [selectedCourseIds, setSelectedCourseIds] = useState(() => new Set(eligibleCourses.map((c) => c.id)));
  useEffect(() => {
    setSelectedCourseIds(new Set(eligibleCourses.map((c) => c.id)));
  }, [eligibleKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggleCourse = (id) => setSelectedCourseIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const allCoursesChecked = selectedCourseIds.size === eligibleCourses.length && eligibleCourses.length > 0;

  // confirmOverflow is only ever true when re-called from the warning
  // screen's own "Schedule anyway" button below — the form's Save button
  // always starts a fresh check. A response carrying `warning:
  // "timeline_exceeded"` (app/api/courses/auto-schedule/route.js) means
  // nothing was booked yet: one or more courses would finish after the
  // "Complete by" date picked below, so this shows that list instead of
  // treating the call as done.
  const submit = async (confirmOverflow = false) => {
    if (targetDate <= todayStr()) { setError("Pick a date after today."); return; }
    setBusy(true); setError(""); setResult(null); setNeedsConnect(false);
    if (!confirmOverflow) setOverflowWarning(null);
    const timeline_months = monthsUntilDateStr(targetDate);
    try {
      const res = await api("/api/courses/auto-schedule", {
        method: "POST",
        body: JSON.stringify({
          from_position: from, to_position: to, timeline_months, session_hours: sessionHours,
          track_id: trackId, course_ids: [...selectedCourseIds], confirm_overflow: confirmOverflow,
        }),
      });
      if (res.warning === "timeline_exceeded") {
        setOverflowWarning(res);
      } else {
        setResult(res);
        if (res.scheduled?.length) onScheduled();
      }
    } catch (e) {
      if (e.message === "not_connected") setNeedsConnect(true);
      else setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(10,22,44,0.5)", zIndex: 220, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      {/* Header/body/footer as three flex rows, not one flat block — the
          body is the only one that scrolls (maxHeight below is the whole
          card's budget, minus the header/footer it never gives up), so a
          long scheduled-courses list (result screen, a big track) scrolls
          in place instead of pushing the Got it button off-screen with no
          way back to it. */}
      <div style={{ background: "var(--card)", borderRadius: 14, width: 440, maxWidth: "100%", maxHeight: "calc(100vh - 40px)", boxShadow: "0 20px 60px rgba(10,22,44,0.35)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 17, color: "var(--ink)", padding: "24px 24px 6px" }}>
          🪄 Auto Schedule
          <button type="button" className="icon-tip icon-tip-wide" data-tip={HOW_IT_WORKS_HINT} aria-label="How Auto Schedule calculates sessions" style={helpBadge}>?</button>
        </div>

        {needsConnect ? (
          <>
            <div style={{ padding: "0 24px", overflowY: "auto", flex: "1 1 auto", minHeight: 0 }}>
              <p style={{ fontSize: 13, color: "var(--body)", margin: "0 0 18px", lineHeight: 1.5 }}>
                Connect your Google Calendar first — this only asks once. You'll come back here automatically.
              </p>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "0 24px 24px" }}>
              <button onClick={onClose} style={modalBtn}>Cancel</button>
              <a href="/api/calendar/connect" style={{ ...modalBtn, border: "none", background: "var(--blue)", color: "#fff" }}>Connect Google Calendar</a>
            </div>
          </>
        ) : overflowWarning ? (
          <>
            <div style={{ padding: "0 24px", overflowY: "auto", flex: "1 1 auto", minHeight: 0 }}>
              <p style={{ fontSize: 13, color: "var(--body)", margin: "0 0 14px", lineHeight: 1.5 }}>
                {overflowWarning.overflowing.length} course{overflowWarning.overflowing.length === 1 ? "" : "s"} won't finish by {fmtDate(overflowWarning.target_date)} at this session length — there isn't enough room in that timeline. Go back and pick a longer "Complete by" date or a longer session, or schedule anyway and let these run over.
              </p>
              <div style={{ marginBottom: 12, display: "flex", flexDirection: "column", gap: 4 }}>
                {overflowWarning.overflowing.map((c) => (
                  <div key={c.course_id} style={{ fontSize: 12.5, color: "var(--body)" }}>
                    <strong>{c.title}</strong> — finishes {fmtDate(c.finishes_at)}, {c.overdue_days} day{c.overdue_days === 1 ? "" : "s"} late
                  </div>
                ))}
              </div>
              {error && <div style={{ ...errBanner, marginBottom: 14 }}>{error}</div>}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "14px 24px 24px", borderTop: "1px solid var(--line)", marginTop: 4 }}>
              <button onClick={() => setOverflowWarning(null)} disabled={busy} style={modalBtn}>Back</button>
              <button onClick={() => submit(true)} disabled={busy} style={modalBtnPrimary(busy)}>{busy ? "Scheduling…" : "Schedule anyway"}</button>
            </div>
          </>
        ) : result ? (
          <>
            <div style={{ padding: "0 24px", overflowY: "auto", flex: "1 1 auto", minHeight: 0 }}>
              <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "0 0 14px" }}>
                {result.message || (result.scheduled.length > 0
                  ? `Booked ${result.scheduled.reduce((sum, s) => sum + s.sessions_booked, 0)} study session${result.scheduled.reduce((sum, s) => sum + s.sessions_booked, 0) === 1 ? "" : "s"} across ${result.scheduled.length} course${result.scheduled.length === 1 ? "" : "s"}.`
                  : "Couldn't book any study sessions — see below.")}
              </p>
              {result.scheduled?.length > 0 && (
                <div style={{ marginBottom: 12, display: "flex", flexDirection: "column", gap: 4 }}>
                  {result.scheduled.map((s) => (
                    <div key={s.course_id} style={{ fontSize: 12.5, color: "var(--body)" }}>
                      <strong>{s.title}</strong> — {s.sessions_booked} session{s.sessions_booked === 1 ? "" : "s"}, starting {fmtDate(s.target_date)}
                      {s.sessions_booked < s.sessions_planned && <span style={{ color: "var(--muted)" }}> · fewer than planned, ran out of room</span>}
                    </div>
                  ))}
                </div>
              )}
              {result.skipped?.length > 0 && (
                <div style={{ marginBottom: 12, display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--muted)" }}>Couldn't place {result.skipped.length}:</div>
                  {result.skipped.map((s) => (
                    <div key={s.course_id} style={{ fontSize: 12, color: "var(--muted)" }}>{s.title} — {s.reason}</div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", padding: "14px 24px 24px", borderTop: "1px solid var(--line)", marginTop: 4 }}>
              <button onClick={onClose} style={modalBtnPrimary(false)}>Got it</button>
            </div>
          </>
        ) : (
          <>
            <div style={{ padding: "0 24px", overflowY: "auto", flex: "1 1 auto", minHeight: 0 }}>
              <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "0 0 18px", lineHeight: 1.5 }}>
                Splits every checked course in {trackName || "this track"}, in this range, into study sessions of the length you pick below, working around your existing meetings.
              </p>
              <div style={{ display: "flex", gap: 10, marginBottom: allowedPositions.length < POSITION_ORDER.length ? 6 : 14 }}>
                <label style={modalField}>From
                  <select value={from} onChange={(e) => setFrom(e.target.value)} style={modalSelect}>
                    {allowedPositions.map((p) => <option key={p} value={p}>{POSITION_LABEL[p]}</option>)}
                  </select>
                </label>
                <label style={modalField}>To
                  <select value={to} onChange={(e) => setTo(e.target.value)} style={modalSelect}>
                    {allowedPositions.map((p) => <option key={p} value={p}>{POSITION_LABEL[p]}</option>)}
                  </select>
                </label>
              </div>
              {allowedPositions.length < POSITION_ORDER.length && (
                <p style={{ fontSize: 11, color: "var(--muted)", margin: "0 0 14px" }}>
                  {earlyAccess
                    ? `You've unlocked ${POSITION_LABEL[ceiling]} early access — Auto Schedule covers just that level until your own level officially updates.`
                    : `Capped at your current level (${POSITION_LABEL[ceiling]}) — finish it to unlock early access to the next one.`}
                </p>
              )}
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                  <div style={modalLabel}>
                    {eligibleCourses.length === 0 ? "Courses in this range" : `Courses in this range (${selectedCourseIds.size} of ${eligibleCourses.length} selected)`}
                  </div>
                  {eligibleCourses.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelectedCourseIds(allCoursesChecked ? new Set() : new Set(eligibleCourses.map((c) => c.id)))}
                      style={{ background: "none", border: "none", color: "var(--blue)", fontSize: 11, fontWeight: 700, cursor: "pointer", padding: 0 }}
                    >
                      {allCoursesChecked ? "Deselect all" : "Select all"}
                    </button>
                  )}
                </div>
                {eligibleCourses.length === 0 ? (
                  <p style={{ fontSize: 12, color: "var(--muted)", margin: 0 }}>
                    Nothing to schedule in that range — every course there is already complete or skipped.
                  </p>
                ) : (
                  <div style={{ border: "1px solid var(--line)", borderRadius: 8, maxHeight: 190, overflowY: "auto" }}>
                    {eligibleCourses.map((c) => (
                      <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 10px", borderTop: "1px solid var(--line)", cursor: "pointer" }}>
                        <input type="checkbox" checked={selectedCourseIds.has(c.id)} onChange={() => toggleCourse(c.id)} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink)" }}>{c.title}</div>
                          <div style={{ fontSize: 10.5, color: "var(--muted)" }}>
                            {POSITION_LABEL[c.expected_by_position] || c.expected_by_position}{c.est_hours != null ? ` · ${c.est_hours} hrs` : ""}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ marginBottom: 14 }}>
                <div style={modalLabel}>How long is a study session you'd like?</div>
                <div style={{ display: "flex", gap: 6 }}>
                  {SESSION_LENGTH_OPTIONS.map((opt) => (
                    <button
                      key={opt.hours}
                      type="button"
                      onClick={() => setSessionHours(opt.hours)}
                      style={sessionHours === opt.hours ? quickPickSelected : quickPick}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
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
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "14px 24px 24px" }}>
              <button onClick={onClose} disabled={busy} style={modalBtn}>Cancel</button>
              <button onClick={() => submit(false)} disabled={busy || selectedCourseIds.size === 0} style={modalBtnPrimary(busy)}>{busy ? "Scheduling…" : "Save"}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
