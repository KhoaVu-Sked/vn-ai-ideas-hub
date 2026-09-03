"use client";

// Learning Hub: pick a track, preview its roadmap, get enrolled. The
// cross-track roadmap list lives on its own page — see JourneyPage.
//
// Two states, gated on me.onboarded (features/accounts/queries.js's
// getProfile — has this account enrolled in at least one track, ever):
//   - not onboarded: a first-time gateway (GetStartedGateway) replaces the
//     browse UI below and opens OnboardingWizard on "Start Your Journey."
//   - onboarded: today's "Your tracks"/"Suggested tracks" browse UI, for
//     enrolling in additional tracks later — unchanged.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import Loading from "@/components/Loading";
import { useSession } from "@/features/auth/SessionProvider";
import { api } from "@/lib/apiClient";
import useRevalidateOnFocus from "@/lib/useRevalidateOnFocus";
import {
  card, errBanner, STATUS_META, statusPill, POSITION_LABEL, POSITION_ORDER, DEFAULT_ANNUAL_REVIEW_MONTH_DAY,
  todayStr, nextAnnualReviewDateStr, addMonthsDateStr, monthsUntilDateStr, formatMonthDay,
} from "@/features/learning/shared";

// "Completed" replaces "Enrolled" once every course in the track is done
// for THIS account (complete_count === course_count, and there's at least
// one course — an empty track never reads as "completed"). Same badge,
// just a different label, so it shows wherever this card does: both "Your
// tracks" and "Suggested tracks" use the same component — and so does the
// onboarding wizard's track-picker (TracksStep, below).
function TrackCard({ track, onPreview }) {
  const completed = track.course_count > 0 && track.complete_count === track.course_count;
  return (
    <button
      onClick={() => onPreview(track.id)}
      style={{
        textAlign: "left", cursor: "pointer", background: "var(--card)", border: "1px solid var(--line)",
        borderRadius: 14, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 8,
        fontFamily: "inherit", transition: "box-shadow 0.15s, border-color 0.15s",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 8px 24px rgba(10,22,44,0.10)"; e.currentTarget.style.borderColor = "#c9d3e6"; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.borderColor = "var(--line)"; }}
    >
      <div style={{ width: 34, height: 34, borderRadius: 9, background: "var(--blue)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 14 }}>
        {track.name.slice(0, 1)}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 15.5, color: "var(--ink)" }}>{track.name}</div>
        {track.assigned && (
          <span style={{ fontSize: 10.5, fontWeight: 700, borderRadius: 999, padding: "2px 8px", background: "#e6f4ea", color: "#1f7a3c" }}>
            {completed ? "Completed" : "Enrolled"}
          </span>
        )}
      </div>
      <div style={{ fontSize: 12.5, color: "var(--muted)" }}>{track.course_count} course{track.course_count === 1 ? "" : "s"}</div>
      <div style={{ fontSize: 12.5, color: "var(--blue)", fontWeight: 700, marginTop: 4 }}>Preview roadmap →</div>
    </button>
  );
}

function CourseRow({ course, index }) {
  const status = STATUS_META[course.status] || STATUS_META.not_started;
  const position = POSITION_LABEL[course.expected_by_position] || course.expected_by_position;
  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 12, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 26, height: 26, flexShrink: 0, borderRadius: "50%", background: "var(--bg)", color: "var(--muted)", fontWeight: 700, fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {index}
        </div>
        <div style={{ fontWeight: 700, fontSize: 14, color: "var(--ink)", flex: 1 }}>{course.title}</div>
        <span style={statusPill(course.status)}>{status.label}</span>
      </div>
      <div style={{ fontSize: 12, color: "var(--muted)", paddingLeft: 36 }}>
        {[course.platform, course.est_hours != null ? `${course.est_hours} hrs` : null, course.cost].filter(Boolean).join(" · ")}
        {position && <span style={{ marginLeft: 8, padding: "1px 8px", borderRadius: 999, background: "var(--bg)", fontSize: 11, fontWeight: 600 }}>Expected by: {position}</span>}
        {course.priority && <span style={{ marginLeft: 6, padding: "1px 8px", borderRadius: 999, background: "var(--bg)", fontSize: 11, fontWeight: 600, textTransform: "capitalize" }}>{course.priority}</span>}
      </div>
      {course.outcome && <div style={{ fontSize: 12.5, color: "var(--body)", paddingLeft: 36 }}>{course.outcome}</div>}
      {course.link && (
        <div style={{ paddingLeft: 36 }}>
          <a href={course.link} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12.5, color: "var(--blue)", fontWeight: 700, textDecoration: "none" }}>View course →</a>
        </div>
      )}
    </div>
  );
}

