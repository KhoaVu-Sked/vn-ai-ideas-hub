# Feature: Course catalog

Part of [ai-learning-requirements](00-overview.md) — read that first for the status-tag legend and how these files relate.

## 2.1 Course catalog storage — ✅ Built (differently than planned)
**What actually exists:** the `courses` table (Neon), one row per course:

| Column | Notes |
|---|---|
| `track_id` | Which track (AI Track, Core Competency, ...) this course belongs to — one track per course |
| `stage` | A display-only grouping label, e.g. `"L0 — Foundations"` — not used for any gating logic |
| `title` | Course name |
| `focus_area` | Skill/competency this course maps to |
| `platform` | e.g. Anthropic Academy, Udemy Business, DevRev University |
| `est_hours` | Numeric estimate |
| `cost` | Free-text, e.g. `"Free"`, `"Udemy Business"`, `"Free (DevRev)"` |
| `outcome` | "What you can do after" — shown in the List view's expanded row (03-your-journey.md), and as the headline text on Mind map nodes |
| `priority` | `core` or `optional` — feeds the profile strip's "N of M core courses complete" |
| `expected_by_position` | `intern` / `junior` / `middle` / `senior` / `principal` — the seniority ladder a course belongs to; this is what tier-gating, the Mind map's columns, and the List view's drag-drop tier boundary are built on (03-your-journey.md). The Learner Dashboard's "Progress by level" chart (04-learner-dashboard.md) re-buckets this same column into 4 display-only levels (Foundations/Applied/Intermediate/Advanced) at read time — no separate column, this one stays the single source of truth |
| `link` | Direct URL to the course |

No `course_id`-style stable business key exists — the primary key is a plain `uuid`, and seeding is idempotent on `(track_id, title)` instead.

**Quiz content — `course_quiz_questions`, one row per (course, question):** `position` (Q1, Q2, …), `question`, `options` (jsonb, `[{"label":"A","text":"..."}, ...]`), `correct_answer` (one of the option labels), `rationale`. Pure reference content — no per-learner state, no attempts table. The wrap-up quiz page (03-your-journey.md, 4.9) ships every question's full answer and rationale to the client up front; checking an answer is a local comparison, not a request.

15 of the 20 catalog courses have a quiz (144 questions total), imported one-time from a course-framework spreadsheet, same seeding mechanism as the courses themselves. The 5 without one: **Skedulo AI Usage Policy** (its source quiz is open-ended, no multiple-choice options, so it doesn't fit this format) and **Claude for Work**, **DevRev Product Mastery**, **AI Foundations & Industry Applications**, **Custom assistants: Claude Projects / Gemini Gems** (no quiz content was ever sourced for these). "Introduction to subagents (applied)" reuses "Introduction to subagents"'s questions, since it's the same underlying course listed twice on the roadmap at different tiers.

**Acceptance criteria:**
- [x] AI Track has 20 real courses from the roadmap spreadsheet, every field filled in (originally 23 — 3 were later removed as not required for this track: Model Context Protocol — build servers, GitHub Copilot Fundamentals, and the LLM App Development Bootcamp)
- [x] 15 of those 20 courses have a full quiz (144 questions), covering everything except the 5 named above
- [ ] Core Competency track has any courses at all (currently zero — the track exists, but nothing has been seeded into it)
- [x] Seeding is idempotent (`on conflict (track_id, title) do nothing` / `on conflict (course_id, position) do nothing`), safe to re-run

## 2.2 Catalog sync (Sheets → DB) — ⬜ Not started
No Google Sheets integration exists. No sync button, no `last_synced_at`, no validation-and-report flow. Adding or changing a course today means writing and running a SQL migration by hand. This is a real gap if the catalog needs frequent, non-technical edits — flagged here rather than pretended-away.
