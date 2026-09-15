"use client";

// Your Journey: every course across the tracks you're enrolled in, as a
// List view only — ordered intern -> principal, then by the roadmap's own
// authored sequence within a tier (courses.roadmap_order), scrolled after
// ~8 rows. Manual drag-to-reorder existed here before; it was removed for
// producing bugs (courses could show in a different order than the
// roadmap intended), not replaced with anything — courses.roadmap_order is
// what getJourney() (features/learning/queries.js) now sorts by instead.
// Restricted to what's expected of this account BY NOW: an Intern only
// sees the Intern tier, a Junior only sees the Junior tier (not Intern +
// Junior — Intern is assumed already fulfilled, that's what got them
// promoted) (isExpectedByNow, shared.js — the same rule the % completion
// numbers use). Finishing every course in your own tier earns early access
// to ONE stage ahead — never more (effectivePosition, shared.js: Intern
// who's done -> also sees Junior, Junior who's done -> also sees Middle,
// "max +1 stage"). The full roadmap, including tiers beyond that, is still
// visible on the Mind map (Learner Dashboard) — that view is meant to show
// the road ahead, this one is meant to show what's actually on your plate
// right now (plus whatever you've just earned).
//
// The hero band below (JourneyHero/JourneyPathRail) renders the same
// position/visiblePosition/atCeiling facts as a connected 5-stage path
// rather than a lone progress bar — "Your Journey" names a real, ordered
// sequence, so a stepped path earns its place here in a way a generic
// numbered decoration wouldn't. JourneyTable carries the same idea into
// the course list itself: each core course is a stop on a connected path
// (a status-colored dot + line, the same language as the hero rail and Up
// next's own mini path), with optional courses set apart and no line
// running through them. Reused as-is on the Learner Dashboard's "My
// courses" and Team view's read-only drill-down (TeamPage.jsx), so all
// three read as the same product rather than one polished page and two
// leftover tables.

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import Avatar from "@/components/Avatar";
import Loading from "@/components/Loading";
import { useSession } from "@/features/auth/SessionProvider";
import { api } from "@/lib/apiClient";
import useRevalidateOnFocus from "@/lib/useRevalidateOnFocus";
import AutoScheduleModal from "@/features/learning/AutoScheduleModal";
import ConfirmModal from "@/features/learning/ConfirmModal";
import {
  card, errBanner, STATUS_META, statusPill, POSITION_LABEL, POSITION_ORDER,
  fmtDate, relTime,
  formatMonthDay, DEFAULT_ANNUAL_REVIEW_MONTH_DAY, isExpectedByNow, isVisibleNow, effectivePosition, isTierDone,
} from "@/features/learning/shared";
import ProgressBar from "@/features/learning/ProgressBar";

// One stop on the course-list path — a status-colored dot connected by a
// line to the next stop, echoing the hero's own tier rail and Up next's
// mini path at the scale of the full list. `hasLine` is false for the last
// core row and for every optional row: optional courses sit outside the
// required path, so nothing runs through them. `isFirst` drops the top
// divider a row would otherwise draw against the one above it (matching
// Up next/Knowledge artifacts' own `:first-child` treatment) — true once
// per group (first core row, first optional row), since each group's own
// heading already separates it from whatever came before.
function JourneyRow({ course, expanded, onToggle, onUnschedule, muted, hasLine, isFirst }) {
  const status = STATUS_META[course.status] || STATUS_META.not_started;
  const meta = [
    course.platform,
    course.est_hours != null ? `${course.est_hours} hrs` : null,
    course.target_date ? `Target ${fmtDate(course.target_date)}` : "No target set",
  ].filter(Boolean).join(" · ");

  return (
    <>
      <div
        className="journey-row"
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }}
        style={{ display: "flex", gap: 12, padding: "13px 6px", borderRadius: 10, cursor: "pointer", borderTop: isFirst ? "none" : "1px solid var(--line)" }}
      >
        <div style={{ width: 16, display: "flex", flexDirection: "column", alignItems: "center", alignSelf: "stretch", paddingTop: 5, flexShrink: 0 }}>
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: status.color, flexShrink: 0 }} />
          {hasLine && <span style={{ width: 2, flex: 1, background: "var(--line)", marginTop: 4 }} />}
        </div>
        <div style={{ flex: 1, minWidth: 0, paddingTop: 1 }}>
          <div style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 14, color: muted ? "var(--muted)" : "var(--ink)" }}>
            {course.title}
          </div>
          {/* The competency this course builds — the branded title alone
              (e.g. "AI Fluency: Framework & Foundations") doesn't say what
              it's actually for. */}
          {course.focus_area && (
            <div style={{ fontSize: 11.5, color: "var(--faint)", marginTop: 2 }}>{course.focus_area}</div>
          )}
          {meta && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>{meta}</div>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 9, flexShrink: 0, paddingTop: 2 }}>
          <span style={statusPill(course.status)}>{status.label}</span>
          <span
            className="jrow-chevron"
            aria-hidden="true"
            style={{ width: 25, height: 25, borderRadius: "50%", border: "1px solid var(--line)", background: "var(--card)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "var(--muted)" }}
          >
            {expanded ? "︿" : "﹀"}
          </span>
        </div>
      </div>
      {expanded && (
        <div style={{ padding: "2px 6px 14px 38px", display: "flex", flexDirection: "column", gap: 8 }}>
          {course.link && (
            <a href={course.link} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12.5, color: "var(--blue)", fontWeight: 700, textDecoration: "none" }}>
              Open course{course.platform ? ` on ${course.platform}` : ""} ↗
            </a>
          )}
          {course.outcome && <div style={{ fontSize: 12.5, color: "var(--body)" }}><strong>After this course:</strong> {course.outcome}</div>}
          {course.has_scheduled_session && onUnschedule && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onUnschedule(course); }}
              title="Delete this course's calendar event(s) and clear its target date"
              style={{ alignSelf: "flex-start", background: "none", border: "none", color: "var(--muted)", fontSize: 11.5, fontWeight: 700, cursor: "pointer", padding: 0 }}
            >
              Remove from calendar
            </button>
          )}
        </div>
      )}
    </>
  );
}

