"use client";

// Up next's 🪄 button (JourneyPage.jsx) — the editable, day-to-day Auto
// Schedule tool. The Get Started wizard has its own, separate step for a
// FIXED Intern-through-your-level range (AutoScheduleStep,
// LearningHubPage.jsx) — deliberately not this component, since letting a
// brand-new account pick an arbitrary range at setup time isn't the same
// job as this one; that step duplicates the small amount of matching logic
// (the date field, the endpoint call) rather than bending this component's
// editable-range shape to also support a locked one.

import { useState } from "react";
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
// Google's consent screen and come back to a fresh page load — back to
// /learning-hub/journey specifically, so it reopens right where the
// learner left off (see app/api/calendar/connect/route.js's own ?returnTo).
export default function AutoScheduleModal({ currentPosition, annualReviewDate, onClose, onScheduled }) {
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
