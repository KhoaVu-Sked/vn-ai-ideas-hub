import { resetJourney, getCalendarConnection } from "@/features/learning/queries";
import { jsonError } from "@/lib/sql";
import { requireUser } from "@/features/auth/guard";
import { refreshAccessToken, deleteEvent } from "@/features/learning/googleCalendar";
import { decrypt } from "@/lib/crypto";

// POST /api/journey/reset → clear all of the caller's course_assignments,
// reverting every course back to its track's original not_started state.
// Also deletes whatever Auto Schedule booked on the caller's actual Google
// Calendar for those courses — best-effort: the DB reset has already
// happened by the time this runs, so a calendar failure (an expired
// connection, one already-deleted event, etc.) is reported back but never
// undoes it or blocks the rest of the cleanup.
export async function POST() {
  try {
    const user = await requireUser();
    const { reset, eventIds } = await resetJourney(user.uid);

    let calendarCleared = 0;
    let calendarError = null;
    if (eventIds.length > 0) {
      const connection = await getCalendarConnection(user.uid);
      if (connection) {
        try {
          const accessToken = await refreshAccessToken(decrypt(connection.refresh_token));
          const outcomes = await Promise.allSettled(eventIds.map((id) => deleteEvent(accessToken, id)));
          calendarCleared = outcomes.filter((o) => o.status === "fulfilled").length;
          if (calendarCleared < eventIds.length) calendarError = "Some calendar events couldn't be removed — check your Google Calendar directly.";
        } catch {
          calendarError = "Couldn't reach Google Calendar to remove the scheduled events — your roadmap was still reset.";
        }
      }
    }

    return Response.json({ reset, calendarCleared, calendarError });
  } catch (e) {
    return jsonError(e, "Could not reset your journey.");
  }
}