// Scrolls after roughly 6 rows so the card doesn't grow without bound as a
// tier's course count grows. Plain display order — whatever `courses`
// arrives in (getJourney()'s own SQL ORDER BY, features/learning/
// queries.js). No page-specific styling here: this same component renders
// on the Learner Dashboard's "My courses" and Team view's read-only
// drill-down (TeamPage.jsx), so it can't assume it's sitting inside
// JourneyPage's own layout.
export function JourneyTable({ courses, onUnschedule }) {
  const [expandedId, setExpandedId] = useState(null);
  const toggle = (id) => setExpandedId((cur) => (cur === id ? null : id));

  // Optional rows are enrichment, not part of what "core courses complete"
  // counts — grouped under their own divider, below every core row,
  // regardless of where roadmap_order happens to interleave them, so the
  // core path reads as the primary list rather than one flat mix. Priority
  // itself isn't repeated on every row anymore — the section a row sits in
  // already says that.
  const core = courses.filter((c) => c.priority !== "optional");
  const optional = courses.filter((c) => c.priority === "optional");

  return (
    <div style={{ overflow: "auto", maxHeight: 470, border: "1px solid var(--line)", borderRadius: 12, padding: "4px 10px" }}>
      {core.map((c, i) => (
        <JourneyRow
          key={c.id}
          course={c}
          expanded={expandedId === c.id}
          onToggle={() => toggle(c.id)}
          onUnschedule={onUnschedule}
          hasLine={i < core.length - 1}
          isFirst={i === 0}
        />
      ))}
      {optional.length > 0 && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "16px 6px 3px" }}>
            <span style={{ fontFamily: "var(--font-sora)", fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--faint)" }}>Optional</span>
            <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
          </div>
          <div style={{ fontSize: 11.5, color: "var(--faint)", margin: "0 6px 6px" }}>Enrichment — not required to finish this tier</div>
        </>
      )}
      {optional.map((c, i) => (
        <JourneyRow
          key={c.id}
          course={c}
          expanded={expandedId === c.id}
          onToggle={() => toggle(c.id)}
          onUnschedule={onUnschedule}
          muted
          hasLine={false}
          isFirst={i === 0}
        />
      ))}
    </div>
  );
}

// ── Journey hero: avatar/name/track + the tier path (below) ──────────────
const heroCard = {
  position: "relative",
  overflow: "hidden",
  borderRadius: 16,
  padding: "22px 24px 24px",
  marginBottom: 18,
  // A soft blue glow bleeding in from one corner, over a navy base — the
  // same navy the app's other dark surface (KpiHolder's accent tile,
  // LearnerDashboardPage.jsx) and the Learning Hub's own gradient CTA
  // (.start-journey-btn, globals.css) already use, so this reads as an
  // extension of an established brand moment rather than a new one.
  // Deliberately dark enough everywhere for white text — no gradient stop
  // bright enough to fight the copy sitting on top of it.
  background: "radial-gradient(820px circle at 100% -12%, rgba(0,126,230,0.5), transparent 55%), linear-gradient(165deg, #04306b 0%, var(--navy) 78%)",
};
const segBtn = (active) => ({
  border: "none", borderRadius: 999, padding: "5px 12px", fontSize: 11.5, fontWeight: 700, cursor: "pointer",
  background: active ? "#fff" : "transparent", color: active ? "var(--navy)" : "rgba(255,255,255,0.85)",
});
const calendarPillBase = { display: "inline-flex", alignItems: "center", gap: 5, borderRadius: 999, padding: "5px 12px", fontSize: 11, fontWeight: 700 };

