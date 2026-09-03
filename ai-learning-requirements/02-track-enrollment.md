# Feature: Track enrollment (replaces "Competency Model Upload → Auto-Assigned Roadmap")

Part of [ai-learning-requirements](00-overview.md) — read that first for the status-tag legend and how these files relate.

The original plan (auto-generate a roadmap from an uploaded `.xlsx` competency model, matched against a hard-coded `skill_course_map`) was never built, and nothing here builds toward it. What replaced it is much simpler:

**Get Started gateway — ✅ Built.** `/learning-hub` now has two states, gated on whether the account is **onboarded** — `exists(≥1 account_tracks row)`, computed once in `getProfile()` (`features/accounts/queries.js`) and carried on the shared session object (`GET /api/auth/me`, `useSession()`), not a stored flag:
- **Not onboarded** (never enrolled in a track): the page shows a centered "Welcome to AI Learning Hub" gateway (vertically centered in the page, `.start-journey-btn`'s pulsing CTA) instead of the browse UI below. Clicking it opens the Get Started wizard, described step by step below. Finishing (enrolling in ≥1 track, then either running or skipping Auto Schedule) navigates to `/learning-hub/journey`.
- **Onboarded**: the browse UI below is unchanged — this is still how a second (or third) track gets enrolled later.

The header nav reflects the same flag: "My Dashboard" is hidden, and "Learning Hub" points at `/learning-hub` instead of straight to `/learning-hub/journey`, until onboarded (`components/AppHeader.jsx`). This is nav-only — there's no route-level enforcement (`middleware.js` has no database access), so `/learning-hub/journey`/`/learning-hub/dashboard` stay reachable pre-onboarding via a direct URL, same as before this existed.

**The Get Started wizard, step by step** (`OnboardingWizard`, `features/learning/LearningHubPage.jsx`) — 3 steps if Google Calendar never gets connected during the run, 4 if it does (the step counter reflects this: "step 3 of 3" vs "step 3 of 4," the same adaptive count the step *sequence* itself already used for skipping Calendar when it's already connected):
1. **Position** — pick a seniority level, self-service (`POST /api/onboarding/position`, writes straight to `user_role.position` — see [08-data-model.md](08-data-model.md)). Session refreshes immediately after, so step 4's fixed range (below) reads the value just picked, not a stale one.
2. **Connect Google Calendar** — optional, skippable (see [07-scheduler-auto-schedule.md](07-scheduler-auto-schedule.md)).
3. **Browse tracks & enroll** — a checkbox **multi-select**, not one-at-a-time: check as many tracks as wanted, nothing is written until **Continue** enrolls in all of them in one batch (`Promise.allSettled` over one `POST /api/tracks/:id/assignment` per track — a partial failure still keeps whichever succeeded). Already-enrolled tracks show as a plain checked row, not a checkbox — there's nothing left to pick there. No separate per-track Enroll button anymore.
4. **Auto Schedule** (only when Calendar is connected — if it never gets connected during steps 2-3, this step is skipped entirely and Continue goes straight to the closing screen below) — books study time for the account's now-complete roadmap. The position range is **fixed** (Intern through whatever was picked in step 1) and not editable here, on purpose — this is a one-time "catch up your whole roadmap so far" action for a brand-new account, not the same day-to-day tool Up next's own 🪄 button is (`AutoScheduleStep`, a separate component from the editable `AutoScheduleModal` that button opens — see [07-scheduler-auto-schedule.md](07-scheduler-auto-schedule.md)). Only the "Complete by" date stays adjustable. A **Skip for now** stays available even here.

Either path (Auto Schedule ran, was skipped, or never applied) ends at the same closing screen: **"You've successfully completed your setup"** (naming how many study blocks got booked, if Auto Schedule ran) with a centered **"Go to My Journey"** button — so finishing always ends the same deliberate way, not sometimes just silently navigating away.

**What's built (the browse UI itself) — ✅:**
- A learner browses all tracks on `/learning-hub` ("Suggested tracks" — every track, with a course count and whether they're already enrolled).
- Clicking a track opens a preview of its full roadmap (courses grouped by `stage`).
- An **Enroll** button self-assigns the learner to that track (`account_tracks`, many-to-many — a learner can enroll in more than one track). No manager approval step exists; it's fully self-serve. **One-directional**: once enrolled, a track can't be removed — `enrollInTrack()` (`features/learning/queries.js`) is a plain idempotent insert, not the toggle it used to be, and the UI backs this too (an enrolled track's own control becomes a static "Enrolled ✓," not a button). The learner-facing copy just says a track can't be removed from their inventory once added; it doesn't say why (`account_tracks` feeds the performance-review record).
- Enrolled tracks show as their own cards under "Your tracks," with an "Enrolled" badge — which becomes a **"Completed"** badge once every course in that track is `complete` for this account (`course_assignments`, scoped per learner — someone else finishing a track doesn't mark it complete on your card). Same computation, same badge styling, in both "Your tracks" and "Suggested tracks" (they share one card component).

**Not built:**
- No `roadmap_status` concept (unassigned/assigned) — a learner with zero enrolled tracks just sees empty states, not a blocked/gated screen.
- No competency-file upload, no skill-matching, no `skill_course_map` / `unmatched_skills` tables.
- No manager approval or per-role capacity limits on joining a track.
