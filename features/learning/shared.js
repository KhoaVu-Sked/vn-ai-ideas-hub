// Shared constants/styles between LearningHubPage, JourneyPage, and TeamPage.

import { POSITIONS } from "@/features/accounts/constants";

export const card = { background: "var(--card)", border: "1px solid var(--line)", borderRadius: 14, padding: "20px 22px" };
export const errBanner = { background: "#fff4f4", border: "1px solid #ffc9c9", color: "#c92a2a", borderRadius: 8, padding: "8px 12px", fontSize: 12.5 };
// Small uppercase section kicker (Learner Dashboard's card groups) — bold
// Manrope, blue, wide letter-spacing.
export const eyebrow = { fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 10.5, letterSpacing: 0.9, textTransform: "uppercase", color: "var(--blue)", margin: "0 0 8px" };

export const STATUS_META = {
  complete: { label: "Complete", bg: "#e6f4ea", color: "#1f7a3c" },
  in_progress: { label: "In progress", bg: "#e8f0ff", color: "#0055ff" },
  not_started: { label: "Not started", bg: "#eef0f4", color: "#5e687a" },
  skipped: { label: "Skipped", bg: "#fff4e0", color: "#a15c00" },
};
// A pill matching one of the statuses above — factored out since the same
// object shape was being hand-copied at every call site.
export const statusPill = (status) => {
  const s = STATUS_META[status] || STATUS_META.not_started;
  return { fontSize: 11, fontWeight: 700, borderRadius: 999, padding: "3px 10px", background: s.bg, color: s.color, whiteSpace: "nowrap" };
};
export const POSITION_LABEL = { intern: "Intern", junior: "Junior", middle: "Mid level", senior: "Senior", principal: "Principal" };
// Single source of truth for the seniority ladder — features/accounts/constants.js
// owns the list (it's also account-wide, not learning-specific); the SQL side
// (features/learning/queries.js) takes this same array as a query parameter
// via array_position() rather than hand-copying it into a CASE expression.
export const POSITION_ORDER = POSITIONS;

// "Progress by level" (Learner Dashboard) groups the 5-tier role ladder into
// 4 named roadmap stages — Foundations/Applied/Intermediate/Advanced — for
// that one overview chart. This is display-only: it's a coarser VIEW derived
// from a course's existing expected_by_position, not a new column or a
// replacement for it. Every gating rule that actually cares about seniority
// (isExpectedByNow below, MindMap's tier locks, Team view's roster/heatmap,
// Auto Schedule's from/to range, JourneyTable's same-tier drag check) keeps
// reading the raw 5-value position exactly as before — Senior and Principal
// stay fully distinct everywhere except this one chart, where they share the
// "Advanced" bar simply because there's one more role than there are named
// levels, not because either role's own tracking changes anywhere else.
export const PROGRESS_LEVEL_ORDER = ["foundations", "applied", "intermediate", "advanced"];
export const PROGRESS_LEVEL_LABEL = { foundations: "Foundations", applied: "Applied", intermediate: "Intermediate", advanced: "Advanced" };
// The one place the role->level pairing is spelled out — everything else
// (rolesForProgressLevel below, and progressLevelForPosition) derives from
// this single object rather than hand-copying the pairing a second time.
export const POSITION_TO_PROGRESS_LEVEL = { intern: "foundations", junior: "applied", middle: "intermediate", senior: "advanced", principal: "advanced" };

export function progressLevelForPosition(position) {
  return POSITION_TO_PROGRESS_LEVEL[position] || null;
}
// Which role(s) fall under a given progress level (e.g. "advanced" ->
// ["senior", "principal"]) — used to caption each level bar with the role(s)
// it corresponds to, in ladder order.
export function rolesForProgressLevel(level) {
  return POSITION_ORDER.filter((p) => POSITION_TO_PROGRESS_LEVEL[p] === level);
}

