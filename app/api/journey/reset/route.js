import { resetJourney, getCalendarConnection } from "@/features/learning/queries";
import { jsonError } from "@/lib/sql";
import { requireUser } from "@/features/auth/guard";
import { refreshAccessToken, deleteEvent } from "@/features/learning/googleCalendar";
import { decrypt } from "@/lib/crypto";

// POST /api/journey/reset → a full reset of what AI Learning itself owns
// for this learner, not just course progress: clears course_assignments
// (roadmap back to not_started), account_tracks (un-enrolled from every
// track — this is what makes the Get Started gateway show again), and
// calendar_connections (Google Calendar disconnected). Deliberately does
// NOT touch user_role — that's general account data administered on
// Manage -> Users, not this feature's to erase (see resetJourney()'s own
// comment, features/learning/queries.js). Lets the rest of the Get Started
// flow be re-tested from scratch, not just the roadmap.
// Also deletes whatever Auto Schedule booked on the caller's actual Google
// Calendar for those courses — best-effort: the DB reset has already
// happened by the time this runs, so a calendar failure (an expired
// connection, one already-deleted event, etc.) is reported back but never
// undoes it or blocks the rest of the cleanup.
export async function POST() {
  try {
    const user = await requireUser();
    // Read the connection BEFORE resetting — resetJourney() deletes
    // calendar_connections itself now, so the refresh token needed to
    // actually remove events on Google's side has to be captured first.
    const connectionBefore = await getCalendarConnection(user.uid);
    const { reset, eventIds, tracksCleared, calendarConnectionCleared } = await resetJourney(user.uid);

    let calendarCleared = 0;
    let calendarError = null;
    if (eventIds.length > 0 && connectionBefore) {
      try {
        const accessToken = await refreshAccessToken(decrypt(connectionBefore.refresh_token));
        const outcomes = await Promise.allSettled(eventIds.map((id) => deleteEvent(accessToken, id)));
        calendarCleared = outcomes.filter((o) => o.status === "fulfilled").length;
        if (calendarCleared < eventIds.length) calendarError = "Some calendar events couldn't be removed — check your Google Calendar directly.";
      } catch {
        calendarError = "Couldn't reach Google Calendar to remove the scheduled events — your roadmap was still reset.";
      }
    }

    return Response.json({ reset, tracksCleared, calendarConnectionCleared, calendarCleared, calendarError });
  } catch (e) {
    return jsonError(e, "Could not reset your account.");
  }
}
