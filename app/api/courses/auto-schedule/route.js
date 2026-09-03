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

// POST /api/courses/auto-schedule { from_position, to_position, timeline_months, session_hours }
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
export async function POST(request) {
  try {
    const user = await requireUser();
    const { from_position, to_position, timeline_months, session_hours } = await request.json();

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

    const courses = await getCoursesForAutoSchedule(user.uid, from_position, to_position);
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

    const scheduled = [];
    const skipped = [];
    for (const course of courses) {
      const slot = plan.find((p) => p.id === course.id);

      // Clear out whatever this course already had booked BEFORE placing
      // this run's fresh sessions — best-effort: a stale/already-deleted
      // event 404s and is ignored, same as Reset's own cleanup does.
      for (const eventId of course.existing_event_ids) {
        try { await deleteEvent(accessToken, eventId); } catch { /* best-effort */ }
      }

      if (!slot?.sessions.length) {
        skipped.push({ course_id: course.id, title: course.title, reason: "No open slot found in that timeline." });
        // The old events are already gone (above) — clear this course's own
        // record to match, rather than leaving it pointing at deleted events.
        await saveScheduledSessions(user.uid, course.id, { targetDate: null, eventIds: [] });
        continue;
      }

      const plannedCount = Math.ceil(slot.totalHours / sessionHours);
      const eventIds = [];
      for (let i = 0; i < slot.sessions.length; i++) {
        const session = slot.sessions[i];
        const multi = slot.sessions.length > 1;
        const event = {
          summary: multi ? `Study: ${course.title} (${i + 1}/${slot.sessions.length})` : `Study: ${course.title}`,
          description: [course.link, course.outcome, "Auto-scheduled by TS - AI Ideas Hub · Learning Hub"].filter(Boolean).join("\n\n"),
          start: { dateTime: session.start.toISOString(), timeZone: tz },
          end: { dateTime: session.end.toISOString(), timeZone: tz },
        };
        try {
          const created = await createEvent(accessToken, event);
          eventIds.push(created.id);
        } catch { /* this one session failed — the rest still get attempted */ }
      }

      if (eventIds.length === 0) {
        skipped.push({ course_id: course.id, title: course.title, reason: "Could not write to Google Calendar." });
        await saveScheduledSessions(user.uid, course.id, { targetDate: null, eventIds: [] });
        continue;
      }

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
