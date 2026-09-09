import { clearCourseSchedule, getCalendarConnection } from "@/features/learning/queries";
import { jsonError } from "@/lib/sql";
import { requireUser } from "@/features/auth/guard";
import { refreshAccessToken, deleteEvent } from "@/features/learning/googleCalendar";
import { decrypt } from "@/lib/crypto";

// POST /api/courses/:id/clear-schedule → removes just THIS course's own
// Auto-Scheduled calendar event(s) and clears its target_date, leaving
// status (complete/in_progress/etc.) and every other course untouched.
// Same shape as tracks/:id/clear-schedule, one course instead of a whole
// track — see clearCourseSchedule (queries.js) for why this is an UPDATE,
// not a delete of the course_assignments row itself.
export async function POST(_request, { params }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const connection = await getCalendarConnection(user.uid);
    const { cleared, eventIds } = await clearCourseSchedule(user.uid, id);

    let calendarCleared = 0;
    let calendarError = null;
    if (eventIds.length > 0 && connection) {
      try {
        const accessToken = await refreshAccessToken(decrypt(connection.refresh_token));
        const outcomes = await Promise.allSettled(eventIds.map((eventId) => deleteEvent(accessToken, eventId)));
        calendarCleared = outcomes.filter((o) => o.status === "fulfilled").length;
        if (calendarCleared < eventIds.length) calendarError = "Some calendar events couldn't be removed — check your Google Calendar directly.";
      } catch {
        calendarError = "Couldn't reach Google Calendar to remove the scheduled event — the target date was still cleared.";
      }
    }

    return Response.json({ cleared, calendarCleared, calendarError });
  } catch (e) {
    return jsonError(e, "Could not remove this course from your calendar.");
  }
}