// One stop on the tier rail. `state` is "done" (assumed fulfilled, or
// actually finished), "current" (in progress — ring shows `pct`), or
// "locked" (not visible yet — the road ahead). `bonus` marks the one
// early-access stage, tinted with --header-blue instead of white so it
// reads as the "extra" stop, not a second copy of the main path.
function StageNode({ label, state, pct, bonus }) {
  const isDone = state === "done";
  const isLocked = state === "locked";
  const ringColor = bonus ? "var(--header-blue)" : "#fff";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 60 }}>
      <div style={{
        width: 38, height: 38, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        background: isDone ? "#fff" : isLocked ? "transparent" : `conic-gradient(${ringColor} ${pct}%, rgba(255,255,255,0.22) 0)`,
        border: isLocked ? "1.5px dashed rgba(255,255,255,0.35)" : "none",
      }}>
        {isDone ? (
          <span aria-hidden="true" style={{ color: "var(--navy)", fontSize: 16, fontWeight: 900 }}>✓</span>
        ) : isLocked ? null : (
          <div style={{
            width: 30, height: 30, borderRadius: "50%", background: "var(--navy)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "var(--font-sora)", fontWeight: 800, fontSize: 10.5, color: "#fff",
          }}>{pct}%</div>
        )}
      </div>
      <div style={{ marginTop: 7, fontSize: 11, fontWeight: 700, textAlign: "center", color: isLocked ? "rgba(255,255,255,0.42)" : "#fff" }}>{label}</div>
      {bonus && !isLocked && <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.2, color: "var(--header-blue)", marginTop: 1 }}>bonus</div>}
    </div>
  );
}

// The 5-stage seniority ladder (POSITION_ORDER) as one connected path,
// standing in for the plain progress bar this corner used to hold. Earned
// specifically because "Your Journey" names a real, ordered sequence with
// a real "you are here" — the kind of content a stepped visual is meant
// for, not a generic decoration applied regardless of subject.
//
// Node state per tier:
//   - before `position`: assumed already fulfilled (isExpectedByNow,
//     shared.js) — rendered done without re-checking course data.
//   - at `position`: current, ring shows coreComplete/coreTotal (this
//     account's own tier only — see coreCourses' own comment below for why
//     that stays uncoupled from early access). Flips to done once early
//     access has actually been earned (visiblePosition !== position — the
//     real, cross-track signal that this tier is finished), or, at the top
//     of the ladder where there's no next tier to unlock into, once its
//     own ring alone reaches 100%.
//   - at `visiblePosition`, only once early access is earned: the bonus
//     stage, ring shows nextTierCoreComplete/nextTierCoreTotal. Flips to
//     done once atCeiling (that stage is ALSO finished).
//   - anything further out: locked.
function JourneyPathRail({ position, visiblePosition, atCeiling, coreComplete, coreTotal, nextTierCoreComplete, nextTierCoreTotal }) {
  const posIdx = POSITION_ORDER.indexOf(position);
  if (posIdx === -1) return null;
  const earlyAccess = Boolean(visiblePosition) && visiblePosition !== position;
  const earlyIdx = earlyAccess ? POSITION_ORDER.indexOf(visiblePosition) : -1;
  const unlockedThrough = earlyIdx >= 0 ? earlyIdx : posIdx;
  const pct = coreTotal ? Math.round((coreComplete / coreTotal) * 100) : 0;
  const nextPct = nextTierCoreTotal ? Math.round((nextTierCoreComplete / nextTierCoreTotal) * 100) : 0;
  const atTop = posIdx === POSITION_ORDER.length - 1;
  const currentFinished = earlyAccess || (atTop && coreTotal > 0 && coreComplete === coreTotal);

  return (
    <div style={{ display: "flex", alignItems: "flex-start", marginTop: 20 }}>
      {POSITION_ORDER.map((stage, i) => {
        const state = i < posIdx ? "done"
          : i === posIdx ? (currentFinished ? "done" : "current")
          : i === earlyIdx ? (atCeiling ? "done" : "current")
          : "locked";
        return (
          <Fragment key={stage}>
            {i > 0 && (
              <div style={{
                flex: "1 1 16px", minWidth: 12, height: 2, marginTop: 19,
                background: i <= unlockedThrough ? "rgba(255,255,255,0.55)" : "none",
                borderTop: i <= unlockedThrough ? "none" : "1.5px dashed rgba(255,255,255,0.3)",
              }} />
            )}
            <StageNode
              label={POSITION_LABEL[stage] || stage}
              state={state}
              pct={i === posIdx ? pct : i === earlyIdx ? nextPct : 0}
              bonus={i === earlyIdx}
            />
          </Fragment>
        );
      })}
    </div>
  );
}