function TrackPreview({ trackId, onClose, onAssignedChange }) {
  const [track, setTrack] = useState(null);
  const [err, setErr] = useState("");
  const [ready, setReady] = useState(false);
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    let live = true;
    setReady(false);
    setErr("");
    api(`/api/tracks/${trackId}`).then(({ track: t }) => { if (live) { setTrack(t); setReady(true); } })
      .catch((e) => { if (live) { setErr(e.message); setReady(true); } });
    return () => { live = false; };
  }, [trackId]);

  // One-directional — enrolling is a real commitment, not a toggle (see
  // enrollInTrack(), features/learning/queries.js, for why), so this is
  // only ever called while !track.assigned; the button itself becomes a
  // plain non-interactive "Enrolled ✓" once it's true, below.
  const enroll = async () => {
    setAssigning(true);
    try {
      const { assigned } = await api(`/api/tracks/${trackId}/assignment`, { method: "POST" });
      setTrack((t) => ({ ...t, assigned }));
      onAssignedChange(trackId, assigned);
    } catch (e) {
      setErr(e.message);
    } finally {
      setAssigning(false);
    }
  };

  const stages = track ? [...new Set(track.courses.map((c) => c.stage || "Other"))] : [];
  let running = 0;

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(10,22,44,0.5)", zIndex: 200, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 20px", overflowY: "auto" }}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: "var(--card)", borderRadius: 16, width: 760, maxWidth: "100%", boxShadow: "0 20px 60px rgba(10,22,44,0.35)", overflow: "hidden" }}>
        <div style={{ padding: "22px 26px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 20, color: "var(--ink)" }}>{track ? track.name : "Loading…"}</div>
            <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2 }}>
              {track ? `Ordered by stage · ${track.courses.length} course${track.courses.length === 1 ? "" : "s"}` : " "}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {track && (
              track.assigned ? (
                <span
                  title="You can't remove a track from your inventory once you've enrolled."
                  style={{ border: "1px solid #bfe3c9", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, background: "#e6f4ea", color: "#1f7a3c", whiteSpace: "nowrap", cursor: "default" }}
                >
                  Enrolled ✓
                </span>
              ) : (
                <button
                  onClick={enroll}
                  disabled={assigning}
                  title="Enroll yourself in this track — this can't be undone later"
                  style={{ border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: assigning ? "wait" : "pointer", background: "var(--blue)", color: "#fff", opacity: assigning ? 0.7 : 1, whiteSpace: "nowrap" }}
                >
                  {assigning ? "…" : "Enroll"}
                </button>
              )
            )}
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--muted)", lineHeight: 1, padding: 4 }} aria-label="Close">×</button>
          </div>
        </div>

        <div style={{ padding: "22px 26px", maxHeight: "70vh", overflowY: "auto" }}>
          {!ready ? (
            <Loading label="Loading roadmap" />
          ) : err ? (
            <div style={errBanner}>{err}</div>
          ) : track.courses.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--muted)" }}>No courses in this track yet.</div>
          ) : (
            stages.map((stage) => (
              <div key={stage} style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--muted)", letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 8 }}>{stage}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {track.courses.filter((c) => (c.stage || "Other") === stage).map((c) => {
                    running += 1;
                    return <CourseRow key={c.id} course={c} index={running} />;
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ── Get Started gateway + onboarding wizard ──────────────────────────

const wizardTitle = { fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 19, color: "var(--ink)", margin: "0 0 6px" };
const wizardSubtext = { fontSize: 13, color: "var(--muted)", margin: "0 0 18px", lineHeight: 1.5 };
const wizardBtn = { border: "1px solid var(--line)", background: "var(--card)", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 700, color: "var(--body)", cursor: "pointer", textDecoration: "none", display: "inline-block" };
const wizardBtnPrimary = (busy) => ({ border: "none", background: "var(--blue)", color: "#fff", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: busy ? "wait" : "pointer", opacity: busy ? 0.7 : 1, textDecoration: "none", display: "inline-block" });
const roleOption = { textAlign: "left", border: "1px solid var(--line)", background: "var(--card)", borderRadius: 10, padding: "12px 16px", fontSize: 14, fontWeight: 700, color: "var(--ink)", cursor: "pointer" };
const successBanner = { background: "#e6f4ea", border: "1px solid #bfe3c9", color: "#1f7a3c", borderRadius: 8, padding: "8px 12px", fontSize: 12.5, marginBottom: 14 };
const wizardField = { display: "flex", flexDirection: "column", gap: 5, fontSize: 11.5, fontWeight: 700, color: "var(--muted)", flex: 1 };
const wizardSelect = { border: "1px solid var(--line)", borderRadius: 8, padding: "7px 8px", fontSize: 13, color: "var(--ink)", fontWeight: 500, background: "var(--card)" };
const wizardLockedValue = { border: "1px solid var(--line)", borderRadius: 8, padding: "7px 8px", fontSize: 13, color: "var(--ink)", fontWeight: 700, background: "var(--bg)" };
const wizardQuickPick = { border: "1px solid var(--line)", background: "var(--bg)", borderRadius: 999, padding: "5px 12px", fontSize: 11.5, fontWeight: 700, color: "var(--body)", cursor: "pointer" };

// First-time-only replacement for "Your tracks"/"Suggested tracks" (the
// user's explicit ask: remove the browse UI, add one animated button).
// .start-journey-btn's keyframes live in app/globals.css, next to every
// other animation this app defines.
function GetStartedGateway({ onStart }) {
  return (
    <section style={{ ...card, textAlign: "center", minHeight: "60vh", padding: "64px 32px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18 }}>
      <div style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 26, color: "var(--ink)" }}>Welcome to AI Learning Hub</div>
      <p style={{ fontSize: 14, color: "var(--muted)", maxWidth: 440, margin: 0, lineHeight: 1.6 }}>
        Set your position, optionally connect Google Calendar, enroll in tracks, and auto-schedule your study time.
      </p>
      <button className="start-journey-btn" onClick={onStart}>🚀 Start Your Journey</button>
    </section>
  );
}

function RoleStep({ onPicked, refresh }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const pick = async (position) => {
    setBusy(true);
    setErr("");
    try {
      await api("/api/onboarding/position", { method: "POST", body: JSON.stringify({ position }) });
      // Step 4 (AutoScheduleStep) fixes its "to" range to this same position
      // — refresh so me.position is current by the time it's reached,
      // rather than whatever it was when this wizard first opened.
      await refresh();
      onPicked();
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  };

  return (
    <>
      <div style={wizardTitle}>What's your current position?</div>
      <p style={wizardSubtext}>This sets which courses show up on your roadmap first — an admin can change it later.</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
        {POSITION_ORDER.map((p) => (
          <button key={p} onClick={() => pick(p)} disabled={busy} style={{ ...roleOption, opacity: busy ? 0.6 : 1, cursor: busy ? "wait" : "pointer" }}>
            {POSITION_LABEL[p]}
          </button>
        ))}
      </div>
      {err && <div style={errBanner}>{err}</div>}
    </>
  );
}

// Skedulo-themed stand-in for a native confirm() — same gate (Continue
// without connecting stays blocked until this is dismissed one way or the
// other), styled to match the rest of this wizard instead of the browser's
// own unstyled dialog. Amber accent — STATUS_META's own "skipped" tone
// (shared.js), the same register JourneyPage's "Calendar not connected" Up
// next banner already uses: a caution, not an error (errBanner's red) or a
// milestone (successBanner's blue). z-index above the wizard's own 150,
// same idea as TrackPreview(200)/AutoScheduleModal(220) stacking above it.
const skipWarnIcon = { width: 40, height: 40, borderRadius: "50%", background: "#fff4e0", color: "#a15c00", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19, flexShrink: 0 };
function CalendarSkipWarningModal({ onCancel, onConfirm }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(10,22,44,0.5)", zIndex: 250, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div style={{ background: "var(--card)", borderRadius: 14, padding: 24, width: 420, maxWidth: "100%", boxShadow: "0 20px 60px rgba(10,22,44,0.35)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 18 }}>
          <span aria-hidden="true" style={skipWarnIcon}>⚠️</span>
          <div>
            <div style={{ ...wizardTitle, margin: "0 0 4px" }}>Continue without Google Calendar?</div>
            <p style={{ fontSize: 13, color: "var(--body)", margin: 0, lineHeight: 1.5 }}>
              Auto Schedule won't be available, and your dashboard — including what your leadership team sees — may look incomplete until you connect it. You can always connect later from your profile.
            </p>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={onCancel} style={wizardBtn}>Cancel</button>
          <button onClick={onConfirm} style={wizardBtnPrimary(false)}>Continue anyway</button>
        </div>
      </div>
    </div>
  );
}

