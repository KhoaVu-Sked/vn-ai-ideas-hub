// Google Calendar access for Auto Schedule — a separate, additional grant
// from Google Sign-in (features/auth/google.js), with its OWN OAuth client
// config, on purpose: adding a redirect URI to the shared sign-in client
// needs Editor/Owner rights on that Google Cloud project, which not everyone
// building against this has. So this reads GOOGLE_CALENDAR_CLIENT_ID/SECRET
// first — your own client, e.g. for a UAT demo, no shared-project access
// needed — and only falls back to the sign-in client's GOOGLE_CLIENT_ID/
// SECRET if those aren't set (the default once someone with access adds the
// redirect URI there instead). Keeps its own refresh token per account
// (calendar_connections) either way — sign-in itself never stores a token.
// See ai-learning-requirements.md Section 8 for why.
//
// Needs, on WHICHEVER client ends up in use here:
//   - the Calendar API enabled on its Cloud project
//   - calendar.freebusy + calendar.events added to its consent screen scopes
//   - this callback URL registered for each environment you run from:
//       https://<app>.vercel.app/api/calendar/connect/callback
//       http://localhost:3000/api/calendar/connect/callback
// Not shared code with features/auth/google.js on purpose — features/<name>
// isn't meant to import across features (see docs/change-map.md).

const clientId = () => (process.env.GOOGLE_CALENDAR_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || "").trim();
const clientSecret = () => (process.env.GOOGLE_CALENDAR_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || "").trim();

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const CALENDAR_SCOPES = "https://www.googleapis.com/auth/calendar.freebusy https://www.googleapis.com/auth/calendar.events";

export const calendarConfigured = () => Boolean(clientId() && clientSecret());

export const connectCallbackUrl = (origin) => `${origin}/api/calendar/connect/callback`;

export function connectUrl({ origin, state }) {
  const p = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: connectCallbackUrl(origin),
    response_type: "code",
    scope: CALENDAR_SCOPES,
    state,
    access_type: "offline", // ask for a refresh token, not just a short-lived access token
    prompt: "consent",      // force one back on every connect, not only the very first grant
    hd: "skedulo.com",      // hint only, same as sign-in — never trust this for authorization
  });
  return `${AUTH_ENDPOINT}?${p}`;
}

// Full token response — unlike auth/google.js's identityFromCode (which only
// wants the id_token and throws the rest away), this flow needs the
// refresh_token to call the Calendar API later, outside any browser round trip.
export async function exchangeCodeForTokens({ code, origin }) {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId(),
      client_secret: clientSecret(),
      redirect_uri: connectCallbackUrl(origin),
      grant_type: "authorization_code",
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.refresh_token) {
    // A missing refresh_token usually means prompt=consent didn't actually
    // reach Google (e.g. a replayed/cached request) — worth its own message
    // rather than a generic failure, since retrying the connect click fixes it.
    throw new Error(body.error_description || body.error || "Google didn't return a refresh token — try connecting again.");
  }
  return body; // { access_token, refresh_token, expires_in, scope, ... }
}

// Mints a fresh access token from the stored refresh token. Throws with
// e.code = 'invalid_grant' when the connection has been revoked (password
// change, "Remove access" in the learner's Google account, etc.) — the
// caller uses that to drop the stale calendar_connections row.
export async function refreshAccessToken(refreshToken) {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId(),
      client_secret: clientSecret(),
      grant_type: "refresh_token",
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(body.error_description || body.error || "Could not refresh Google Calendar access.");
    e.code = body.error;
    throw e;
  }
  return body.access_token;
}

// Busy blocks on the primary calendar between timeMin/timeMax (ISO strings).
export async function freeBusy(accessToken, { timeMin, timeMax }) {
  const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ timeMin, timeMax, items: [{ id: "primary" }] }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error?.message || "Could not read your Google Calendar availability.");
  return body.calendars?.primary?.busy || []; // [{ start, end }] ISO strings
}

export async function createEvent(accessToken, event) {
  const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(event),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error?.message || "Could not create the calendar event.");
  return body; // { id, htmlLink, ... }
}

// Used to re-schedule a course that already has a calendar_event_id, instead
// of creating a duplicate. A 404 (the learner deleted the event themselves)
// carries status on the thrown error so the caller can fall back to createEvent.
export async function updateEvent(accessToken, eventId, event) {
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(event),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body.error?.message || "Could not update the calendar event."), { status: res.status });
  return body;
}