// Avatar, name, position/track tags, Calendar-connect, and the tier path —
// everything this page knows about "where you are" in one dark band, so
// the white cards below can stay quiet and just list things. Replaces the
// old ProfileStrip; same props plus `atCeiling`, needed for the rail's own
// "is the bonus stage also finished" state.
function JourneyHero({ me, position, visiblePosition, atCeiling, trackTags, hasTracks, coreComplete, coreTotal, coreHoursComplete, coreHoursTotal, nextTierCoreComplete, nextTierCoreTotal, nextTierCoreHoursComplete, nextTierCoreHoursTotal, calendarConnected }) {
  const [scope, setScope] = useState("mine");
  const earlyAccess = Boolean(visiblePosition) && visiblePosition !== position;
  const showingNext = earlyAccess && scope === "next";
  const complete = showingNext ? nextTierCoreComplete : coreComplete;
  const total = showingNext ? nextTierCoreTotal : coreTotal;
  const hoursComplete = showingNext ? nextTierCoreHoursComplete : coreHoursComplete;
  const hoursTotal = showingNext ? nextTierCoreHoursTotal : coreHoursTotal;

  return (
    <section style={heroCard}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Avatar person={me} size={46} />
          <div>
            <div style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 18, letterSpacing: -0.2, color: "#fff" }}>{me.name || me.username}</div>
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
        {/* Permanent home for Calendar-connect — Get Started's own Calendar
            step is skippable, so this is where "do it later" actually
            happens. Same /api/calendar/connect route Auto Schedule's own
            connect flow uses, but back to the Learning Hub landing page
            rather than reopening Auto Schedule here. */}
        {calendarConnected ? (
          <span style={{ ...calendarPillBase, border: "1px solid rgba(255,255,255,0.32)", background: "rgba(255,255,255,0.12)", color: "#fff" }}>
            ✓ Google Calendar connected
          </span>
        ) : (
          <a href="/api/calendar/connect?returnTo=/learning" style={{ ...calendarPillBase, border: "1px solid rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.16)", color: "#fff", textDecoration: "none" }}>
            📅 Connect Google Calendar
          </a>
        )}
      </div>

      {!hasTracks ? (
        <div style={{ marginTop: 18, fontSize: 12.5, color: "rgba(255,255,255,0.78)" }}>
          Enroll in a track from the Learning Hub to start tracking your progress here.
        </div>
      ) : !position ? (
        // No position assigned yet (admin hasn't set one) — the rail has
        // nothing to index into, so fall back to the plain bar this hero
        // replaces everywhere else. Rare in practice; every real account
        // gets a position at Get Started.
        <div style={{ marginTop: 18, maxWidth: 320 }}>
          <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.78)", marginBottom: 6 }}>
            <strong style={{ color: "#fff" }}>{coreComplete} of {coreTotal}</strong> core courses complete
            {coreHoursTotal > 0 && ` (${coreHoursComplete} of ${coreHoursTotal} hrs)`}
          </div>
          <ProgressBar pct={coreTotal ? Math.round((coreComplete / coreTotal) * 100) : 0} />
        </div>
      ) : (
        <>
          <JourneyPathRail
            position={position}
            visiblePosition={visiblePosition}
            atCeiling={atCeiling}
            coreComplete={coreComplete}
            coreTotal={coreTotal}
            nextTierCoreComplete={nextTierCoreComplete}
            nextTierCoreTotal={nextTierCoreTotal}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 16, flexWrap: "wrap" }}>
            {earlyAccess && (
              <div style={{ display: "inline-flex", borderRadius: 999, background: "rgba(255,255,255,0.14)", padding: 3, gap: 2 }}>
                <button type="button" onClick={() => setScope("mine")} style={segBtn(scope === "mine")}>{POSITION_LABEL[position] || position}</button>
                <button type="button" onClick={() => setScope("next")} style={segBtn(scope === "next")}>{POSITION_LABEL[visiblePosition] || visiblePosition} · bonus</button>
              </div>
            )}
            <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.78)" }}>
              <strong style={{ color: "#fff" }}>{complete} of {total}</strong> core courses complete
              {hoursTotal > 0 && ` (${hoursComplete} of ${hoursTotal} hrs)`}
              {showingNext ? (
                <span style={{ color: "rgba(255,255,255,0.55)" }}> · {POSITION_LABEL[visiblePosition] || visiblePosition} only</span>
              ) : (
                position && <span style={{ color: "rgba(255,255,255,0.55)" }}> · {POSITION_LABEL[position] || position} only</span>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

// Milestone banners (tierJustFinished/atCeiling, below) — an icon badge
// plus text rather than a flat tinted box with an inline emoji, so the
// same "something to notice" shape as ConfirmModal's own icon badge
// carries through here too. Still the light-blue/navy combo the original
// comment chose over green: Skedulo's own brand palette (CLAUDE.md) has no
// green in it, so a green "success" banner would be the one thing on this
// page that isn't actually on-brand.
const milestoneBanner = { display: "flex", alignItems: "flex-start", gap: 12, background: "#eef3ff", border: "1px solid #cddcff", borderRadius: 10, padding: "12px 14px", marginBottom: 14 };
const milestoneIcon = { width: 34, height: 34, borderRadius: "50%", background: "#dce7ff", color: "var(--navy)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 };
// Up next's "Calendar not connected" notice — a heads-up, not an error, so
// it reuses STATUS_META's own "skipped" amber (shared.js) rather than
// errBanner's red or milestoneBanner's blue: this app's one existing
// "attention, not alarming" color, not a new one invented for this.
const calendarWarnBanner = { display: "flex", alignItems: "flex-start", gap: 12, background: "#fff4e0", border: "1px solid #ffdf9e", borderRadius: 10, padding: "12px 14px", marginBottom: 14 };
const calendarWarnIcon = { width: 34, height: 34, borderRadius: "50%", background: "#ffe8b8", color: "#a15c00", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 };
// Auto Schedule is the ONLY action Up next has now — no Refresh (redundant
// with useRevalidateOnFocus, which already re-fetches this whole page on
// tab-focus) and no manual target-date editing (this app doesn't track
// when a learner actually studies; a course only really moves once its
// wrap-up quiz is done — see QuizPage.jsx/completeCourse — so a hand-set
// date was a suggestion nobody downstream ever read back, and Auto
// Schedule already writes this same column for real). Same normal-sized
// solid-blue button as every other primary action in this feature
// (wizardBtnPrimary, LearningHubPage.jsx; modalBtnPrimary,
// AutoScheduleModal.jsx) rather than an oversized pill of its own, for
// consistency across the app.
const autoScheduleBtn = { display: "inline-flex", alignItems: "center", gap: 8, border: "none", background: "var(--blue)", color: "#fff", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" };
const autoScheduleBtnDisabled = { ...autoScheduleBtn, background: "var(--bg)", color: "var(--faint)", cursor: "not-allowed" };

// The next 2 courses, not yet complete/skipped: dated ones first (soonest
// target_date first), then undated ones filling any remaining slots in the
// roadmap's own order (courses arrives already sorted intern -> principal,
// tier order, track/stage/created_at — that's the "order" fallback).
// target_date is read-only here now — Auto Schedule is the only thing that
// still writes it (POST /api/courses/:id/target and its own manual-edit UI
// are gone, see the comment above autoScheduleBtn).
//
// The soonest/next pick (upcoming[0]) auto-flips not_started -> in_progress
// — "this is the one you're on now" — the moment it becomes the top pick,
// not on any click. Guarded by a ref so the same course only gets the
// start call once per mount, not on every re-render.
function UpNextCard({ courses, onAutoStart, onAutoSchedule, calendarConnected }) {
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

  return (
    <section style={card}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 15 }}>📅</span>
          <h2 style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 15, color: "var(--ink)", margin: 0 }}>Up next</h2>
        </div>
        {/* Greyed out (not just left to fail on click) once Calendar isn't
            connected — connecting is skippable during Get Started, and
            this is the one thing that stops being available afterward
            until it's done, from the profile strip above or here.
            AutoScheduleModal's own 409 `needsConnect` screen stays as a
            defensive fallback for a connection that dies between this
            page's load and the click. */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={calendarConnected ? onAutoSchedule : undefined}
            disabled={!calendarConnected}
            aria-label={calendarConnected ? "Auto Schedule — book study time on your calendar" : "Auto Schedule — connect Google Calendar first, above"}
            className={calendarConnected ? undefined : "icon-tip"}
            data-tip={calendarConnected ? undefined : "Connect Google Calendar first — see your profile above"}
            style={calendarConnected ? autoScheduleBtn : autoScheduleBtnDisabled}
          >
            🪄 Auto Schedule
          </button>
        </div>
      </div>
      {!calendarConnected && (
        <div style={calendarWarnBanner}>
          <span aria-hidden="true" style={calendarWarnIcon}>📅</span>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: "#8a5200", lineHeight: 1.5 }}>
            Google Calendar isn't connected, so Auto Schedule can't book study time or set target dates for you — connect from your profile above to turn it on.
          </div>
        </div>
      )}
      {upcoming.length === 0 ? (
        <p style={{ fontSize: 12.5, color: "var(--muted)", margin: 0, lineHeight: 1.5 }}>
          Nothing left to plan — every course is complete or skipped.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {upcoming.map((c, i) => {
            const status = STATUS_META[c.status] || STATUS_META.not_started;
            return (
              <div key={c.id} style={{ display: "flex", gap: 10, padding: i > 0 ? "12px 0 0" : "0 0 12px", borderTop: i > 0 ? "1px solid var(--line)" : "none" }}>
                {/* A short path segment down the sidebar — the same
                    "connected stops" idea the hero's tier rail uses, at
                    the scale of two upcoming courses. */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", alignSelf: "stretch", paddingTop: 3 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: status.color, flexShrink: 0 }} />
                  {i < upcoming.length - 1 && <span style={{ width: 2, flex: 1, background: "var(--line)", marginTop: 4 }} />}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5, color: "var(--ink)", marginBottom: 6 }}>{c.title}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={statusPill(c.status)}>{status.label}</span>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>
                      {c.target_date ? `Target ${fmtDate(c.target_date)}` : "No target set"}{c.est_hours != null ? ` · ${c.est_hours} hrs` : ""}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// A small radial readout for one course's first-try quiz accuracy —
// warranted here specifically because accuracy already IS a ratio, not a
// decorative dial invented for a number that wasn't one.
function AccuracyRing({ pct }) {
  return (
    <div
      aria-hidden="true"
      style={{ width: 30, height: 30, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: `conic-gradient(var(--blue) ${pct}%, var(--line) 0)` }}
    >
      <div style={{ width: 22, height: 22, borderRadius: "50%", background: "var(--card)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-sora)", fontWeight: 800, fontSize: 8, color: "var(--ink)" }}>
        {pct}
      </div>
    </div>
  );
}

// The 3 most recently completed courses IN THE SELECTED TRACK, with their
// wrap-up quiz stats — questions, when, and first-try accuracy. Computed
// client-side from filteredJourney (JourneyPage's own derived const), not a
// separate fetch — switching the track dropdown re-derives this instantly.
// quiz_total_questions/quiz_correct_first_try are a snapshot taken at
// completion (queries.js -> completeCourse), not a live join, so a course
// whose quiz changed later still shows what was actually answered. Both
// null for a course completed before this existed (or completed with no
// stats sent) — shown honestly as "No quiz data recorded" rather than a
// fabricated number.
// inProgressCourse: the account's current in_progress pick, same track
// scope, shown as one more row below the completions so the card also
// points at what's next, not just what's done. Null when nothing's in
// progress; no fallback fabricated.
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
              <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: i > 0 ? "10px 0 0" : "0 0 10px", borderTop: i > 0 ? "1px solid var(--line)" : "none" }}>
                {hasStats
                  ? <AccuracyRing pct={accuracy} />
                  : <div aria-hidden="true" style={{ width: 30, height: 30, borderRadius: "50%", background: "var(--bg)", flexShrink: 0 }} />}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "var(--ink)", marginBottom: 4 }}>{c.title}</div>
                  <div style={{ fontSize: 11.5, color: "var(--muted)" }}>
                    {hasStats
                      ? `${c.quiz_total_questions} question${c.quiz_total_questions === 1 ? "" : "s"} · ${relTime(c.completed_at)} · ${accuracy}% accuracy`
                      : `No quiz data recorded · ${relTime(c.completed_at)}`}
                  </div>
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
          <Link href={`/learning/journey/${inProgressCourse.id}/quiz`} style={{ fontSize: 11.5, fontWeight: 700, color: "var(--blue)", textDecoration: "none" }}>
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
  const [err, setErr] = useState("");
  const [ready, setReady] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  // Remove from calendar: one course at a time (JourneyTable's row-expand)
  // — unscheduleTarget holds the course pending confirmation, or null.
  const [unscheduleTarget, setUnscheduleTarget] = useState(null);
  const [unscheduling, setUnscheduling] = useState(false);
  // No "all tracks" option — always one specific enrolled track (its id),
  // auto-picked below once trackOptions is known; "" only until then.
  const [selectedTrack, setSelectedTrack] = useState("");
  const [position, setPosition] = useState(null);
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
  // The Get Started wizard's own Calendar step passes ?returnTo=/learning
  // (app/api/calendar/connect/route.js), so it lands there directly and
  // never touches this page in the common case. This bounce is a defensive
  // fallback for the one other way a not-yet-onboarded visitor can still
  // reach Google Calendar-connect while sitting on THIS page: Auto
  // Schedule's own inline prompt (a 409 mid-modal), which doesn't pass
  // returnTo and defaults back here on purpose (see 4.7's own comment) — if
  // that happens before the account has enrolled in a track, send them to
  // /learning instead, same param, so the wizard is what reopens and
  // resumes rather than this page reacting to a param the wizard actually
  // owns. Gated on `me` actually having loaded, so a not-yet-resolved
  // session can't misread as "not onboarded" and bounce someone who's
  // really done with setup.
  useEffect(() => {
    if (me === undefined) return;
    const cal = new URLSearchParams(window.location.search).get("calendar");
    if (!cal) return;
    if (!me.onboarded) { router.replace(`/learning?calendar=${encodeURIComponent(cal)}`); return; }
    if (cal === "connected") setAutoScheduleOpen(true);
    else if (cal !== "cancelled") setErr("Couldn't connect Google Calendar — try again from the Auto Schedule button.");
    window.history.replaceState({}, "", window.location.pathname);
  }, [me]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async () => {
    setErr("");
    try {
      const { courses, position: pos, calendarConnected: cc } = await api("/api/journey");
      setJourney(courses);
      setPosition(pos);
      setCalendarConnected(Boolean(cc));
    } catch (e) { setErr(e.message); } finally { setReady(true); }
  }, []);

  useEffect(() => { if (me) load(); }, [me, load]);
  useRevalidateOnFocus(() => { if (me) load(); });

  // Derived straight from the journey data already on hand — no extra fetch.
  const trackOptions = Array.from(new Map(journey.map((c) => [c.track_id, c.track_name])).entries())
    .map(([id, name]) => ({ id, name }));
  // No "all tracks" choice — there's always exactly one selected track (or
  // none, if not enrolled in any). Auto-picks the first enrolled track on
  // first load, and re-picks whenever the current selection stops being
  // valid (the previously selected track was un-enrolled — a Reset, or one
  // dropped — or this is the very first render, before anything's chosen).
  useEffect(() => {
    if (!trackOptions.some((t) => t.id === selectedTrack)) setSelectedTrack(trackOptions[0]?.id || "");
  }, [journey]); // eslint-disable-line react-hooks/exhaustive-deps
  const filteredJourney = journey.filter((c) => c.track_id === selectedTrack);
  // The List (and Up next, below) only show courses in this account's own
  // current tier — an Intern sees the Intern tier, a Junior sees only the
  // Junior tier (isExpectedByNow/isVisibleNow, shared.js) — the tiers below
  // it are assumed already fulfilled, not something still owed. Once every
  // course in the account's OWN tier is complete/skipped, they've earned one
  // stage of early access too (effectivePosition — "max +1 stage": Intern ->
  // also Junior, Junior -> also Middle, never further), computed off the
  // FULL journey (every enrolled track), not filteredJourney — whether
  // you've finished your stage shouldn't depend on which track happens to be
  // selected in the dropdown.
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
  const visibleJourney = filteredJourney.filter((c) => isVisibleNow(c, position, visiblePosition));
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
  // congrats banner below and, identically, by JourneyHero's own selector.
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
  // Knowledge artifacts — both scoped to the track dropdown, same as the
  // rest of the page now that there's always exactly one selected track
  // (each track auto-starts its own "Up next" #1 pick independently, so
  // journey can genuinely hold one in_progress course per enrolled track —
  // reading the unfiltered journey here would risk showing the OTHER
  // track's in-progress course while a different one is selected).
  // Both computed from filteredJourney, already on hand from the journey
  // fetch — no extra request.
  const inProgressCourse = filteredJourney.find((c) => c.status === "in_progress") || null;
  const recentCompletions = filteredJourney
    .filter((c) => c.status === "complete")
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
    .slice(0, 3)
    .map((c) => ({ ...c, completed_at: c.updated_at }));
  // Core-course progress for the profile strip — the RAW position, not
  // visiblePosition/visibleJourney (see the comment above visibleJourney's
  // own definition for why the % stays uncoupled from early access).
  const coreCourses = filteredJourney.filter((c) => c.priority === "core" && isExpectedByNow(c, position));
  const coreComplete = coreCourses.filter((c) => c.status === "complete").length;
  const coreHoursTotal = coreCourses.reduce((sum, c) => sum + (Number(c.est_hours) || 0), 0);
  const coreHoursComplete = coreCourses.filter((c) => c.status === "complete").reduce((sum, c) => sum + (Number(c.est_hours) || 0), 0);
  // The early-access tier's OWN core courses only (expected_by_position ===
  // visiblePosition), not accumulated with the tier(s) below it the way
  // coreCourses above is ("through X"). That lower tier is already fully
  // done — early access only unlocks once it is — so folding it back in
  // would just show ~100% again and tell the learner nothing about the
  // bonus material they just unlocked. JourneyHero only surfaces this (as
  // a second, selectable scope) once visiblePosition !== position.
  const nextTierCoreCourses = filteredJourney.filter((c) => c.priority === "core" && c.expected_by_position === visiblePosition);
  const nextTierCoreComplete = nextTierCoreCourses.filter((c) => c.status === "complete").length;
  const nextTierCoreHoursTotal = nextTierCoreCourses.reduce((sum, c) => sum + (Number(c.est_hours) || 0), 0);
  const nextTierCoreHoursComplete = nextTierCoreCourses.filter((c) => c.status === "complete").reduce((sum, c) => sum + (Number(c.est_hours) || 0), 0);
  // Always exactly the one selected track's own name (or none, pre-selection).
  const trackTags = trackOptions.filter((t) => t.id === selectedTrack).map((t) => t.name);

  // Reset everything is a staging-only control — the backend reset endpoint
  // stays live everywhere, but the button only renders on the staging
  // deployment so a production user can never see or trigger it.
  const isStagingHost = typeof window !== "undefined" && window.location.hostname === "ts-ai-ideas-hub-staging.vercel.app";

  // Resets everything AI Learning itself owns, not just course progress —
  // course_assignments, account_tracks (the Get Started gateway's own
  // "onboarded" check reads this), and calendar_connections. Deliberately
  // leaves user_role alone: that's general account data set on Manage ->
  // Users, not this feature's to erase (see resetJourney()'s own comment,
  // features/learning/queries.js). Lands back on /learning afterward,
  // since that's now the same gateway a genuinely new account sees.
  // Gated by ConfirmModal (below) rather than a native confirm() — the
  // button itself just opens that; this is the actual reset, run only from
  // the modal's own "Reset everything" click.
  const doReset = async () => {
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
      router.push("/learning");
    } catch (e) {
      setErr(e.message);
    } finally {
      setResetting(false);
    }
  };

  // Removes just ONE course's own Auto-Scheduled calendar event(s) and
  // clears its target date (app/api/courses/:id/clear-schedule) — status
  // untouched. Optimistic local patch, same pattern autoStartCourse already
  // uses, rather than a full reload for a single known row.
  const doUnschedule = async (courseId) => {
    setUnscheduling(true);
    setErr("");
    try {
      const { calendarError } = await api(`/api/courses/${courseId}/clear-schedule`, { method: "POST" });
      setJourney((cs) => cs.map((c) => (c.id === courseId ? { ...c, target_date: null, has_scheduled_session: false } : c)));
      if (calendarError) setErr(calendarError);
    } catch (e) {
      setErr(e.message);
    } finally {
      setUnscheduling(false);
      setUnscheduleTarget(null);
    }
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
            <JourneyHero
              me={me}
              position={position}
              visiblePosition={visiblePosition}
              atCeiling={atCeiling}
              trackTags={trackTags}
              hasTracks={journey.length > 0}
              coreComplete={coreComplete}
              coreTotal={coreCourses.length}
              coreHoursComplete={coreHoursComplete}
              coreHoursTotal={coreHoursTotal}
              nextTierCoreComplete={nextTierCoreComplete}
              nextTierCoreTotal={nextTierCoreCourses.length}
              nextTierCoreHoursComplete={nextTierCoreHoursComplete}
              nextTierCoreHoursTotal={nextTierCoreHoursTotal}
              calendarConnected={calendarConnected}
            />
            <div style={{ display: "flex", gap: 18, alignItems: "flex-start", flexWrap: "wrap" }}>
            <section style={{ ...card, flex: "2 1 480px", minWidth: 0 }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 18 }}>
              <div>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginBottom: 4 }}>
                  <h1 style={{ fontFamily: "var(--font-sora)", fontWeight: 800, fontSize: 22, letterSpacing: -0.3, color: "var(--ink)", margin: 0 }}>Your Journey</h1>
                  {journey.length > 0 && (
                    <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
                      <select
                        value={selectedTrack}
                        onChange={(e) => setSelectedTrack(e.target.value)}
                        style={{
                          appearance: "none", WebkitAppearance: "none", fontFamily: "inherit",
                          border: "1px solid var(--line)", background: "var(--card)", color: "var(--ink)",
                          borderRadius: 999, padding: "7px 30px 7px 14px", fontSize: 12.5, fontWeight: 700, cursor: "pointer",
                        }}
                      >
                        {trackOptions.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                      <span aria-hidden="true" style={{ position: "absolute", right: 13, fontSize: 9, color: "var(--muted)", pointerEvents: "none" }}>▾</span>
                    </div>
                  )}
                </div>
                <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>
                  {position
                    ? visiblePosition !== position
                      ? `Showing ${POSITION_LABEL[position] || position} — you've finished it and unlocked early access to ${POSITION_LABEL[visiblePosition] || visiblePosition} — in ${trackTags[0] || "this track"}.`
                      : `Showing ${POSITION_LABEL[position] || position} — your current stage — in ${trackTags[0] || "this track"}.`
                    : `Ordered intern → principal, in ${trackTags[0] || "this track"}.`}
                </p>
              </div>
              {isStagingHost && (journey.length > 0 || calendarConnected) && (
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, maxWidth: "100%" }}>
                  <button
                    onClick={() => setResetConfirmOpen(true)}
                    disabled={resetting}
                    title="Clear course progress, tracks, and Google Calendar — your assigned role is untouched"
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
                <span aria-hidden="true" style={milestoneIcon}>🎉</span>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--navy)", lineHeight: 1.5 }}>
                  {earlyAccess ? (
                    <>You've completed every course in {POSITION_LABEL[position] || position} — you're all set for your annual review on {formatMonthDay(annualReviewDate)}. Early access to {POSITION_LABEL[visiblePosition] || visiblePosition} is open now — your {POSITION_LABEL[position] || position} completion rate for this review stays exactly as it is, whatever you do next.</>
                  ) : (
                    <>You've completed every course in {POSITION_LABEL[position] || position} — you've reached the top of the ladder, and you're all set for your annual review on {formatMonthDay(annualReviewDate)}.</>
                  )}
                </div>
              </div>
            )}
            {atCeiling && (
              // The +1 cap is flat (effectivePosition, shared.js) — finishing
              // that stage too doesn't push it to +2, so without this the
              // learner would just see the same fully-complete list with no
              // explanation of why nothing new ever shows up.
              <div style={milestoneBanner}>
                <span aria-hidden="true" style={milestoneIcon}>🎉</span>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--navy)", lineHeight: 1.5 }}>
                  You've completed everything visible through {POSITION_LABEL[visiblePosition] || visiblePosition} — the next stage unlocks once your manager updates your level.
                </div>
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
              <JourneyTable courses={visibleJourney} onUnschedule={(course) => setUnscheduleTarget(course)} />
            )}
          </section>

          <div style={{ display: "flex", flexDirection: "column", gap: 18, flex: "1 1 260px", minWidth: 260 }}>
            <UpNextCard
              courses={visibleJourney}
              onAutoStart={autoStartCourse}
              onAutoSchedule={() => setAutoScheduleOpen(true)}
              calendarConnected={calendarConnected}
            />
            <KnowledgeArtifactsCard completions={recentCompletions} inProgressCourse={inProgressCourse} />
          </div>
          </div>
          </>
        )}
      </main>

      {autoScheduleOpen && (
        <AutoScheduleModal
          currentPosition={position}
          visiblePosition={visiblePosition}
          trackId={selectedTrack}
          trackName={trackTags[0] || "this track"}
          journey={journey}
          annualReviewDate={annualReviewDate}
          onClose={() => setAutoScheduleOpen(false)}
          onScheduled={load}
        />
      )}

      {isStagingHost && resetConfirmOpen && (
        <ConfirmModal
          icon="🗑️"
          tone="danger"
          title="Reset everything AI Learning knows about you?"
          body="This clears all course progress (skips, custom order, target dates), un-enrolls you from every track, and disconnects Google Calendar — deleting any Auto Schedule events booked there too. Your assigned role is untouched (that's set on Manage → Users, not here). You'll land back on the Get Started gateway."
          confirmLabel="Reset everything"
          onCancel={() => setResetConfirmOpen(false)}
          onConfirm={() => { setResetConfirmOpen(false); doReset(); }}
        />
      )}

      {unscheduleTarget && (
        <ConfirmModal
          icon="📅"
          tone="danger"
          title="Remove this course from your calendar?"
          body={`This deletes "${unscheduleTarget.title}"'s Auto-Scheduled calendar event(s) and clears its target date. Its progress (status, quiz results) is not affected. There is no undo — you'd need to run Auto Schedule again to re-book it.`}
          confirmLabel={unscheduling ? "Removing…" : "Remove from calendar"}
          onCancel={() => setUnscheduleTarget(null)}
          onConfirm={() => doUnschedule(unscheduleTarget.id)}
        />
      )}
    </div>
  );
}