// calendarConnected can be true here even on a FIRST visit to this step
// (reached via the wizard's own Back button after already connecting from
// a later step, or if it connected between renders) — that state skips
// CalendarSkipWarningModal entirely, since there's nothing left to warn
// about.
function CalendarStep({ calendarConnected, onContinue }) {
  const [warnOpen, setWarnOpen] = useState(false);

  return (
    <>
      <div style={wizardTitle}>Connect Google Calendar</div>
      {calendarConnected ? (
        <>
          <p style={wizardSubtext}>
            <span style={{ color: "#1f7a3c", fontWeight: 700 }}>✓ Connected.</span> Auto Schedule can book real study time around your existing meetings.
          </p>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button onClick={onContinue} style={wizardBtnPrimary(false)}>Continue →</button>
          </div>
        </>
      ) : (
        <>
          <p style={wizardSubtext}>
            Optional. Auto Schedule (on Your Journey) uses this to book real study time around your existing
            meetings — you can connect later from your profile if you'd rather continue without it for now.
          </p>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button onClick={() => setWarnOpen(true)} style={wizardBtn}>Continue</button>
            <a href="/api/calendar/connect?returnTo=/learning-hub" style={wizardBtnPrimary(false)}>Connect Google Calendar</a>
          </div>
        </>
      )}
      {warnOpen && (
        <CalendarSkipWarningModal
          onCancel={() => setWarnOpen(false)}
          onConfirm={() => { setWarnOpen(false); onContinue(); }}
        />
      )}
    </>
  );
}

