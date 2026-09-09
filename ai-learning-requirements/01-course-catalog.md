# Feature: Course catalog

Part of [ai-learning-requirements](00-overview.md) — read that first for the status-tag legend and how these files relate.

## 2.1 Course catalog storage — ✅ Built (differently than planned)
**What actually exists:** the `courses` table (Neon), one row per course:

| Column | Notes |
|---|---|
| `track_id` | Which track (AI Track, Career Track, Core Competency, ...) this course belongs to — one track per course |
| `stage` | A display-only grouping label, e.g. `"L0 — Foundations"` — not used for any gating logic |
| `title` | Course name |
| `focus_area` | Skill/competency this course maps to |
| `platform` | e.g. Anthropic Academy, Udemy Business, DevRev University |
| `est_hours` | Numeric estimate |
| `cost` | Free-text, e.g. `"Free"`, `"Udemy Business"`, `"Free (DevRev)"` |
| `outcome` | "What you can do after" — shown in the List view's expanded row (03-your-journey.md), and as the headline text on Mind map nodes |
| `priority` | `core` or `optional` — feeds the profile strip's "N of M core courses complete" |
| `expected_by_position` | `intern` / `junior` / `middle` / `senior` / `principal` — the seniority ladder a course belongs to; this is what tier-gating, the Mind map's columns, and the List view's drag-drop tier boundary are built on (03-your-journey.md). The Learner Dashboard's "Progress by level" chart (04-learner-dashboard.md) re-buckets this same column into 4 display-only levels (Foundations/Applied/Intermediate/Advanced) at read time — no separate column, this one stays the single source of truth |
| `skills` | `text[]`, e.g. `{"Prompt Engineering"}` — a shared skill taxonomy (migration 028), deliberately coarser than `focus_area`: several courses group under one skill, most courses carry one tag, a few carry two. Feeds the Learner Dashboard's Retention card, "Confidence by skill" (04-learner-dashboard.md) — the only reader today. Seven skills across the AI Track's 20 courses: AI Fundamentals, Prompt Engineering, AI Fluency & Responsible Use, Everyday AI Tools, AI for Customer Support, Agentic AI & Automation, Applied AI Development |
| `roadmap_order` | Integer (migration 030) — the seed's own authored curriculum sequence, numbered per track (AI Track 1-20, Career Track 1-36). What every within-tier sort now uses (`getJourney()`/`getTrackWithCourses()`/`getCoursesForAutoSchedule()`, `features/learning/queries.js`) instead of `created_at`, which can't do this: every course in a stage/track is inserted by one seed file's own INSERT statement (`ai-track-seed.sql` or `career-track-seed.sql`, 2.2 below), so they all share one `created_at` and that "tiebreak" never broke any ties. There's no per-learner override — manual drag-reorder existed and was removed (03-your-journey.md, 4.6) |
| `link` | Direct URL to the course |

No `course_id`-style stable business key exists — the primary key is a plain `uuid`, and seeding is idempotent on `(track_id, title)` instead.

**Quiz content — `course_quiz_questions`, one row per (course, question):** `position` (Q1, Q2, …), `question`, `options` (jsonb, `[{"label":"A","text":"..."}, ...]`), `correct_answer` (one of the option labels), `rationale`. Pure reference content — no per-learner state, no attempts table. The wrap-up quiz page (03-your-journey.md, 4.9) ships every question's full answer and rationale to the client up front; checking an answer is a local comparison, not a request.

