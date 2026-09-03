# Feature: Track enrollment (replaces "Competency Model Upload → Auto-Assigned Roadmap")

Part of [ai-learning-requirements](00-overview.md) — read that first for the status-tag legend and how these files relate.

The original plan (auto-generate a roadmap from an uploaded `.xlsx` competency model, matched against a hard-coded `skill_course_map`) was never built, and nothing here builds toward it. What replaced it is much simpler:

**Get Started gateway — ✅ Built.** `/learning-hub` now has two states, gated on whether the account is **onboarded** — `exists(≥1 account_tracks row)`, computed once in `getProfile()` (`features/accounts/queries.js`) and carried on the shared session object (`GET /api/auth/me`, `useSession()`), not a stored flag:
- **Not onboarded** (never enrolled in a track): the page shows a "Start Your Journey" gateway instead of the browse UI below. Clicking it opens a 3-step wizard — pick a seniority role (self-service, writes straight to `user_role.position` — `POST /api/onboarding/position`; see [08-data-model.md](08-data-model.md)), **optionally** connect Google Calendar (skippable — see [07-scheduler-auto-schedule.md](07-scheduler-auto-schedule.md)), then browse/enroll below. Finishing (enrolling in ≥1 track) navigates to `/learning-hub/journey`.
- **Onboarded**: the browse UI below is unchanged — this is still how a second (or third) track gets enrolled later.

The header nav reflects the same flag: "My Dashboard" is hidden, and "Learning Hub" points at `/learning-hub` instead of straight to `/learning-hub/journey`, until onboarded (`components/AppHeader.jsx`). This is nav-only — there's no route-level enforcement (`middleware.js` has no database access), so `/learning-hub/journey`/`/learning-hub/dashboard` stay reachable pre-onboarding via a direct URL, same as before this existed.

**What's built (the browse UI itself) — ✅:**
- A learner browses all tracks on `/learning-hub` ("Suggested tracks" — every track, with a course count and whether they're already enrolled).
- Clicking a track opens a preview of its full roadmap (courses grouped by `stage`).
- An **Enroll** / **Enrolled ✓** toggle button self-assigns the learner to that track (`account_tracks`, many-to-many — a learner can enroll in more than one track). No manager approval step exists; it's fully self-serve.
- Enrolled tracks show as their own cards under "Your tracks," with an "Enrolled" badge — which becomes a **"Completed"** badge once every course in that track is `complete` for this account (`course_assignments`, scoped per learner — someone else finishing a track doesn't mark it complete on your card). Same computation, same badge styling, in both "Your tracks" and "Suggested tracks" (they share one card component).

**Not built:**
- No `roadmap_status` concept (unassigned/assigned) — a learner with zero enrolled tracks just sees empty states, not a blocked/gated screen.
- No competency-file upload, no skill-matching, no `skill_course_map` / `unmatched_skills` tables.
- No manager approval or per-role capacity limits on joining a track.
