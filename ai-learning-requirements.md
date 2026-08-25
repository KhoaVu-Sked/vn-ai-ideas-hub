# AI Learning Platform — Requirements

**Status:** In progress — Learning Hub, Your Journey (including the wrap-up quiz), and Team view are built and live in this repo; the agent layer (Planner, Knowledge Builder, Scheduler) is not.
**Owner:** The Kiet
**Purpose:** One place for a learner to see the tracks available to them, enroll, and work through a roadmap of courses by seniority level (Intern → Principal) — currently self-serve and manual; the original plan to automate planning, note-generation, and scheduling with agents is still ahead, not behind, this build.

This file describes what the AI Learning feature actually is today, section by section, each tagged:
- ✅ **Built** — live in this repo, in real use
- 🚧 **Partial** — a UI shell exists, but no real logic or data behind it yet
- ⬜ **Not started** — neither UI nor data exists

---

## 1. Architecture overview

| Layer | Reality | Status |
|---|---|---|
| Application data (accounts, tracks, courses, progress) | **Neon Postgres** — the same database as the rest of this app (`vn-ai-ideas-hub`), not a separate Supabase project | ✅ Built |
| Course catalog + quiz content | Lives in `courses` and `course_quiz_questions`. The AI Track's 20 real courses (imported from a roadmap spreadsheet) and quiz questions for 15 of them (imported from a separate course-framework spreadsheet) are seeded via **`ai-track-seed.sql`** — a standalone, idempotent, run-once-by-hand file, same pattern as `seed.sql`, kept out of `schema.sql` so that file stays pure table design. No live Google Sheets integration, no sync button, no editorial workflow for non-technical editors | ✅ Built (as data), ⬜ (as an editable catalog workflow) |
| Wrap-up quiz | A learner opens a course's quiz (`/learning-hub/journey/[courseId]/quiz`), clicks any option to check it against the stored answer — no locking, no attempt limit, no per-click history recorded. Finishing the last question marks the course `complete` and snapshots question count + first-try accuracy onto `course_assignments` | ✅ Built |
| Web app / dashboards | **Next.js on Vercel**, same deployment as the Ideas Hub. Four pages: `/learning-hub`, `/learning-hub/journey`, `/learning-hub/journey/[courseId]/quiz`, `/learning-hub/team` | ✅ Built |
| Course Planner & Progress Monitor | Would read a learner's roadmap and sequence it with target dates | ⬜ Not started — no agent, no automated sequencing. The only "order" that exists is course insertion order plus a learner's own manual drag-reorder within a stage |
| Knowledge Builder (NotebookLM) | Would generate a mind map, summary, and exam per completed course | ⬜ Not started — no mind-map/summary generation exists anywhere. The "Knowledge artifacts" card on Your Journey is real now, but it isn't this: it shows the learner's own recent wrap-up quiz results (see Section 4.8), not NotebookLM output |
| Scheduler & Reminders (Claude + Google Calendar) | Would place study time on a calendar and send reminders | 🚧 Partial — **Auto Schedule is real** (books actual Google Calendar events, freebusy-aware, across a chosen position range and timeline — see Section 8); reminders and Claude-driven preference-aware sequencing are not built |

**What changed from the original plan, and why:** the original architecture spread data across Google Sheets (catalog) and Supabase (progress), synced by a Vercel route. In practice, this got built as one Neon Postgres database shared with the existing Ideas Hub app — simpler to operate, and the catalog is small enough (20 courses today) that a one-time SQL import was faster to ship than building a Sheets-sync pipeline. That pipeline (Section 2.2) is not built and isn't currently planned; if the catalog grows past what's comfortable to edit via SQL migrations, that's the point to revisit it. The catalog content itself now lives in its own seed file (`ai-track-seed.sql`) rather than inline in `schema.sql`, for the same reason `seed.sql` is separate: table design and content are different kinds of change, run at different times.

---

## 2. Feature: Course catalog

