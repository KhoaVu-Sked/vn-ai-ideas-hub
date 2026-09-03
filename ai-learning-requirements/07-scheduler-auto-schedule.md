# Feature: Scheduler & Reminders (agent) — 🚧 Partial (Auto Schedule is built; reminders are not)

Part of [ai-learning-requirements](00-overview.md) — read that first for the status-tag legend and how these files relate.

Auto Schedule ([03-your-journey.md](03-your-journey.md), 4.7) is real: a learner picks a position range and a timeline, and it books actual Google Calendar events around their existing meetings. What it isn't: a reminder system — no `reminders_log`, no notification tied to an upcoming study block. That half of this section's original name is still unbuilt.

### 8.1 Why not n8n
Other automations in this app run through n8n (Slack notify, SLA checks — CLAUDE.md architecture decision #5). This doesn't: n8n here is a Skedulo-managed internal tunnel, not realistically requestable. Auto Schedule is plain Next.js API routes instead — `app/api/calendar/connect(/callback)` and `app/api/courses/auto-schedule` — same as the rest of this app's server-side logic.

### 8.2 Calendar access is authorization, not login
This app's own auth is unaffected (Google Sign-in restricted to `@skedulo.com` — `features/auth/google.js`, `PASSWORD_LOGIN` is off for normal users). Connecting Google Calendar is a separate, additional grant a signed-in learner makes — from Up next's 🪄 button (Auto Schedule's own modal drives it inline on a 409 `not_connected`), from the Get Started wizard's optional Calendar step ([02-track-enrollment.md](02-track-enrollment.md)), or from a permanent **Connect Google Calendar** button on Your Journey's profile strip ([03-your-journey.md](03-your-journey.md), 4.2) — not a login swap, and all three hit the same `/api/calendar/connect(/callback)` routes. Auto Schedule's own button is greyed out until connected ([03-your-journey.md](03-your-journey.md), 4.7) rather than only failing inline on click.

### 8.3 The OAuth client — reuses sign-in's by default, but overridable
Google Sign-in already had a working `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, proven to work for `@skedulo.com` accounts in production. Auto Schedule defaults to reusing that **same** client rather than registering a new one — `features/learning/googleCalendar.js` requests `calendar.freebusy` + `calendar.events` in a second, separate consent step (`access_type=offline`, `prompt=consent`, so a refresh token comes back every time).

Adding a redirect URI to that client needs Editor/Owner rights on its Cloud project, though — access not everyone touching this repo has. So `GOOGLE_CALENDAR_CLIENT_ID`/`GOOGLE_CALENDAR_CLIENT_SECRET`, if set, override `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` for calendar access only (sign-in is untouched either way) — a personal Google Cloud project someone can stand up themselves (External + Testing consent screen, no one else's permission needed) to demo or test against, e.g. from a UAT deploy, without touching the shared client at all. See `.env.example` for the exact steps either way.

### 8.4 Where Claude fits — not yet
The calculation (`features/learning/scheduler.js`) is a plain freebusy-diff: courses are spread proportionally across the timeline, each placed in the first open weekday work-hours slot (learner's own `accounts.timezone`, default `Asia/Ho_Chi_Minh`), overlap-checked against both real Google busy blocks and every slot Auto Schedule itself just placed. No LLM call anywhere in this path — a Claude API call for preference-aware sequencing ("mornings only," multi-course spacing beyond simple proportional spread) is still a possible Phase 2, not started.

### 8.5 Real behavior, not a placeholder
- Learner picks From/To position (defaults to their own `user_role.position` on both ends) and a **"Complete by" date** — a native date field, defaulting to the next occurrence of the annual review date (8.6). Quick-pick chips ("Annual review · Oct 13", "3 months", "6 months") jump the field; any other date can be typed directly for a tighter or looser schedule. Converted to the fractional-months number the endpoint below actually wants (`monthsUntilDateStr`, client-side, in `features/learning/shared.js`) only on submit — the API contract itself (`{ from_position, to_position, timeline_months }`) didn't change.
- Each not-yet-done course in that range across their enrolled tracks gets one study-block event (`Study: {title}`), capped at 4 hours per block regardless of `est_hours` (one session per course, not a multi-day split — `capped: true` surfaces in the result when this kicks in).
- Writes land on the same `course_assignments.target_date` Up next's pencil-edit already writes, so results appear there immediately — plus `calendar_event_id`, so re-running Auto Schedule updates existing events instead of duplicating them (falls back to creating a new one if the learner deleted it on their own calendar).
- A revoked/expired Google connection (`invalid_grant`) drops the stored `calendar_connections` row automatically, so the next attempt correctly asks to reconnect rather than failing the same way silently.
- **Reset** ([03-your-journey.md](03-your-journey.md), 4.5) also deletes whatever Auto Schedule booked on the caller's Google Calendar, not just this app's own rows — best-effort: the roadmap reset always lands even if the calendar cleanup partly fails (surfaced as a non-fatal message), useful for re-running a demo cleanly.

### 8.6 The annual review date — admin-editable — ✅ Built
The "Complete by" field's default (8.5) isn't hardcoded — it reads `app_settings.annual_review_date` (`MM-DD`, no year, since it recurs every year), the same key/value table `email_notifications` already used ([00-overview.md](00-overview.md)'s architecture decision to keep one Neon database, extended — no new table, no migration).

- **Read** — `GET /api/settings` (`features/admin/queries.js` → `listSettings()`), open to any signed-in user (loosened from admin-only), since every learner's Auto Schedule modal needs it, not just admins. Falls back to `10-13` if never set (a fresh database needs no seeding).
- **Write** — `PATCH /api/settings { annual_review_date: "MM-DD" }`, admin-only (`requireAdmin`), validated server-side (`isValidMonthDay` — a real MM-DD shape, not calendar-day-accurate, e.g. `02-30` still passes). Edited from Team view's header ([05-team-view.md](05-team-view.md)) — no Manage → Settings entry for this; Team view is the only admin surface that reads or writes it today.
- **The link itself**: an admin changes the date on Team view → every learner's Auto Schedule modal (Your Journey, 4.7) picks it up on next open, live, no redeploy. Nothing caches it beyond the page load that fetched it.

**Acceptance criteria:**
- [x] Not-connected learners are prompted to connect Google Calendar inline, redirected back to the same modal on success
- [x] Auto Schedule never double-books a Google Calendar busy block it can see, or two of its own newly placed courses against each other
- [x] Re-running Auto Schedule updates previously created events rather than creating duplicates
- [x] The "Complete by" date defaults to the (admin-editable) annual review date and can be overridden per run
- [x] Changing the annual review date on Team view changes the default every learner sees, without a redeploy
- [ ] Reminders (a notification ahead of an upcoming study block) — not started
- [ ] Preference-aware scheduling via Claude (Phase 2) — not started