// Checkbox multi-select — pick as many tracks as you want, enroll in all of
// them at once with a single Continue, rather than the one-at-a-time
// select-then-click cycle this used to be. Nothing is written until
// Continue is clicked, so checking/unchecking beforehand is free — the
// one-directional enrollInTrack() rule (features/learning/queries.js: once
// a track is added it can't be removed) only ever applies to what's
// actually been committed, never to a still-pending checkbox. Already-
// enrolled tracks show as a plain, non-selectable row instead of a
// checkbox — there's nothing left to pick there.
function TracksStep({ tracks, onPreview, onEnrollMany, onContinue }) {
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [continuing, setContinuing] = useState(false);
  const [err, setErr] = useState("");
  const enrolledCount = tracks.filter((t) => t.assigned).length;
  const canContinue = (enrolledCount > 0 || selectedIds.size > 0) && !continuing;

  const toggle = (id) => setSelectedIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const handleContinue = async () => {
    setErr("");
    setContinuing(true);
    try {
      if (selectedIds.size > 0) await onEnrollMany([...selectedIds]);
      onContinue(); // wizard-level: advances step, this component unmounts
    } catch (e) {
      setErr(e.message);
      setContinuing(false);
    }
  };

  return (
    <>
      <div style={wizardTitle}>Browse tracks &amp; enroll</div>
      <p style={wizardSubtext}>Select any tracks you want to start — a track can't be removed from your inventory once it's added, so choose the ones you actually mean to start. You can enroll in more later from the Learning Hub.</p>
      {tracks.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16 }}>No tracks yet.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16, maxHeight: 280, overflowY: "auto", paddingRight: 2 }}>
          {tracks.map((t) => (
            <div key={t.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, border: "1px solid var(--line)", borderRadius: 10, padding: "10px 14px", background: t.assigned ? "var(--bg)" : "var(--card)" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0, cursor: t.assigned ? "default" : "pointer" }}>
                {t.assigned ? (
                  <span aria-hidden="true" style={{ width: 16, height: 16, borderRadius: "50%", background: "#1f7a3c", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 10 }}>✓</span>
                ) : (
                  <input type="checkbox" checked={selectedIds.has(t.id)} onChange={() => toggle(t.id)} style={{ flexShrink: 0, width: 16, height: 16 }} />
                )}
                <span style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5, color: "var(--ink)" }}>{t.name}</div>
                  <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{t.course_count} course{t.course_count === 1 ? "" : "s"}</div>
                </span>
              </label>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                <button type="button" onClick={() => onPreview(t.id)} style={{ background: "none", border: "none", color: "var(--blue)", fontSize: 12, fontWeight: 700, cursor: "pointer", padding: 0 }}>Preview →</button>
                {t.assigned && <span style={{ fontSize: 11, fontWeight: 700, color: "#1f7a3c", whiteSpace: "nowrap" }}>Enrolled ✓</span>}
              </div>
            </div>
          ))}
        </div>
      )}
      {err && <div style={{ ...errBanner, marginBottom: 14 }}>{err}</div>}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>
          {enrolledCount === 0 && selectedIds.size === 0
            ? "Select at least one track to continue."
            : `${enrolledCount + selectedIds.size} track${enrolledCount + selectedIds.size === 1 ? "" : "s"} selected.`}
        </span>
        <button onClick={handleContinue} disabled={!canContinue} style={wizardBtnPrimary(continuing)}>
          {continuing ? "Continuing…" : "Continue →"}
        </button>
      </div>
    </>
  );
}

