import { clearTrackSchedule, getCalendarConnection } from "@/features/learning/queries";
import { jsonError } from "@/lib/sql";
import { requireUser } from "@/features/auth/guard";
import { refreshAccessToken, deleteEvent } from "@/features/learning/googleCalendar";
import { decrypt } from "@/lib/crypto";

// POST /api/tracks/:id/clear-schedule { course_ids? } → wipes every
// Auto-Scheduled calendar event for this account's not-yet-done courses in
// ONE track, and clears their target_date — same shape as journey/reset's
// own calendar cleanup, scoped down to a track instead of the whole
// account, and WITHOUT touching status/enrollment/completions
// (clearTrackSchedule, queries.js, is an UPDATE, not journey/reset's
// DELETE). Meant for "start this track's schedule over" — a learner who
// over-booked it, or wants a clean slate before picking a different
// session length — without losing progress elsewhere, or in tracks they
// didn't ask to touch. course_ids is optional — the "Clear schedule"
// modal (AutoScheduleModal's own sibling, features/learning/JourneyPage.jsx)
// always sends exactly the rows the learner left checked, so this is only
// ever omitted by a caller that genuinely wants everything in the track.
export async function POST(request, { params }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const { course_ids } = await request.json().catch(() => ({}));
    const connection = await getCalendarConnection(user.uid);
    const { cleared, eventIds } = await clearTrackSchedule(user.uid, id, course_ids);

    let calendarCleared = 0;
    let calendarError = null;
    if (eventIds.length > 0 && connection) {
      try {
        const accessToken = await refreshAccessToken(decrypt(connection.refresh_token));
        const outcomes = await Promise.allSettled(eventIds.map((eventId) => deleteEvent(accessToken, eventId)));
        calendarCleared = outcomes.filter((o) => o.status === "fulfilled").length;
        if (calendarCleared < eventIds.length) calendarError = "Some calendar events couldn't be removed — check your Google Calendar directly.";
      } catch {
        calendarError = "Couldn't reach Google Calendar to remove the scheduled events — target dates were still cleared.";
      }
    }

    return Response.json({ cleared, calendarCleared, calendarError });
  } catch (e) {
    return jsonError(e, "Could not clear this track's schedule.");
  }
}
