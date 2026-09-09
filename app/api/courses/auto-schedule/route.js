import { requireUser } from "@/features/auth/guard";
import { jsonError, err } from "@/lib/sql";
import { POSITIONS } from "@/features/accounts/constants";
import {
  getCalendarConnection, getCoursesForAutoSchedule, getAccountSchedulingInfo,
  saveScheduledSessions, deleteCalendarConnection,
} from "@/features/learning/queries";
import { refreshAccessToken, freeBusy, createEvent, deleteEvent } from "@/features/learning/googleCalendar";
import { computeSchedule } from "@/features/learning/scheduler";
import { decrypt } from "@/lib/crypto";
import { APP_NAME } from "@/lib/brand";

// Falls back to this only when the account has never set accounts.timezone —
// most of this team is Vietnam-based, so it's a reasonable default rather
// than defaulting to UTC and booking everyone's study time at 4am.
const DEFAULT_TIMEZONE = "Asia/Ho_Chi_Minh";
const MAX_TIMELINE_MONTHS = 60;
// The only session lengths Auto Schedule's own form offers (15/30/60 min,
// as hours — AutoScheduleModal.jsx / LearningHubPage.jsx's quick-pick
// chips) — validated against this exact list server-side too, not left to
// whatever the client happens to send.
const ALLOWED_SESSION_HOURS = [0.25, 0.5, 1];
// How many Google Calendar API calls this route lets run at once. A large
// track (e.g. Core Competency's 36 courses, one of them a 35.5-hour outlier
// that alone produces 60 capped sessions) can mean 150+ individual
// events.insert/delete calls — sequential, at a few hundred ms of real
// network latency each, that's the 1-2 minutes this used to take. They're
// independent HTTP requests (creating or deleting one event has no
// ordering dependency on another), so running a batch of these at once is
// safe; 8 is comfortably under Google's per-user Calendar API rate limit
// for a single interactive request, not "every call at once" (which would
// risk 429s on a genuinely huge run).
const CALENDAR_CONCURRENCY = 8;

// Runs `items` through `worker` with at most `limit` in flight at once.
// Results land in `results` at the same index as their input regardless of
// completion order, so callers that need to re-associate a result with the
// job that produced it (e.g. which course/session a created event belongs
// to) can rely on index alignment same as Promise.all — this just bounds
// concurrency instead of firing everything at once.
async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function lane() {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
  return results;
}