// A course counts toward "expected by now" once its own tier is at or below
// the learner's current position — Intern is expected to have finished the
// Intern tier, Senior is expected to have finished everything through
// Senior, not the whole roadmap up to Principal. Used to scope "% complete"
// fairly (Journey's profile strip, the Learner Dashboard's stat tiles) —
// features/learning/queries.js's getTeamOverview() does the same comparison
// server-side, via array_position(), for Team view's roster and stat cards.
// No position set yet (an admin hasn't assigned one): falls back to true —
// count the whole roadmap — since "nothing expected yet" reads worse than
// "count everything until we know better."
export function isExpectedByNow(course, position) {
  if (!position) return true;
  const courseIdx = POSITION_ORDER.indexOf(course.expected_by_position);
  const posIdx = POSITION_ORDER.indexOf(position);
  if (courseIdx === -1 || posIdx === -1) return true; // unrecognized tier value — don't silently exclude it
  return courseIdx <= posIdx;
}

// Whether every course in a given tier (across the account's FULL course
// list — every enrolled track, not whatever a track filter has narrowed it
// to) is complete/skipped. An empty tier (no courses in it at all) counts
// as "done" too — same as the Mind map's tier-gate (MindMap.jsx's
// computeLocks) treats an empty lower tier as vacuously clear, via
// .every() on an empty array. Exported on its own (not just inlined into
// effectivePosition below) so callers can also ask "is the +1 stage ALSO
// finished" — see JourneyPage.jsx's atCeiling.
export function isTierDone(courses, tierPosition) {
  const tier = courses.filter((c) => c.expected_by_position === tierPosition);
  return tier.every((c) => c.status === "complete" || c.status === "skipped");
}

// Once every course in an account's own current-position tier is
// complete/skipped, they've earned early access to the NEXT tier too —
// capped at exactly one stage ahead, never further (an Intern who's
// finished Intern sees through Junior, not Middle; "max +1 stage"). This
// is a flat, one-time step, not recursive: finishing the +1 stage too
// doesn't push it to +2 — see JourneyPage.jsx's atCeiling for how that
// "nothing left visible" state gets surfaced instead.
//
// Returns a position string — feed THIS into isExpectedByNow (instead of
// the raw account position) wherever "what's visible/expected right now"
// is computed, not the account's own raw user_role.position: that stays
// the officially assigned seniority, unaffected by early access.
export function effectivePosition(courses, position) {
  if (!position) return null;
  const posIdx = POSITION_ORDER.indexOf(position);
  if (posIdx === -1) return position; // unrecognized value — leave as-is, isExpectedByNow already tolerates this
  const tierDone = isTierDone(courses, position);
  const nextIdx = tierDone ? Math.min(posIdx + 1, POSITION_ORDER.length - 1) : posIdx;
  return POSITION_ORDER[nextIdx];
}

export const th = { padding: "6px 8px", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, textAlign: "left" };
export const td = { padding: "10px 8px", fontSize: 12.5, color: "var(--body)" };

// Row/header sizing shared by the List view's scrollable table (JourneyPage)
// and the Mind map's per-column scroll height (MindMap) — same visible-rows
// budget in both places.
export const VISIBLE_ROWS = 7;
export const ROW_H = 42;
export const HEADER_H = 34;

