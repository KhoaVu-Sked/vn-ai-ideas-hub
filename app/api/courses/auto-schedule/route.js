import { requireUser } from "@/features/auth/guard";
import { jsonError, err } from "@/lib/sql";
import { POSITIONS } from "@/features/accounts/constants";
import {
  getCalendarConnection, getCoursesForAutoSchedule, getAccountSchedulingInfo,
  saveScheduledEvent, deleteCalendarConnection,
} from "@/features/learning/queries";
import { refreshAccessToken, freeBusy, createEvent, updateEvent } from "@/features/learning/googleCalendar";
import { computeSchedule } from "@/features/learning/scheduler";
import { decrypt } from "@/lib/crypto";
import { APP_NAME } from "@/lib/brand";

// Falls back to this only when the account has never set accounts.timezone —
// most of this team is Vietnam-based, so it's a reasonable default rather
// than defaulting to UTC and booking everyone's study time at 4am.
const DEFAULT_TIMEZONE = "Asia/Ho_Chi_Minh";
const MAX_TIMELINE_MONTHS = 60;

// POST /api/courses/auto-schedule { from_position, to_position, timeline_months }
//
// Finds every not-yet-done course between the two seniority tiers (across
// the caller's own enrolled tracks), spreads them across the given timeline
// respecting the caller's ACTUAL Google Calendar free/busy time, and writes
// one calendar event + course_assignments.target_date per course. Re-running
// this updates the events it created before rather than duplicating them.
export async function POST(request) {
  try {
    const user = await requireUser();
    const { from_position, to_position, timeline_months } = await request.json();

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

    const plan = computeSchedule({ courses, busy, timelineDays, timeZone: tz, now });

    const scheduled = [];
    const skipped = [];
    for (const course of courses) {
      const slot = plan.find((p) => p.id === course.id);
      if (!slot?.start) {
        skipped.push({ course_id: course.id, title: course.title, reason: "No open slot found in that timeline." });
        continue;
      }

      const event = {
        summary: `Study: ${course.title}`,
        description: [course.link, course.outcome, `Auto-scheduled by ${APP_NAME} · Learning Hub`].filter(Boolean).join("\n\n"),
        start: { dateTime: slot.start.toISOString(), timeZone: tz },
        end: { dateTime: slot.end.toISOString(), timeZone: tz },
      };

      let created;
      try {
        created = course.calendar_event_id
          ? await updateEvent(accessToken, course.calendar_event_id, event)
          : await createEvent(accessToken, event);
      } catch (e) {
        if (e.status === 404 && course.calendar_event_id) {
          // The learner deleted the old event themselves — make a new one.
          try { created = await createEvent(accessToken, event); }
          catch { skipped.push({ course_id: course.id, title: course.title, reason: "Could not write to Google Calendar." }); continue; }
        } else {
          skipped.push({ course_id: course.id, title: course.title, reason: "Could not write to Google Calendar." });
          continue;
        }
      }

      const targetDate = slot.start.toISOString().slice(0, 10);
      await saveScheduledEvent(user.uid, course.id, { targetDate, eventId: created.id });
      scheduled.push({
        course_id: course.id, title: course.title, target_date: targetDate,
        event_link: created.htmlLink, capped: slot.capped,
      });
    }

    return Response.json({ scheduled, skipped });
  } catch (e) {
    return jsonError(e, "Could not auto-schedule your Up next courses.");
  }
}