// Step 4 — only reached when Calendar's already connected (see
// OnboardingWizard below); the range is fixed (Intern through the position
// just picked in step 1), not the editable From/To AutoScheduleModal shows
// elsewhere, on purpose: this is a one-time "catch up your whole roadmap so
// far" action for a brand-new account, not the same day-to-day tool Up
// next's own wand is. Only the Complete-by date stays adjustable. Reuses
// the same /api/courses/auto-schedule endpoint and not_connected handling
// AutoScheduleModal does — see that file for the full editable version.
function AutoScheduleStep({ currentPosition, annualReviewDate, onSaved, onSkip }) {
  const [targetDate, setTargetDate] = useState(nextAnnualReviewDateStr(annualReviewDate));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [needsConnect, setNeedsConnect] = useState(false);

  const submit = async () => {
    if (targetDate <= todayStr()) { setError("Pick a date after today."); return; }
    setBusy(true); setError(""); setNeedsConnect(false);
    const timeline_months = monthsUntilDateStr(targetDate);
    try {
      const res = await api("/api/courses/auto-schedule", {
        method: "POST",
        body: JSON.stringify({ from_position: POSITION_ORDER[0], to_position: currentPosition || POSITION_ORDER[0], timeline_months }),
      });
      onSaved(res);
    } catch (e) {
      if (e.message === "not_connected") setNeedsConnect(true);
      else setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (needsConnect) {
    return (
      <>
        <div style={wizardTitle}>Auto Schedule your roadmap</div>
        <p style={wizardSubtext}>Google Calendar isn't connected after all — connect it to finish setting this up, or skip and do it later from Your Journey.</p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={onSkip} style={wizardBtn}>Skip for now</button>
          <a href="/api/calendar/connect?returnTo=/learning-hub" style={wizardBtnPrimary(false)}>Connect Google Calendar</a>
        </div>
      </>
    );
  }

  return (
    <>
      <div style={wizardTitle}>Auto Schedule your roadmap</div>
      <p style={wizardSubtext}>
        Books one study block per not-yet-done course, from {POSITION_LABEL[POSITION_ORDER[0]]} through your own {POSITION_LABEL[currentPosition] || POSITION_LABEL[POSITION_ORDER[0]]} level, working around your existing meetings. This range is fixed for setup — you can plan any other range later from Your Journey's own 🪄 button.
      </p>
      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        <div style={wizardField}>From<div style={wizardLockedValue}>{POSITION_LABEL[POSITION_ORDER[0]]}</div></div>
        <div style={wizardField}>To<div style={wizardLockedValue}>{POSITION_LABEL[currentPosition] || POSITION_LABEL[POSITION_ORDER[0]]}</div></div>
      </div>
      <label style={wizardField}>Complete by
        <input type="date" min={todayStr()} value={targetDate} onChange={(e) => setTargetDate(e.target.value)} style={wizardSelect} />
      </label>
      <p style={{ fontSize: 11, color: "var(--muted)", margin: "6px 0 8px" }}>
        Defaults to this year's annual review ({formatMonthDay(annualReviewDate || DEFAULT_ANNUAL_REVIEW_MONTH_DAY)}).
      </p>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 18 }}>
        <button type="button" onClick={() => setTargetDate(nextAnnualReviewDateStr(annualReviewDate))} style={wizardQuickPick}>
          Annual review · {formatMonthDay(annualReviewDate || DEFAULT_ANNUAL_REVIEW_MONTH_DAY)}
        </button>
        <button type="button" onClick={() => setTargetDate(addMonthsDateStr(3))} style={wizardQuickPick}>3 months</button>
        <button type="button" onClick={() => setTargetDate(addMonthsDateStr(6))} style={wizardQuickPick}>6 months</button>
      </div>
      {error && <div style={{ ...errBanner, marginBottom: 14 }}>{error}</div>}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <button onClick={onSkip} disabled={busy} style={wizardBtn}>Skip for now</button>
        <button onClick={submit} disabled={busy} style={wizardBtnPrimary(busy)}>{busy ? "Scheduling…" : "Save"}</button>
      </div>
    </>
  );
}