// target_date is a date-only value (no time-of-day) — always parsed and
// displayed in UTC so the calendar date shown matches what was actually set,
// regardless of the viewer's browser timezone. Without the explicit UTC
// timeZone, `new Date("2024-06-15")` (UTC midnight) rendered through the
// browser's local zone shows the PREVIOUS day for anyone west of UTC.
export function fmtDate(d) {
  if (!d) return "—";
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? "—" : dt.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

// Same UTC-date-string shape used for target_date reads/writes on both the
// client (Up next's date input) and the server (the target route's past-date
// check) — one normalization point instead of two independent `.slice(0,10)`s.
export const toDateStr = (d) => (d ? String(d).slice(0, 10) : "");

// Today as a yyyy-mm-dd string — same `.toISOString().slice(0, 10)` shape
// used everywhere else a date input needs a `min`, so "today" means the same
// calendar date across every date field in this feature.
export const todayStr = () => new Date().toISOString().slice(0, 10);

// Fallback annual-review month-day (MM-DD) used until the real one — an
// admin-editable app_settings row, ANNUAL_REVIEW_DATE in
// features/admin/queries.js — has loaded. Recurs every year, so it's a
// month-day, not a full date; keep this in sync with that file's own
// default so a not-yet-loaded page and a freshly-seeded database agree.
export const DEFAULT_ANNUAL_REVIEW_MONTH_DAY = "10-13";

// Auto Schedule's "Complete by" field defaults to the next occurrence of the
// annual review — this year's if it hasn't passed yet, otherwise next year's.
// `monthDay` is admin-editable (Team view's header — see TeamPage.jsx); this
// function itself only knows how to project it forward. Plain string
// comparison is enough since both sides are yyyy-mm-dd — lexicographic order
// matches calendar order.
export function nextAnnualReviewDateStr(monthDay = DEFAULT_ANNUAL_REVIEW_MONTH_DAY, today = todayStr()) {
  const year = today.slice(0, 4);
  const thisYear = `${year}-${monthDay}`;
  return today <= thisYear ? thisYear : `${Number(year) + 1}-${monthDay}`;
}

// "10-13" -> "Oct 13" — for display only (the quick-pick label, the Team
// view editor's collapsed state). Anchored to a dummy leap year so Feb 29
// formats fine too.
export function formatMonthDay(monthDay) {
  const [m, d] = monthDay.split("-").map(Number);
  return new Date(Date.UTC(2000, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

// A yyyy-mm-dd string `months` calendar-months from `today` — used by Auto
// Schedule's quick-pick shortcuts ("3 months", "6 months"). Calendar-accurate
// (via setUTCMonth, which rolls year/day correctly), unlike the ~30.44-day
// approximation monthsUntilDateStr uses to convert back for the server.
export function addMonthsDateStr(months, today = todayStr()) {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

// Inverse of the server's `timelineDays = Math.round(months * 30.44)`
// (app/api/courses/auto-schedule/route.js) — converts a picked "Complete by"
// date back into the fractional-months number that endpoint expects. Same
// 30.44 constant on both ends so the round trip lands on the date the
// learner actually picked, not some drifted approximation of it.
export function monthsUntilDateStr(dateStr, today = todayStr()) {
  const days = (new Date(`${dateStr}T00:00:00Z`) - new Date(`${today}T00:00:00Z`)) / 86400000;
  return days / 30.44;
}

// "3 days ago" / "1 week ago" — used by Team view's Last activity column and
// the Journey page's Knowledge artifacts card, so it lives here once instead
// of twice.
export function relTime(d) {
  if (!d) return "—";
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;
  const months = Math.floor(days / 30);
  return months <= 1 ? "1 month ago" : `${months} months ago`;
}

// Monday-anchored week key (that week's Monday, as a yyyy-mm-dd string, UTC)
// — two timestamps in the same Mon-Sun week collapse to the same key,
// regardless of which day within it they actually fall on.
function weekKeyUTC(dateInput) {
  const d = new Date(dateInput);
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayIdx = (monday.getUTCDay() + 6) % 7; // Mon=0 .. Sun=6
  monday.setUTCDate(monday.getUTCDate() - dayIdx);
  return monday.toISOString().slice(0, 10);
}

// Learner Dashboard's "Weekly streak" KPI — consecutive weeks (ending at the
// current week, or last week if this week hasn't landed one yet) with at
// least one course actually completed THROUGH Auto Schedule. Scoped to
// calendar_event_id courses on purpose: Auto Schedule is the only place this
// app has anything resembling a "session," so that's the signal used, not
// every completion regardless of how it was scheduled (a course completed
// with no calendar booking at all doesn't count toward this one). A learner
// who's never used Auto Schedule reads a plain 0, not a broken number.
//
// No live Google Calendar read here — calendar_event_id already tells us
// "this course had a real booked session," and completion itself only ever
// lives in course_assignments.status, never in the calendar event, so
// fetching the live event wouldn't add a signal we don't already have; it'd
// just add a network round trip, token-refresh handling, and a "calendar
// access revoked" failure mode for no extra information.
//
// updated_at doubles as "when this was completed": once a course reaches the
// terminal 'complete' status nothing touches that row again, so its most
// recent update IS the completion moment in the overwhelming common case.
export function weeklyStreak(courses, today = new Date()) {
  const completedWeeks = new Set(
    courses
      .filter((c) => c.calendar_event_id && c.status === "complete" && c.updated_at)
      .map((c) => weekKeyUTC(c.updated_at))
  );
  const cursor = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  let cursorKey = weekKeyUTC(cursor);
  if (!completedWeeks.has(cursorKey)) {
    cursor.setUTCDate(cursor.getUTCDate() - 7); // this week's still open — try last week instead of breaking the streak early
    cursorKey = weekKeyUTC(cursor);
  }
  let streak = 0;
  while (completedWeeks.has(cursorKey)) {
    streak++;
    cursor.setUTCDate(cursor.getUTCDate() - 7);
    cursorKey = weekKeyUTC(cursor);
  }
  return streak;
}

// Learner Dashboard's Retention card, "Confidence by skill" — how many of
// SKILL_CONFIDENCE_SCALE segments to fill in the dot meter next to each
// skill name. Exported so the UI (LearnerDashboardPage's ConfidenceMeter)
// and the math here agree on the same scale rather than one of them
// hand-copying the number 5.
export const SKILL_CONFIDENCE_SCALE = 5;

// One course's contribution to whichever skill(s) it's tagged with
// (courses.skills, migration 028) — null for a course that hasn't been
// started yet, so it's excluded from the average entirely rather than
// dragging a skill toward 0 just because the learner hasn't gotten there.
// A skipped course carries the same "no signal" treatment as not_started —
// skipping says nothing about how well the material was learned.
//   - complete + has a quiz snapshot: first-try accuracy (quiz_correct_first_try
//     / quiz_total_questions) — the same ratio the Knowledge artifacts card
//     already shows per course (03-your-journey.md), reused here as the
//     "how well" signal instead of inventing a second one.
//   - complete + no quiz (5 of the 20 catalog courses have none —
//     01-course-catalog.md): full credit. There's nothing to grade, and
//     finishing the course is still real progress toward the skill.
//   - in_progress: half credit — started, not yet proven.
function courseStrength(course) {
  if (course.status === "complete") {
    return course.quiz_total_questions ? course.quiz_correct_first_try / course.quiz_total_questions : 1;
  }
  if (course.status === "in_progress") return 0.5;
  return null; // not_started / skipped
}

// Groups a journey's courses by skill tag (a course can carry more than
// one — see ai-track-seed.sql) and averages courseStrength across whichever
// of that skill's courses the learner has actually engaged with. A skill
// with zero engaged courses doesn't appear at all — same "empty state, not
// a fabricated number" rule this feature uses everywhere else (weeklyStreak
// above is the one exception, because it's a fixed KPI tile that's always
// on screen; this is a list, so the honest move is to just not list it yet).
// Unscoped by isExpectedByNow/track filters on purpose, same as the
// Consistency card next to it on the Dashboard — a course finished early
// (or outside what's strictly expected by now) still earned its confidence.
//
// Returned array is sorted most-confident first (ties broken alphabetically,
// for a stable order rather than one that shuffles on every reload) — the
// call site decides how many rows it has room to show.
export function skillConfidence(courses) {
  const bySkill = new Map();
  for (const course of courses) {
    const strength = courseStrength(course);
    if (strength === null) continue;
    for (const skill of course.skills || []) {
      if (!bySkill.has(skill)) bySkill.set(skill, []);
      bySkill.get(skill).push(strength);
    }
  }
  return [...bySkill.entries()]
    .map(([skill, strengths]) => {
      const avg = strengths.reduce((sum, s) => sum + s, 0) / strengths.length;
      return {
        skill,
        pct: Math.round(avg * 100),
        dots: Math.round(avg * SKILL_CONFIDENCE_SCALE),
        courseCount: strengths.length,
      };
    })
    .sort((a, b) => b.pct - a.pct || a.skill.localeCompare(b.skill));
}

// First-try quiz accuracy (0-100), averaged across whichever of the given
// courses are complete AND have a quiz snapshot — the same per-course ratio
// courseStrength above uses, just flattened across a set of courses instead
// of grouped by skill. Used for the Learner Dashboard's own "Avg exam score"
// row and, unchanged, for Team view's per-member "Avg exam" column and its
// team-wide KPI tile (features/learning/TeamPage.jsx) — one formula, three
// call sites, rather than three copies that could quietly drift apart. Null
// (not 0) when nothing in the set has a quiz snapshot yet, so a caller can
// show "—" instead of a fabricated score.
export function avgExamScore(courses) {
  const scored = courses.filter((c) => c.status === "complete" && c.quiz_total_questions);
  if (!scored.length) return null;
  const avg = scored.reduce((sum, c) => sum + c.quiz_correct_first_try / c.quiz_total_questions, 0) / scored.length;
  return Math.round(avg * 100);
}
