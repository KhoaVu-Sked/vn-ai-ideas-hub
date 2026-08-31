# Feature: Track enrollment (replaces "Competency Model Upload → Auto-Assigned Roadmap")

Part of [ai-learning-requirements](00-overview.md) — read that first for the status-tag legend and how these files relate.

The original plan (auto-generate a roadmap from an uploaded `.xlsx` competency model, matched against a hard-coded `skill_course_map`) was never built, and nothing here builds toward it. What replaced it is much simpler:

**What's built — ✅:**
- A learner browses all tracks on `/learning-hub` ("Suggested tracks" — every track, with a course count and whether they're already enrolled).
- Clicking a track opens a preview of its full roadmap (courses grouped by `stage`).
- An **Enroll** / **Enrolled ✓** toggle button self-assigns the learner to that track (`account_tracks`, many-to-many — a learner can enroll in more than one track). No manager approval step exists; it's fully self-serve.
- Enrolled tracks show as their own cards under "Your tracks," with an "Enrolled" badge — which becomes a **"Completed"** badge once every course in that track is `complete` for this account (`course_assignments`, scoped per learner — someone else finishing a track doesn't mark it complete on your card). Same computation, same badge styling, in both "Your tracks" and "Suggested tracks" (they share one card component).

**Not built:**
- No `roadmap_status` concept (unassigned/assigned) — a learner with zero enrolled tracks just sees empty states, not a blocked/gated screen.
- No competency-file upload, no skill-matching, no `skill_course_map` / `unmatched_skills` tables.
- No manager approval or per-role capacity limits on joining a track.