15 of the 20 catalog courses have a quiz (144 questions total), imported one-time from a course-framework spreadsheet, same seeding mechanism as the courses themselves. The 5 without one: **Skedulo AI Usage Policy** (its source quiz is open-ended, no multiple-choice options, so it doesn't fit this format) and **Claude for Work**, **DevRev Product Mastery**, **AI Foundations & Industry Applications**, **Custom assistants: Claude Projects / Gemini Gems** (no quiz content was ever sourced for these). "Introduction to subagents (applied)" reuses "Introduction to subagents"'s questions, since it's the same underlying course listed twice on the roadmap at different tiers.

**Acceptance criteria:**
- [x] AI Track has 20 real courses from the roadmap spreadsheet, every field filled in (originally 23 — 3 were later removed as not required for this track: Model Context Protocol — build servers, GitHub Copilot Fundamentals, and the LLM App Development Bootcamp)
- [x] 15 of those 20 courses have a full quiz (144 questions), covering everything except the 5 named above
- [ ] Core Competency track has any courses at all (currently zero — the track exists, but nothing has been seeded into it; Career Track, 2.2 below, is a separate, newer track and was deliberately not used to fill this gap)
- [x] Seeding is idempotent (`on conflict (track_id, title) do nothing` / `on conflict (course_id, position) do nothing`), safe to re-run
- [x] Every course carries at least one `skills` tag from a shared, 7-skill taxonomy (not a per-course description) — seeded by a plain, re-runnable `update` in `ai-track-seed.sql` (not `on conflict`, since the taxonomy itself is expected to change over time — edit the values, re-run)

## 2.2 Career Track catalog — ✅ Built (Intern/P1 slice only)
A third track, added after the AI Track: 36 real resources — the Intern (P1) slice of Skedulo TS's own career-ladder learning plan, imported from "TS_Career_Track__Intern_P1_Learning_Plan.xlsx" (one tab per competency, 6 Technical/Functional + 6 Behavioural/Core). Seeded from its own file, **`career-track-seed.sql`** — split out from `ai-track-seed.sql` (which now carries only the AI Track) so either track's content can be edited and re-run independently; same idempotent pattern, just a separate file.

- Every row lands at `stage = 'L0 — Foundations'`, `expected_by_position = 'intern'` — the source file covers only the Intern (P1) level. A later level's own content, if imported later, would add more rows at `junior` and up, the same way the AI Track already spans intern through principal in one track.
- `focus_area` carries the source's own 12 competency names (Troubleshooting, Custom vs Core, Process and Procedures, Tools and Systems, SLAs and Deliverables, Incident Management & Escalation, Culture Champion, Growth and Learning, Cross-Functional Collaboration, Performance Excellence, Change Driver & Innovator, Customer First mindset) — one source spelling inconsistency ("Incident Mgmt & Escalation" on that tab's own first row) was normalized on the way in.
- **`skills`** — an 8-skill taxonomy, deliberately coarser than the 12 focus areas above (same reasoning as the AI Track's own 7-for-20): **Skedulo Pulse Platform Fundamentals** (7 courses), **Support Process & SLAs** (7), **Incident Management & Escalation** (4), **Customer-Centered Communication** (5), **Growth Mindset & Feedback Culture** (5), **Performance & Innovation** (5), **Support Tooling & Systems** (3), **Technical Troubleshooting** (1). "Skedulo Pulse Platform Fundamentals" is the one worth naming: it pulls together every course on the source's own "Custom vs Core" tab plus the one "Tools and Systems" course whose own title already says "(Skedulo Pulse Platform)" — courses that were previously scattered across two tabs under generic names, now one skill the Learner Dashboard's "Confidence by skill" card (04-learner-dashboard.md) can actually show a real confidence meter for. "Internal Platform Deep Dive" carries two tags (Skedulo Pulse Platform Fundamentals + Support Tooling & Systems) — its own outcome text spans both. "The Complete Storytelling Course for Speaking & Presenting" changed `focus_area` tab in a later spreadsheet revision (Cross-Functional Collaboration → Growth and Learning); its skill tag stayed Customer-Centered Communication regardless, since that's what the course is actually about.
- **No quiz content** — the source spreadsheet has none. These courses show "No quiz for this course yet" (03-your-journey.md, 4.9), same as the AI Track's own 5 quiz-less courses.
- `roadmap_order` is set directly in the courses INSERT (1-36, the source file's own tab-then-row order) rather than backfilled separately — see that column's own row above.
- **Reconciled against an earlier spreadsheet revision**, already imported once before this one: 7 resources were dropped (`Using Claude AI when investigating issues...`, `Skedulo Web App (Skedulo Pulse Platform)`, `Admin Console (internal tool)`, and 4 TED talks/videos spread across Growth and Learning / Cross-Functional Collaboration / Customer First mindset) and 1 was renamed (`Udemy: Curiosity and Lifelong Learning` → `Curiosity and Lifelong Learning`, title only, every other field unchanged). `career-track-seed.sql` reconciles this with a DELETE and an UPDATE ahead of its main INSERT, safe to run whether or not the earlier revision was ever seeded.

**Acceptance criteria:**
- [x] Career Track has 36 real resources from the current source spreadsheet, every field filled in
- [x] Every course carries at least one `skills` tag from a shared, 8-skill taxonomy specific to this track
- [x] Seeding is idempotent, same mechanism as the AI Track, in its own file
- [ ] No quiz content — not sourced, not built
- [ ] Levels beyond Intern (P1) — not sourced yet; the source spreadsheet's own name says "Intern (P1)" only

## 2.3 Catalog sync (Sheets → DB) — ⬜ Not started
No Google Sheets integration exists. No sync button, no `last_synced_at`, no validation-and-report flow. Adding or changing a course today means writing and running a SQL migration by hand. This is a real gap if the catalog needs frequent, non-technical edits — flagged here rather than pretended-away.
