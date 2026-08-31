# Explicitly out of scope (current phase)

Part of [ai-learning-requirements](00-overview.md) — read that first for the status-tag legend and how these files relate.

- [06-planner-knowledge-builder.md](06-planner-knowledge-builder.md) in full (Planner agent, Knowledge Builder) — unstarted, not merely deferred mid-build. [07-scheduler-auto-schedule.md](07-scheduler-auto-schedule.md) is the exception: Auto Schedule itself is built; only reminders and Claude-driven preference-aware sequencing remain unstarted there
- A real manager/report hierarchy for Team view ([05-team-view.md](05-team-view.md)) — it's org-wide (any admin, every learner) by deliberate choice, not scoped to "my direct reports"
- Competency-model file upload and skill-matching (old plan, [02-track-enrollment.md](02-track-enrollment.md)) — replaced by simple self-serve track enrollment; not being built toward
- Per-course prerequisite links (course A requires specifically course B) — only tier-level gating (all of tier N before tier N+1) is built ([03-your-journey.md](03-your-journey.md), 4.5); would need a new `course_prerequisites`-style table
- A Google Sheets catalog-sync workflow — catalog edits are SQL migrations for now ([01-course-catalog.md](01-course-catalog.md), 2.2)
- Manager approval on joining a track, or per-role capacity limits ([02-track-enrollment.md](02-track-enrollment.md))
- NotebookLM-generated mind maps, summaries, or exams ([06-planner-knowledge-builder.md](06-planner-knowledge-builder.md)) — the Wrap-up quiz and Knowledge artifacts card are both real now, but neither is this; see that file for the distinction
- A per-click or per-attempt history for the wrap-up quiz — one snapshot (question count + first-try accuracy) is written once, at completion; nothing records individual answers or retries ([03-your-journey.md](03-your-journey.md), 4.9)
- Reminders ahead of an Auto Schedule study block, and Claude-driven preference-aware sequencing ([07-scheduler-auto-schedule.md](07-scheduler-auto-schedule.md)) — Auto Schedule itself is real; these two parts of the original Scheduler idea are not
- An idea↔course link on the Ideas Hub side ([04-learner-dashboard.md](04-learner-dashboard.md)) — blocks two Learner Dashboard pieces (the "Skills applied" KPI and the Application · AI Ideas Hub card), both explicit "Coming soon · Phase 2" placeholders, not silently dropped
- An admin-facing editor for the skill taxonomy itself ([01-course-catalog.md](01-course-catalog.md), 2.1) — `courses.skills` is real and feeds the Retention card, but retagging or adding a skill today means editing `ai-track-seed.sql`'s `update` block and re-running it, same as any other catalog edit (the broader "no non-technical catalog editing" gap, [01-course-catalog.md](01-course-catalog.md), 2.2)
