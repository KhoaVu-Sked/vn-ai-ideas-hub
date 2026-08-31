# AI Learning Platform — Requirements (start here)

**Status:** In progress — Learning Hub, Your Journey (including the wrap-up quiz and Auto Schedule), a Learner Dashboard (rebuilt to follow a design mockup — KPI row, Learning/Consistency/What's next cards, a Weekly streak tied to Auto Schedule), and Team view are built and live in this repo. The Planner and Knowledge Builder agents are not built; Scheduler is split — Auto Schedule itself is real (deterministic, not Claude-driven), reminders and preference-aware sequencing are not. Two Learner Dashboard cards are explicit Phase 2 placeholders pending an idea↔course link on the Ideas Hub side (04-learner-dashboard.md).
**Owner:** The Kiet
**Purpose:** One place for a learner to see the tracks available to them, enroll, and work through a roadmap of courses by seniority level (Intern → Principal) — mostly self-serve and manual, with one real exception: Auto Schedule books actual study time on the learner's Google Calendar. The rest of the original plan to automate planning, note-generation, and Claude-driven scheduling with agents is still ahead, not behind, this build.

This is one of several files under `ai-learning-requirements/`, split by feature so that working on one piece of AI Learning only requires reading the one or two files that actually describe it — not the whole feature's history. **Read this file first, always** — it's short. Then follow the table below to whichever file(s) cover the change you're making. Don't read the whole directory for a small, single-feature change.

Every file (including this one) tags each section:
- ✅ **Built** — live in this repo, in real use
- 🚧 **Partial** — a UI shell exists, but no real logic or data behind it yet
- ⬜ **Not started** — neither UI nor data exists

## Where to look

| If you're touching... | Read | Status |
|---|---|---|
| The course/quiz catalog, seeding (`ai-track-seed.sql`), or the (unbuilt) Sheets-sync idea | [01-course-catalog.md](01-course-catalog.md) | ✅ catalog data · ⬜ sync |
| Enrolling in a track, "Suggested tracks" / "Your tracks" on `/learning-hub` | [02-track-enrollment.md](02-track-enrollment.md) | ✅ Built |
| `/learning-hub/journey` — the List view, locking + Skip prerequisite, reordering, Up next, Knowledge artifacts, the Wrap-up quiz | [03-your-journey.md](03-your-journey.md) | ✅ Built |
| `/learning-hub/dashboard` — the KPI row, "Progress by level," My courses, Consistency / Retention / What's next / Application cards, Weekly streak | [04-learner-dashboard.md](04-learner-dashboard.md) | ✅ Built (2 cards Phase 2) |
| `/learning-hub/team` — admin roster, stat cards, read-only drill-down, the annual review date editor | [05-team-view.md](05-team-view.md) | ✅ Built |
| A roadmap-sequencing agent, or NotebookLM-style mind-map/summary generation | [06-planner-knowledge-builder.md](06-planner-knowledge-builder.md) | ⬜ Not started |
| Auto Schedule, Google Calendar OAuth, the annual review date *setting* itself | [07-scheduler-auto-schedule.md](07-scheduler-auto-schedule.md) | 🚧 Partial |
| "Does column/table X exist? What does it hold?" | [08-data-model.md](08-data-model.md) | reference |
| "Is X in scope right now, or was it deliberately cut?" | [09-out-of-scope.md](09-out-of-scope.md) | reference |

Cross-file references elsewhere in these files ("see 03-your-journey.md, 4.7") point at a specific file + subsection number, not a page number — the subsection numbering (4.1–4.10, 8.1–8.6, …) carries over unchanged from when this was one file, so a reference like "4.8" still means the same thing, just living in [03-your-journey.md](03-your-journey.md) now instead of further down the same page.

---

## 1. Architecture overview

| Layer | Reality | Status |
|---|---|---|
| Application data (accounts, tracks, courses, progress) | **Neon Postgres** — the same database as the rest of this app (`vn-ai-ideas-hub`), not a separate Supabase project | ✅ Built |
| Course catalog + quiz content | Lives in `courses` and `course_quiz_questions`. The AI Track's 20 real courses (imported from a roadmap spreadsheet) and quiz questions for 15 of them (imported from a separate course-framework spreadsheet) are seeded via **`ai-track-seed.sql`** — a standalone, idempotent, run-once-by-hand file, same pattern as `seed.sql`, kept out of `schema.sql` so that file stays pure table design. No live Google Sheets integration, no sync button, no editorial workflow for non-technical editors — see [01-course-catalog.md](01-course-catalog.md) | ✅ Built (as data), ⬜ (as an editable catalog workflow) |
| Wrap-up quiz | A learner opens a course's quiz (`/learning-hub/journey/[courseId]/quiz`), clicks any option to check it against the stored answer — no locking, no attempt limit, no per-click history recorded. Finishing the last question marks the course `complete` and snapshots question count + first-try accuracy onto `course_assignments` — see [03-your-journey.md](03-your-journey.md) | ✅ Built |
| Web app / dashboards | **Next.js on Vercel**, same deployment as the Ideas Hub. Five pages: `/learning-hub`, `/learning-hub/journey`, `/learning-hub/journey/[courseId]/quiz`, `/learning-hub/dashboard`, `/learning-hub/team` | ✅ Built |
| Course Planner & Progress Monitor | Would read a learner's roadmap and sequence it with target dates — see [06-planner-knowledge-builder.md](06-planner-knowledge-builder.md) | ⬜ Not started — no agent, no automated sequencing. The only "order" that exists is course insertion order plus a learner's own manual drag-reorder within a stage |
| Knowledge Builder (NotebookLM) | Would generate a mind map, summary, and exam per completed course — see [06-planner-knowledge-builder.md](06-planner-knowledge-builder.md) | ⬜ Not started — no mind-map/summary generation exists anywhere. The "Knowledge artifacts" card on Your Journey is real now, but it isn't this: it shows the learner's own recent wrap-up quiz results, not NotebookLM output |
| Scheduler & Reminders (Claude + Google Calendar) | Would place study time on a calendar and send reminders — see [07-scheduler-auto-schedule.md](07-scheduler-auto-schedule.md) | 🚧 Partial — **Auto Schedule is real** (books actual Google Calendar events, freebusy-aware, across a chosen position range and timeline); reminders and Claude-driven preference-aware sequencing are not built |

**What changed from the original plan, and why:** the original architecture spread data across Google Sheets (catalog) and Supabase (progress), synced by a Vercel route. In practice, this got built as one Neon Postgres database shared with the existing Ideas Hub app — simpler to operate, and the catalog is small enough (20 courses today) that a one-time SQL import was faster to ship than building a Sheets-sync pipeline. That pipeline ([01-course-catalog.md](01-course-catalog.md), 2.2) is not built and isn't currently planned; if the catalog grows past what's comfortable to edit via SQL migrations, that's the point to revisit it. The catalog content itself now lives in its own seed file (`ai-track-seed.sql`) rather than inline in `schema.sql`, for the same reason `seed.sql` is separate: table design and content are different kinds of change, run at different times.