// The wizard's own closing moment — reached whether or not Auto Schedule
// actually ran (skipped, or Calendar was never connected to begin with),
// so "you're set up" always ends the same way instead of sometimes just
// silently navigating away. scheduled is null in every case that isn't "Auto
// Schedule just booked real events" — a fabricated block count would be
// worse than no count at all.
function DoneStep({ scheduled, onGoToJourney, finishing }) {
  return (
    <div style={{ textAlign: "center", padding: "8px 4px 4px" }}>
      <div style={{ fontSize: 34, marginBottom: 10 }}>🎉</div>
      <div style={{ ...wizardTitle, textAlign: "center" }}>You've successfully completed your setup</div>
      <p style={{ ...wizardSubtext, textAlign: "center" }}>
        {scheduled?.length
          ? `${scheduled.length} study block${scheduled.length === 1 ? "" : "s"} already booked on your calendar.`
          : "Your roadmap is ready whenever you are."}
      </p>
      <button onClick={onGoToJourney} disabled={finishing} style={wizardBtnPrimary(finishing)}>
        {finishing ? "Opening…" : "Go to My Journey →"}
      </button>
    </div>
  );
}

// Resumes at whichever step is actually left to do, re-derived from server
// state every time it opens (no client- or server-side "current step"
// flag to desync): role is skipped once me.position is set; calendar is
// skipped once already connected OR once a `?calendar=` outcome is present.
// The Calendar step's own connect link passes ?returnTo=/learning-hub (see
// app/api/calendar/connect/route.js), so the OAuth round trip lands
// straight back here with that param — JourneyPage's own `?calendar=`
// bounce is a defensive fallback for the one other way to reach this app's
// Calendar-connect while not yet onboarded (Auto Schedule's own inline
// prompt, which doesn't pass returnTo and defaults to /learning-hub/journey
// — see JourneyPage.jsx's `?calendar=` effect), not the primary path.
// "Skip for now" writes nothing — there's no "declined" flag, matching
// this codebase's existing derive-don't-flag pattern (JourneyPage's
// milestone banners).
//
// Step 4 (AutoScheduleStep) only exists at all when Calendar's connected —
// there's nothing for it to do otherwise, and it was already declined once
// in step 2, so this doesn't ask again. totalSteps/stepNum reflect that:
// "of 3" if Calendar never connects during this run, "of 4" once it has —
// the same adaptive-count idea the step sequence itself already uses for
// skipping the Calendar step.
const STEP_NUM = { role: 1, calendar: 2, tracks: 3, autoschedule: 4 };
// Back always goes to the fixed previous step in the sequence, not
// whatever step this particular run happened to visit last — so Back from
// "tracks" reaches "calendar" even when it was auto-skipped going forward
// (already connected, or a `?calendar=` outcome). That's deliberate: it's
// the only way to ever revisit Calendar once it's been skipped, and
// CalendarStep itself already renders correctly either way (a real
// "connect" prompt, or a plain "✓ Connected" readout) off calendarConnected
// — see that component. No entry for "role" (nothing before it) or "done"
// (finished is finished).
const PREV_STEP = { calendar: "role", tracks: "calendar", autoschedule: "tracks" };
function OnboardingWizard({ me, tracks, onPreview, onEnrollMany, annualReviewDate, onClose, onFinish, refresh }) {
  const calOutcome = useMemo(() => new URLSearchParams(window.location.search).get("calendar"), []);
  const [step, setStep] = useState(() => {
    if (!me.position) return "role";
    if (me.calendar_connected || calOutcome) return "tracks";
    return "calendar";
  });
  const [finishing, setFinishing] = useState(false);
  const [scheduled, setScheduled] = useState(null);

  useEffect(() => {
    if (calOutcome) window.history.replaceState({}, "", window.location.pathname);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const goDone = (result) => { setScheduled(result || null); setStep("done"); };
  const goBack = () => { if (PREV_STEP[step]) setStep(PREV_STEP[step]); };

  const finish = async () => {
    setFinishing(true);
    await onFinish();
  };

  const totalSteps = me.calendar_connected ? 4 : 3;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(10,22,44,0.5)", zIndex: 150, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{ background: "var(--card)", borderRadius: 14, padding: 26, width: 480, maxWidth: "100%", boxShadow: "0 20px 60px rgba(10,22,44,0.35)" }}>
        {step !== "done" && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {PREV_STEP[step] && (
                <button onClick={goBack} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700, color: "var(--muted)", padding: 0 }}>
                  ← Back
                </button>
              )}
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--faint)", letterSpacing: 0.5, textTransform: "uppercase" }}>
                Get started · step {STEP_NUM[step]} of {totalSteps}
              </span>
            </div>
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--muted)", lineHeight: 1, padding: 2 }} aria-label="Close">×</button>
          </div>
        )}
        {step === "tracks" && calOutcome === "connected" && <div style={successBanner}>✓ Google Calendar connected.</div>}
        {step === "tracks" && calOutcome && calOutcome !== "connected" && calOutcome !== "cancelled" && (
          <div style={{ ...errBanner, marginBottom: 14 }}>Couldn't connect Google Calendar — you can try again later from your profile.</div>
        )}
        {step === "role" && <RoleStep refresh={refresh} onPicked={() => setStep(me.calendar_connected ? "tracks" : "calendar")} />}
        {step === "calendar" && <CalendarStep calendarConnected={me.calendar_connected} onContinue={() => setStep("tracks")} />}
        {step === "tracks" && (
          <TracksStep
            tracks={tracks}
            onPreview={onPreview}
            onEnrollMany={onEnrollMany}
            onContinue={() => setStep(me.calendar_connected ? "autoschedule" : "done")}
          />
        )}
        {step === "autoschedule" && (
          <AutoScheduleStep
            currentPosition={me.position}
            annualReviewDate={annualReviewDate}
            onSaved={(res) => goDone(res.scheduled)}
            onSkip={() => goDone(null)}
          />
        )}
        {step === "done" && <DoneStep scheduled={scheduled} finishing={finishing} onGoToJourney={finish} />}
      </div>
    </div>
  );
}