### 2.1 Course catalog storage — ✅ Built (differently than planned)
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
| `outcome` | "What you can do after" — shown in the List view's expanded row, and as the headline text on Mind map nodes |
| `priority` | `core` or `optional` — feeds the profile strip's "N of M core courses complete" |
| `expected_by_position` | `intern` / `junior` / `middle` / `senior` / `principal` — the seniority ladder a course belongs to; this is what tier-gating and the Mind map's columns are built on |
| `link` | Direct URL to the course |

No `course_id`-style stable business key exists — the primary key is a plain `uuid`, and seeding is idempotent on `(track_id, title)` instead.

**Quiz content — `course_quiz_questions`, one row per (course, question):** `position` (Q1, Q2, …), `question`, `options` (jsonb, `[{"label":"A","text":"..."}, ...]`), `correct_answer` (one of the option labels), `rationale`. Pure reference content — no per-learner state, no attempts table. The wrap-up quiz page (Section 4.9) ships every question's full answer and rationale to the client up front; checking an answer is a local comparison, not a request.

15 of the 20 catalog courses have a quiz (144 questions total), imported one-time from a course-framework spreadsheet, same seeding mechanism as the courses themselves. The 5 without one: **Skedulo AI Usage Policy** (its source quiz is open-ended, no multiple-choice options, so it doesn't fit this format) and **Claude for Work**, **DevRev Product Mastery**, **AI Foundations & Industry Applications**, **Custom assistants: Claude Projects / Gemini Gems** (no quiz content was ever sourced for these). "Introduction to subagents (applied)" reuses "Introduction to subagents"'s questions, since it's the same underlying course listed twice on the roadmap at different tiers.

**Acceptance criteria:**
- [x] AI Track has 20 real courses from the roadmap spreadsheet, every field filled in (originally 23 — 3 were later removed as not required for this track: Model Context Protocol — build servers, GitHub Copilot Fundamentals, and the LLM App Development Bootcamp)
- [x] 15 of those 20 courses have a full quiz (144 questions), covering everything except the 5 named above
- [ ] Core Competency track has any courses at all (currently zero — the track exists, but nothing has been seeded into it)
- [x] Seeding is idempotent (`on conflict (track_id, title) do nothing` / `on conflict (course_id, position) do nothing`), safe to re-run

### 2.2 Catalog sync (Sheets → DB) — ⬜ Not started
No Google Sheets integration exists. No sync button, no `last_synced_at`, no validation-and-report flow. Adding or changing a course today means writing and running a SQL migration by hand. This is a real gap if the catalog needs frequent, non-technical edits — flagged here rather than pretended-away.

---

## 3. Feature: Track enrollment (replaces "Competency Model Upload → Auto-Assigned Roadmap")

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

---

## 4. Feature: Your Journey (the learner's roadmap view)

Lives at `/learning-hub/journey`. Replaces the originally-planned "Learner Dashboard" section.

### 4.1 Empty states — ✅ Built
- Zero enrolled tracks: "Nothing here yet — enroll in a track from the Learning Hub to start your journey," profile strip shows only name + position (no track tags), progress shows **N/A** instead of a bar.
- Enrolled, but the selected track filter has no courses: "No courses in this track."

### 4.2 Profile strip — ✅ Built
- Avatar, name, a position badge (`user_role.position` — Intern/Junior/Mid level/Senior/Principal), and one tag per enrolled track (or just the selected one, if the dropdown isn't on "All tracks").
- Progress: **"N of M core courses complete"** + bar, `priority = 'core'` only, scoped to whatever the track dropdown currently shows.

### 4.3 Track filter — ✅ Built
A dropdown next to the "Your Journey" title: "All tracks" or one specific enrolled track. Filters both the List and Mind map views and the profile strip's progress count. Falls back to "All tracks" automatically if the selected track is un-enrolled out from under it (e.g. after a Reset).

### 4.4 Roadmap view — ✅ Built, two modes
- **List**: table (`#`, Course, Track, Platform, Est. hrs, Target, Status), ordered Intern → Principal then by the learner's own custom order within a tier (see 4.6), scrollable after ~7 rows with a pinned header. A row expands to show the course link, its "after this course" outcome, and a real **Wrap-up** link into that course's quiz (see 4.9).
- **Mind map**: one column per position tier that actually has courses in it, nodes rendered as an explicit chain (course 1 → 2 → 3) within a column via a dot/line rail, headline text is the course's `outcome` (not its title — hover for the real title via a native tooltip).

**Difference from the original plan:** the original Map view described per-course prerequisite arrows (course A requires specifically course B). That data doesn't exist — there's no `course_prerequisites` table, only the position ladder. What's built instead is a **tier gate**: a course is Locked until every course in the tier below it is `complete` or `skipped`, and the connector between columns names the tier requirement ("Requires all Intern courses") rather than a specific course.

### 4.5 Locking and Skip prerequisite — ✅ Built
- A course is **Locked** (Mind map only) until every course in the tier below it is `complete`/`skipped`. An empty or missing lower tier can't block anything.
- **Skip prerequisite** on a locked course: marks every course in the tier *below* it `skipped`, and every course in *its own* tier `not_started` — unlocking the whole tier at once, not just the clicked course. Confirms first, with the exact wording: *"Previous courses are required before "{title}". Skipping lets you move on now. The skip is recorded on your roadmap and visible to your manager."* (No manager view reads this yet — the data is recorded correctly, just nothing surfaces it to a manager today.)
- **Reset**: clears all `course_assignments` rows for the account, reverting everything to `not_started` — same effect as never having touched the journey.

### 4.6 Reordering — ✅ Built
Rows in the **List** view are drag-reorderable, persisted per-account (`course_assignments.position`) — a drop only lands on a row in the same position tier, so a course can never be dragged into a different stage. The Mind map view is read-only display of whatever order the query returns; there's only one place reordering happens.

### 4.7 Up next — 🚧 Partial (sidebar card)
Shows the next 2 courses that aren't complete/skipped: dated ones first (soonest `target_date`), then undated ones filling remaining slots in the roadmap's own order — a date is no longer required to appear here.

**Real, not placeholder:**
- The learner can set their own `target_date` on the courses shown here — a **pencil** icon reveals a date input per course (native picker, past dates greyed out via `min=today`), edits are staged locally and only sent to the server when the **green tick** confirms them. This is a genuine write to `course_assignments.target_date` — a suggestion, never an enforced deadline, editable anytime.
- The moment a course becomes the #1 pick, it **automatically flips from `not_started` to `in_progress`** — "this is the one you're on now" needs no click. Never reverts real progress (a guard skips the write if the course is already anything other than `not_started`).
- A **sync** icon next to the title re-fetches, in case editing elsewhere changed which courses qualify.

**Real, not placeholder:** the **Auto Schedule** icon (magic wand) opens a modal asking for a position range and a timeline, then books real Google Calendar events for every not-yet-done course in that range — see Section 8 for how. Empty state when nothing qualifies: *"Nothing left to plan — every course is complete or skipped."*

### 4.8 Knowledge artifacts — ✅ Built (sidebar card, different shape than planned)
Re-scoped from "NotebookLM-generated mind map/summary/exam" (Section 7, still not started) to something real and much simpler: **the learner's own wrap-up quiz results.**

- The 3 most recently completed courses, each showing `question count · time completed (relative) · first-try accuracy%` — e.g. "Claude 101 · 10 questions · 2 days ago · 90% accuracy." Sourced from `course_assignments.quiz_total_questions` / `quiz_correct_first_try`, a snapshot taken once at completion (Section 4.9), not a live join — so a course whose quiz changes later still shows what was actually answered.
- A course completed before this existed (or with no stats sent) shows honestly as "No quiz data recorded" rather than a fabricated number.
- One more row below those: the account's current `in_progress` course (if any), labelled "In progress — waiting on the wrap-up quiz for more information," with a direct link to that course's quiz.
- Empty state when nothing's complete and nothing's in progress: "Complete a course's wrap-up quiz to see your results here."
- **Not surfaced elsewhere:** Team view's read-only drill-down into a learner's roadmap (Section 5) doesn't show this card — an admin sees the roadmap table, not quiz stats, for someone else's account.

### 4.9 Wrap-up — ✅ Built
Lives at `/learning-hub/journey/[courseId]/quiz`. The **Wrap-up** link in a List-row's expanded panel opens it.

- One question per card, Trailhead/Salesforce-module style: click any option to check it against `course_quiz_questions.correct_answer`. Wrong just says "Incorrect — try another option" and stays clickable; right reveals the rationale and unlocks **Next question**. Every option stays clickable even after the right one's found — no locking, no attempt limit, matching how the quiz data itself was scoped (no attempts/answers table anywhere).
- Finishing the last question calls a real write: the course is marked `complete`, and how many questions were answered right on the *first* click (not any click after) is recorded as the accuracy snapshot Section 4.8 reads.
- A course with no quiz seeded (5 of the 20 — see Section 2.1) shows "No quiz for this course yet" instead of a dead end.
- Already-completed courses can be retaken freely; retaking just re-writes the same snapshot.

**Acceptance criteria:**
- [x] A learner with zero enrolled tracks sees the empty state, never a broken roadmap
- [x] Locked courses (Mind map) can't be worked around without Skip prerequisite
- [x] Skipped and not-started are visibly distinct from Complete/In progress
- [x] Reordering never crosses a stage boundary
- [x] Knowledge artifacts show real quiz results for completed courses, plus a nudge for what's in progress
- [x] Wrap-up is a real quiz that marks a course complete, not a placeholder button
- [x] Up next reflects a real scheduled plan *(Auto Schedule writes real `target_date`s from real Google Calendar events — Section 8)*

---

## 5. Feature: Team view (replaces "Manager Dashboard") — ✅ Built

Lives at `/learning-hub/team`.

**Access — a real decision, not the original plan:** this app has no manager/report hierarchy anywhere (no `manager_id`, no "my direct reports" concept). Rather than build one, Team view reuses `accounts.role = 'admin'` — the exact same gate as Dashboard/Manage/Activity. That means **any admin sees every enrolled learner org-wide**, not a personal "my team" view scoped to specific reports. If a real hierarchy is ever wanted, that's new schema (an admin UI to assign who manages whom) — not built, not planned.

**What's on the page, all computed from existing tables — no new schema:**
- **Stat cards**: Learners (count + breakdown by track combination), Average completion (pooled `core` course completion across everyone), In progress over 3 weeks ("stalled" — an `in_progress` course whose `course_assignments.updated_at` hasn't moved in 21+ days, with an example course + name).
- **Team progress table**: name, `user_role.position`, enrolled track(s), % core-course complete + bar, in-progress count, last activity (relative time from `updated_at`). Filterable by track, sortable by name or % complete.
- **Drill-down**: clicking a row opens that person's roadmap **read-only** — literally the same `JourneyTable` component the learner's own Journey page uses, given `readOnly` (disables drag-reorder) and `ownRoadmap={false}` (hides the Wrap-up link entirely, not just disables it — an admin can't jump into someone else's quiz from here).

**Deliberately not included:** the "Sync courses" / "Catalog last synced" control from early mockups — that's the Google Sheets pipeline in Section 2.2, never built and not planned. No unmatched-skills review either, since the upload/matching flow it would review (old Section 3) doesn't exist.

---

## 6. Feature: Course Planner & Progress Monitor (agent) — ⬜ Not started

No agent reads a roadmap and sequences it. The only ordering a learner has control over is the manual drag-reorder within a stage (4.6); there's no automatic re-planning, no target-date generation, and completion tracking is the plain `course_assignments.status` writes described above — not an agent-driven process.

---

## 7. Feature: Knowledge Builder (NotebookLM) — ⬜ Not started

No generation pipeline, no `mind_map_url`/`summary_url` fields, nothing triggered on course completion by an agent. This is still entirely unbuilt as originally scoped.

What exists instead, and predates any of this: `course_quiz_questions` (Section 2.1) is real quiz content, but it was written once by hand from a course-framework spreadsheet, not generated per-completion by NotebookLM or anything else. The "Knowledge artifacts" card (Section 4.8) reuses that same name from the original mockups, but shows the learner's own quiz results, not generated artifacts — there's no `exam_score` field or NotebookLM call anywhere in this path. If mind-map/summary generation gets built later, it's new work on top of this, not a continuation of it.

---

## 8. Feature: Scheduler & Reminders (agent) — 🚧 Partial (Auto Schedule is built; reminders are not)

Auto Schedule (4.7) is real: a learner picks a position range and a timeline, and it books actual Google Calendar events around their existing meetings. What it isn't: a reminder system — no `reminders_log`, no notification tied to an upcoming study block. That half of this section's original name is still unbuilt.

### 8.1 Why not n8n
Other automations in this app run through n8n (Slack notify, SLA checks — architecture decision #5). This doesn't: n8n here is a Skedulo-managed internal tunnel, not realistically requestable. Auto Schedule is plain Next.js API routes instead — `app/api/calendar/connect(/callback)` and `app/api/courses/auto-schedule` — same as the rest of this app's server-side logic.

### 8.2 Calendar access is authorization, not login
This app's own auth is unaffected (Google Sign-in restricted to `@skedulo.com` — `features/auth/google.js`, `PASSWORD_LOGIN` is off for normal users). Connecting Google Calendar is a separate, additional grant a signed-in learner makes from Up next's 🪄 button — not a login swap. The Auto Schedule modal drives it inline (no separate profile-settings section built for this).

### 8.3 The OAuth client — reuses sign-in's by default, but overridable
Google Sign-in already had a working `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, proven to work for `@skedulo.com` accounts in production. Auto Schedule defaults to reusing that **same** client rather than registering a new one — `features/learning/googleCalendar.js` requests `calendar.freebusy` + `calendar.events` in a second, separate consent step (`access_type=offline`, `prompt=consent`, so a refresh token comes back every time).

Adding a redirect URI to that client needs Editor/Owner rights on its Cloud project, though — access not everyone touching this repo has. So `GOOGLE_CALENDAR_CLIENT_ID`/`GOOGLE_CALENDAR_CLIENT_SECRET`, if set, override `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` for calendar access only (sign-in is untouched either way) — a personal Google Cloud project someone can stand up themselves (External + Testing consent screen, no one else's permission needed) to demo or test against, e.g. from a UAT deploy, without touching the shared client at all. See `.env.example` for the exact steps either way.

### 8.4 Where Claude fits — not yet
The calculation (`features/learning/scheduler.js`) is a plain freebusy-diff: courses are spread proportionally across the timeline, each placed in the first open weekday work-hours slot (learner's own `accounts.timezone`, default `Asia/Ho_Chi_Minh`), overlap-checked against both real Google busy blocks and every slot Auto Schedule itself just placed. No LLM call anywhere in this path — a Claude API call for preference-aware sequencing ("mornings only," multi-course spacing beyond simple proportional spread) is still a possible Phase 2, not started.

### 8.5 Real behavior, not a placeholder
- Learner picks From/To position (defaults to their own `user_role.position` on both ends) and a timeline (number + months/years).
- Each not-yet-done course in that range across their enrolled tracks gets one study-block event (`Study: {title}`), capped at 4 hours per block regardless of `est_hours` (one session per course, not a multi-day split — `capped: true` surfaces in the result when this kicks in).
- Writes land on the same `course_assignments.target_date` Up next's pencil-edit already writes, so results appear there immediately — plus `calendar_event_id`, so re-running Auto Schedule updates existing events instead of duplicating them (falls back to creating a new one if the learner deleted it on their own calendar).
- A revoked/expired Google connection (`invalid_grant`) drops the stored `calendar_connections` row automatically, so the next attempt correctly asks to reconnect rather than failing the same way silently.

**Acceptance criteria:**
- [x] Not-connected learners are prompted to connect Google Calendar inline, redirected back to the same modal on success
- [x] Auto Schedule never double-books a Google Calendar busy block it can see, or two of its own newly placed courses against each other
- [x] Re-running Auto Schedule updates previously created events rather than creating duplicates
- [ ] Reminders (a notification ahead of an upcoming study block) — not started
- [ ] Preference-aware scheduling via Claude (Phase 2) — not started

---

## 9. Data model (Neon Postgres — what actually exists)

All of these live in the same database as the rest of `vn-ai-ideas-hub`. Table design lives in `schema.sql` alone now — it's been split from content: the AI Track's actual courses and quiz questions are seeded separately, by `ai-track-seed.sql`, run once after `schema.sql` (same relationship as `seed.sql` to the Ideas Hub's own tables). `migrations/*.sql` are the additive deltas that got the schema here one step at a time; `schema.sql` always carries a full replay of all of them, so it's the one file to paste for either a fresh database or bringing an existing one current.

| Table | Purpose |
|---|---|
| `accounts` | Existing app-wide identity table (not learning-specific) — username, email, role, etc. |
| `user_role` | One seniority `position` per account: `intern` / `junior` / `middle` / `senior` / `principal` |
| `tracks` | Reference list of tracks (`AI Track`, `Core Competency`) |
| `account_tracks` | Many-to-many: which accounts are enrolled in which tracks |
| `courses` | The catalog — see Section 2.1 for columns |
| `course_assignments` | One row per (account, course): `status` (`not_started`/`in_progress`/`complete`/`skipped`), `target_date` (the learner's own suggested date, set from Up next's pencil-edit **or** by Auto Schedule — a suggestion, not an enforced deadline), `position` (the learner's own drag-reorder within a tier), `quiz_total_questions` / `quiz_correct_first_try` (a one-time snapshot written when the course is marked complete — see Section 4.9), `calendar_event_id` (the Google Calendar event Auto Schedule created for this course, if any — migration 027, Section 8) |
| `course_quiz_questions` | The wrap-up quiz's actual content — see Section 2.1 |
| `calendar_connections` | One row per account that's connected Google Calendar: an AES-256-GCM-encrypted refresh token (`lib/crypto.js`, `CALENDAR_TOKEN_KEY`) plus the scope actually granted — Section 8 |

**Not built, and not currently planned:** `courses_ref`, `assignments`, `progress`, `knowledge_artifacts` (the Knowledge artifacts *card* is real — Section 4.8 — but it reads `course_assignments`' own snapshot columns, not a dedicated table), `reminders_log` (Auto Schedule books events but sends no reminders — Section 8), `competency_uploads`, `skill_course_map`, `unmatched_skills`, `course_quiz_attempts`/`course_quiz_answers` (deliberately not built — no per-click or per-attempt history, just the one snapshot pair above), any `roadmap_status` column. If the upload/matching flow (old Section 3) gets built later, expect new tables — don't assume these old names are what they'll be called.

---

## 10. Explicitly out of scope (current phase)

- Sections 6–7 (Planner agent, Knowledge Builder) — unstarted, not merely deferred mid-build. Section 8 (Scheduler) is the exception: Auto Schedule itself is built; only reminders and Claude-driven preference-aware sequencing remain unstarted there
- A real manager/report hierarchy for Team view — it's org-wide (any admin, every learner) by deliberate choice, not scoped to "my direct reports"
- Competency-model file upload and skill-matching (old Section 3) — replaced by simple self-serve track enrollment; not being built toward
- Per-course prerequisite links (course A requires specifically course B) — only tier-level gating (all of tier N before tier N+1) is built; would need a new `course_prerequisites`-style table
- A Google Sheets catalog-sync workflow — catalog edits are SQL migrations for now
- Manager approval on joining a track, or per-role capacity limits
- NotebookLM-generated mind maps, summaries, or exams (Section 7) — the Wrap-up quiz and Knowledge artifacts card are both real now, but neither is this; see Section 7 for the distinction
- A per-click or per-attempt history for the wrap-up quiz — one snapshot (question count + first-try accuracy) is written once, at completion; nothing records individual answers or retries
- Reminders ahead of an Auto Schedule study block, and Claude-driven preference-aware sequencing (Section 8) — Auto Schedule itself is real; these two parts of the original Scheduler idea are not