// POST /api/courses/auto-schedule { from_position, to_position, timeline_months, session_hours, track_id, confirm_overflow }
//
// track_id is optional — omitted, this spans every track the caller is
// enrolled in, same as always; AutoScheduleModal (features/learning/
// AutoScheduleModal.jsx) always sends the learner's own currently-selected
// track now, so a run started from Your Journey only ever touches that one
// track's courses, never a different enrolled track's.
//
// confirm_overflow is optional and defaults falsy. When the computed plan
// would finish one or more courses AFTER the learner's own "Complete by"
// date, the first call (confirm_overflow omitted/false) books nothing at
// all and instead returns { warning: "timeline_exceeded", target_date,
// overflowing: [{course_id, title, finishes_at, overdue_days}] } — the
// caller shows that list and re-POSTs the same body with
// confirm_overflow: true to book anyway. A run with no overflow ignores
// this field entirely and books on the first call, same as always.
//
// Finds every not-yet-done course between the two seniority tiers (across
// the caller's own enrolled tracks), spreads them across the given
// timeline respecting the caller's ACTUAL Google Calendar free/busy time,
// and writes one calendar event PER SESSION (a course's total estimated
// hours split into session_hours-long sessions — computeSchedule(),
// features/learning/scheduler.js) plus course_assignments.target_date per
// course. Re-running this deletes whatever it booked for a course before
// (whether the old single-event style or a previous run's own sessions —
// getCoursesForAutoSchedule()'s own comment) and creates fresh events
// rather than trying to update them in place — a course can have a
// different NUMBER of sessions from one run to the next (a different
// session length picked), so there's no stable 1:1 event to update
// against the way there was when every course got exactly one sitting.
//
// Every course's OWN delete-then-create ordering is preserved (a course's
// stale events are always gone before its fresh ones are written), but
// there's no ordering between DIFFERENT courses any more: all deletes
// across every course run first (bounded concurrency), then all creates
// across every course's every session (same), then the per-course DB
// write — still one `saveScheduledSessions` call per course, sequential;
// at 36 courses that's a few seconds at most on Neon's one-round-trip-per-
// query driver, nowhere near what the Calendar calls cost, so it wasn't
// worth the extra complexity of batching it too.
export async function POST(request) {
  try {
    const user = await requireUser();
    const { from_position, to_position, timeline_months, session_hours, track_id, confirm_overflow } = await request.json();

    if (!POSITIONS.includes(from_position) || !POSITIONS.includes(to_position)) {
      throw err(400, "Pick a valid position range.");
    }
    if (POSITIONS.indexOf(from_position) > POSITIONS.indexOf(to_position)) {
      throw err(400, `"${from_position}" comes after "${to_position}" on the ladder — swap them.`);
    }
    const months = Number(timeline_months);
    if (!Number.isFinite(months) || months <= 0 || months > MAX_TIMELINE_MONTHS) {
      throw err(400, `Pick a timeline between 1 month and ${MAX_TIMELINE_MONTHS / 12} years.`);
    }
    const sessionHours = Number(session_hours);
    if (!ALLOWED_SESSION_HOURS.includes(sessionHours)) {
      throw err(400, "Pick a valid study session length.");
    }

    const connection = await getCalendarConnection(user.uid);
    if (!connection) {
      return Response.json({ error: "not_connected" }, { status: 409 });
    }

    const courses = await getCoursesForAutoSchedule(user.uid, from_position, to_position, track_id);
    if (courses.length === 0) {
      return Response.json({
        scheduled: [], skipped: [],
        message: "Nothing to schedule in that range — every course there is already complete or skipped.",
      });
    }

    let accessToken;
    try {
      accessToken = await refreshAccessToken(decrypt(connection.refresh_token));
    } catch (e) {
      // The connection itself is dead (revoked from the learner's Google
      // account, etc.) — drop the stale row so the UI correctly shows
      // "not connected" on the next attempt instead of failing the same way.
      if (e.code === "invalid_grant") await deleteCalendarConnection(user.uid);
      return Response.json({ error: "not_connected" }, { status: 409 });
    }

    const { timezone } = await getAccountSchedulingInfo(user.uid);
    const tz = timezone || DEFAULT_TIMEZONE;
    const timelineDays = Math.round(months * 30.44);

    const now = new Date();
    const timeMax = new Date(now.getTime() + timelineDays * 86400000);
    const busy = await freeBusy(accessToken, { timeMin: now.toISOString(), timeMax: timeMax.toISOString() });

    const plan = computeSchedule({ courses, busy, timelineDays, timeZone: tz, sessionHours, now });

    // computeSchedule()/findSlot() (scheduler.js) has no upper bound on how
    // far forward it searches for a slot — it stops once it finds one, not
    // once it crosses the learner's own "Complete by" date. A busy calendar,
    // or a long course capped at MAX_SESSIONS_PER_COURSE short sessions
    // (scheduler.js), can silently push a course's LAST session out past
    // timeMax — the exact thing "Complete by" promises won't happen. Caught
    // here, before anything is written to Google Calendar or the database,
    // rather than surfacing it only after the sessions already exist.
    const overflowing = plan
      .filter((slot) => slot.sessions.length > 0 && slot.sessions[slot.sessions.length - 1].end > timeMax)
      .map((slot) => {
        const finishes = slot.sessions[slot.sessions.length - 1].end;
        return {
          course_id: slot.id,
          title: slot.title,
          finishes_at: finishes.toISOString().slice(0, 10),
          overdue_days: Math.ceil((finishes.getTime() - timeMax.getTime()) / 86400000),
        };
      });

    if (overflowing.length > 0 && !confirm_overflow) {
      // Nothing booked yet — Phases 1-3 below haven't run at all. The caller
      // (AutoScheduleModal.jsx / LearningHubPage.jsx's AutoScheduleStep)
      // shows this list and either re-POSTs with confirm_overflow: true to
      // book anyway, or picks a longer timeline / shorter session length and
      // resubmits fresh.
      return Response.json({
        warning: "timeline_exceeded",
        target_date: timeMax.toISOString().slice(0, 10),
        overflowing,
      });
    }

    // Phase 1 — clear out whatever every course already had booked, across
    // the whole run at once, before any of this run's fresh sessions go in.
    // Best-effort per event (a stale/already-deleted event 404s and is
    // ignored, same as Reset's own cleanup does) — one delete failing
    // doesn't hold up any other delete or the create phase after it.
    const allExistingEventIds = courses.flatMap((c) => c.existing_event_ids);
    await mapWithConcurrency(allExistingEventIds, CALENDAR_CONCURRENCY, async (eventId) => {
      try { await deleteEvent(accessToken, eventId); } catch { /* best-effort */ }
    });

    // Phase 2 — every session, for every course that actually has an open
    // slot, flattened into one list of independent create-event jobs (no
    // course's session depends on another course's event existing) and run
    // with the same bounded concurrency. skipped-for-no-slot courses need
    // no Calendar call at all, so they're filtered out before this.
    const jobs = courses.flatMap((course) => {
      const slot = plan.find((p) => p.id === course.id);
      if (!slot?.sessions.length) return [];
      const multi = slot.sessions.length > 1;
      return slot.sessions.map((session, i) => ({ course, slot, session, i, multi }));
    });
    const created = await mapWithConcurrency(jobs, CALENDAR_CONCURRENCY, async (job) => {
      const { course, session, i, multi } = job;
      const event = {
        summary: multi ? `Study: ${course.title} (${i + 1}/${job.slot.sessions.length})` : `Study: ${course.title}`,
        description: [course.link, course.outcome, "Auto-scheduled by TS - AI Ideas Hub · Learning Hub"].filter(Boolean).join("\n\n"),
        start: { dateTime: session.start.toISOString(), timeZone: tz },
        end: { dateTime: session.end.toISOString(), timeZone: tz },
      };
      try {
        const res = await createEvent(accessToken, event);
        return { courseId: course.id, eventId: res.id };
      } catch {
        return { courseId: course.id, eventId: null }; // this one session failed — the rest still get attempted
      }
    });
    const eventIdsByCourse = new Map();
    for (const { courseId, eventId } of created) {
      if (!eventId) continue;
      if (!eventIdsByCourse.has(courseId)) eventIdsByCourse.set(courseId, []);
      eventIdsByCourse.get(courseId).push(eventId);
    }

    // Phase 3 — same per-course bookkeeping and DB write as before, just
    // reading Calendar results computed above instead of awaiting them here.
    const scheduled = [];
    const skipped = [];
    for (const course of courses) {
      const slot = plan.find((p) => p.id === course.id);

      if (!slot?.sessions.length) {
        skipped.push({ course_id: course.id, title: course.title, reason: "No open slot found in that timeline." });
        await saveScheduledSessions(user.uid, course.id, { targetDate: null, eventIds: [] });
        continue;
      }

      const eventIds = eventIdsByCourse.get(course.id) || [];
      if (eventIds.length === 0) {
        skipped.push({ course_id: course.id, title: course.title, reason: "Could not write to Google Calendar." });
        await saveScheduledSessions(user.uid, course.id, { targetDate: null, eventIds: [] });
        continue;
      }

      const plannedCount = Math.ceil(slot.totalHours / sessionHours);
      const targetDate = slot.sessions[0].start.toISOString().slice(0, 10);
      await saveScheduledSessions(user.uid, course.id, { targetDate, eventIds });
      scheduled.push({
        course_id: course.id, title: course.title, target_date: targetDate,
        sessions_booked: eventIds.length, sessions_planned: plannedCount,
      });
    }

    return Response.json({ scheduled, skipped });
  } catch (e) {
    return jsonError(e, "Could not auto-schedule your Up next courses.");
  }
}