export default function LearningHubPage() {
  const { user: me, refresh } = useSession();
  const router = useRouter();
  const [tracks, setTracks] = useState([]);
  const [err, setErr] = useState("");
  const [ready, setReady] = useState(false);
  const [previewId, setPreviewId] = useState(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [annualReviewDate, setAnnualReviewDate] = useState(DEFAULT_ANNUAL_REVIEW_MONTH_DAY);

  const load = useCallback(async () => {
    setErr("");
    try { const { tracks: t } = await api("/api/tracks"); setTracks(t); } catch (e) { setErr(e.message); } finally { setReady(true); }
  }, []);

  useEffect(() => { if (me) load(); }, [me, load]);
  useRevalidateOnFocus(() => { if (me) load(); });

  // Needed only for the wizard's own Auto Schedule prompt (step 3, right
  // after enrolling while Calendar's connected) — same fetch JourneyPage
  // already does for its own Auto Schedule modal, see that file's own
  // comment for why it's independent of load() above.
  useEffect(() => {
    if (!me) return;
    api("/api/settings").then(({ settings }) => setAnnualReviewDate(settings.annual_review_date)).catch(() => {});
  }, [me]);

  // Landing back here from JourneyPage's bounce (?calendar=<outcome>,
  // fired only for a not-yet-onboarded visitor — see JourneyPage.jsx)
  // reopens the wizard so OnboardingWizard's own step logic can resume it
  // on "tracks". A wizard the learner already finished has nothing left to
  // resume — me.onboarded stays the source of truth, not this param alone.
  useEffect(() => {
    if (!me || me.onboarded) return;
    if (new URLSearchParams(window.location.search).get("calendar")) setWizardOpen(true);
  }, [me]);

  const onAssignedChange = (id, assigned) => setTracks((ts) => ts.map((t) => (t.id === id ? { ...t, assigned } : t)));

  // The wizard's own Tracks step enroll action — same endpoint TrackPreview's
  // enroll button calls, just for every checked track at once (multi-select,
  // not one-at-a-time), without opening the preview modal first. Partial
  // failure still updates local state for whichever tracks DID succeed,
  // rather than losing that progress because one call in the batch failed.
  const enrollManyTracks = async (trackIds) => {
    const results = await Promise.allSettled(
      trackIds.map((id) => api(`/api/tracks/${id}/assignment`, { method: "POST" }))
    );
    trackIds.forEach((id, i) => {
      if (results[i].status === "fulfilled") onAssignedChange(id, true);
    });
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed > 0) throw new Error(`Could not enroll in ${failed} track${failed === 1 ? "" : "s"} — try again.`);
  };

  const finishOnboarding = async () => {
    await refresh(); // so AppHeader/this page see onboarded:true right away
    router.push("/learning-hub/journey");
  };

  const enrolledTracks = tracks.filter((t) => t.assigned);

  return (
    <div style={{ minHeight: "100vh", paddingBottom: 40 }}>
      <AppHeader crumb="Learning Hub" />
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "24px 22px 0" }}>
        {me === undefined || (me && !ready) ? (
          <Loading label="Loading tracks" />
        ) : !me.onboarded ? (
          <GetStartedGateway onStart={() => setWizardOpen(true)} />
        ) : (
          <>
            <section style={{ ...card, marginBottom: 18 }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <h1 style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 20, color: "var(--ink)", margin: "0 0 4px" }}>Your tracks</h1>
                  <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 18px" }}>Tracks you're enrolled in.</p>
                </div>
                <Link href="/learning-hub/journey" style={{ fontSize: 12.5, color: "var(--blue)", fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap" }}>View your journey →</Link>
              </div>
              {err && <div style={{ ...errBanner, marginBottom: 14 }}>{err}</div>}
              {enrolledTracks.length === 0 ? (
                <div style={{ fontSize: 13, color: "var(--muted)" }}>You don't have any tracks yet.</div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 }}>
                  {enrolledTracks.map((t) => <TrackCard key={t.id} track={t} onPreview={setPreviewId} />)}
                </div>
              )}
            </section>

            <section style={card}>
              <h1 style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 20, color: "var(--ink)", margin: "0 0 4px" }}>Suggested tracks</h1>
              <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 18px" }}>Pick a track to preview its roadmap, and enroll when you're ready to start it.</p>
              {tracks.length === 0 ? (
                <div style={{ fontSize: 13, color: "var(--muted)" }}>No tracks yet.</div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 }}>
                  {tracks.map((t) => <TrackCard key={t.id} track={t} onPreview={setPreviewId} />)}
                </div>
              )}
            </section>
          </>
        )}
      </main>

      {wizardOpen && me && (
        <OnboardingWizard
          me={me}
          tracks={tracks}
          onPreview={setPreviewId}
          onEnrollMany={enrollManyTracks}
          annualReviewDate={annualReviewDate}
          onClose={() => setWizardOpen(false)}
          onFinish={finishOnboarding}
          refresh={refresh}
        />
      )}

      {previewId && (
        <TrackPreview
          trackId={previewId}
          onClose={() => setPreviewId(null)}
          onAssignedChange={onAssignedChange}
        />
      )}
    </div>
  );
}
