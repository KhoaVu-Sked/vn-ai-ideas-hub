# AI Learning Platform — Requirements

**Status:** In progress — Learning Hub, Your Journey, and Team view are built and live in this repo; the agent layer (Planner, Knowledge Builder, Scheduler) is not.
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
| Course catalog | Lives directly in the `courses` table. The AI Track's 23 real courses were one-time imported from a spreadsheet via a migration — there is no live Google Sheets integration, no sync button, no editorial workflow for non-technical editors to add or change courses | ✅ Built (as data), ⬜ (as an editable catalog workflow) |
| Web app / dashboards | **Next.js on Vercel**, same deployment as the Ideas Hub. Three pages: `/learning-hub`, `/learning-hub/journey`, `/learning-hub/team` | ✅ Built |
| Course Planner & Progress Monitor | Would read a learner's roadmap and sequence it with target dates | ⬜ Not started — no agent, no automated sequencing. The only "order" that exists is course insertion order plus a learner's own manual drag-reorder within a stage |
| Knowledge Builder (NotebookLM) | Would generate a mind map, summary, and exam per completed course | ⬜ Not started — the "Knowledge artifacts" card exists on Your Journey but is intentionally empty; no schema, no generation |
| Scheduler & Reminders (Claude + Google Calendar) | Would place study time on a calendar and send reminders | 🚧 Partial — the learner can suggest their own `target_date` from Up next (real write, no agent behind it), and the top pick there auto-flips to `in_progress`; the **Auto Schedule** button itself, and any Google Calendar integration, are still placeholders |

**What changed from the original plan, and why:** the original architecture spread data across Google Sheets (catalog) and Supabase (progress), synced by a Vercel route. In practice, this got built as one Neon Postgres database shared with the existing Ideas Hub app — simpler to operate, and the catalog is small enough (23 courses today) that a one-time SQL import was faster to ship than building a Sheets-sync pipeline. That pipeline (Section 2.2) is not built and isn't currently planned; if the catalog grows past what's comfortable to edit via SQL migrations, that's the point to revisit it.

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

**Acceptance criteria:**
- [x] AI Track has all 23 real courses from the roadmap spreadsheet, every field filled in
- [ ] Core Competency track has any courses at all (currently zero — the track exists, but nothing has been seeded into it)
- [x] Seeding is idempotent (`on conflict (track_id, title) do nothing`), safe to re-run

### 2.2 Catalog sync (Sheets → DB) — ⬜ Not started
No Google Sheets integration exists. No sync button, no `last_synced_at`, no validation-and-report flow. Adding or changing a course today means writing and running a SQL migration by hand. This is a real gap if the catalog needs frequent, non-technical edits — flagged here rather than pretended-away.

---

## 3. Feature: Track enrollment (replaces "Competency Model Upload → Auto-Assigned Roadmap")

The original plan (auto-generate a roadmap from an uploaded `.xlsx` competency model, matched against a hard-coded `skill_course_map`) was never built, and nothing here builds toward it. What replaced it is much simpler:

**What's built — ✅:**
- A learner browses all tracks on `/learning-hub` ("Suggested tracks" — every track, with a course count and whether they're already enrolled).
- Clicking a track opens a preview of its full roadmap (courses grouped by `stage`).
- An **Enroll** / **Enrolled ✓** toggle button self-assigns the learner to that track (`account_tracks`, many-to-many — a learner can enroll in more than one track). No manager approval step exists; it's fully self-serve.
- Enrolled tracks show as their own cards under "Your tracks," with an "Enrolled" badge.

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
- **List**: table (`#`, Course, Track, Platform, Est. hrs, Target, Status), ordered Intern → Principal then by the learner's own custom order within a tier (see 4.6), scrollable after ~7 rows with a pinned header. A row expands to show the course link, its "after this course" outcome, and a placeholder **Wrap-up** button (see 4.7).
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

**Still a placeholder:** the **Auto Schedule** icon (magic wand) — no agent, no logic, nothing happens on click. Empty state when nothing qualifies: *"Nothing left to plan — every course is complete or skipped."*

### 4.8 Knowledge artifacts — 🚧 Partial (sidebar card)
Header ("Knowledge artifacts" / "Generated by NotebookLM on completion") with **no list underneath** — deliberately. No knowledge-artifact data exists anywhere in this schema; nothing is faked here to look more finished than it is.

### 4.9 Wrap-up — 🚧 Partial
A **Wrap-up** button in each List-row's expanded panel. No questionnaire, no results, no data model yet — it's a placeholder until the wrap-up questionnaire itself is designed.

**Acceptance criteria:**
- [x] A learner with zero enrolled tracks sees the empty state, never a broken roadmap
- [x] Locked courses (Mind map) can't be worked around without Skip prerequisite
- [x] Skipped and not-started are visibly distinct from Complete/In progress
- [x] Reordering never crosses a stage boundary
- [ ] Knowledge artifacts appear for completed courses *(no artifacts exist to appear — not started)*
- [ ] Up next reflects a real scheduled plan *(shows the empty-state message for everyone — not started)*

---

## 5. Feature: Team view (replaces "Manager Dashboard") — ✅ Built

Lives at `/learning-hub/team`.

**Access — a real decision, not the original plan:** this app has no manager/report hierarchy anywhere (no `manager_id`, no "my direct reports" concept). Rather than build one, Team view reuses `accounts.role = 'admin'` — the exact same gate as Dashboard/Manage/Activity. That means **any admin sees every enrolled learner org-wide**, not a personal "my team" view scoped to specific reports. If a real hierarchy is ever wanted, that's new schema (an admin UI to assign who manages whom) — not built, not planned.

**What's on the page, all computed from existing tables — no new schema:**
- **Stat cards**: Learners (count + breakdown by track combination), Average completion (pooled `core` course completion across everyone), In progress over 3 weeks ("stalled" — an `in_progress` course whose `course_assignments.updated_at` hasn't moved in 21+ days, with an example course + name).
- **Team progress table**: name, `user_role.position`, enrolled track(s), % core-course complete + bar, in-progress count, last activity (relative time from `updated_at`). Filterable by track, sortable by name or % complete.
- **Drill-down**: clicking a row opens that person's roadmap **read-only** — literally the same `JourneyTable` component the learner's own Journey page uses, with drag-reorder and the Wrap-up button both disabled via a `readOnly` prop.

**Deliberately not included:** the "Sync courses" / "Catalog last synced" control from early mockups — that's the Google Sheets pipeline in Section 2.2, never built and not planned. No unmatched-skills review either, since the upload/matching flow it would review (old Section 3) doesn't exist.

---

## 6. Feature: Course Planner & Progress Monitor (agent) — ⬜ Not started

No agent reads a roadmap and sequences it. The only ordering a learner has control over is the manual drag-reorder within a stage (4.6); there's no automatic re-planning, no target-date generation, and completion tracking is the plain `course_assignments.status` writes described above — not an agent-driven process.

---

## 7. Feature: Knowledge Builder (NotebookLM) — ⬜ Not started

No generation pipeline, no `mind_map_url`/`summary_url`/`exam_score` fields, nothing triggered on course completion. The Knowledge artifacts card (4.8) is the only trace of this feature in the product today, and it's intentionally empty.

---

## 8. Feature: Scheduler & Reminders (agent) — ⬜ Not started

No Google Calendar integration, no reminder logic, no `schedule_events`/`reminders_log` tables. The Up next card and its Auto Schedule button (4.7) are the only UI for this feature; neither does anything yet.

---

## 9. Data model (Neon Postgres — what actually exists)

All of these live in the same database as the rest of `vn-ai-ideas-hub` (see `schema.sql`), not a separate Supabase project.

| Table | Purpose |
|---|---|
| `accounts` | Existing app-wide identity table (not learning-specific) — username, email, role, etc. |
| `user_role` | One seniority `position` per account: `intern` / `junior` / `middle` / `senior` / `principal` |
| `tracks` | Reference list of tracks (`AI Track`, `Core Competency`) |
| `account_tracks` | Many-to-many: which accounts are enrolled in which tracks |
| `courses` | The catalog — see Section 2.1 for columns |
| `course_assignments` | One row per (account, course): `status` (`not_started`/`in_progress`/`complete`/`skipped`), `target_date` (the learner's own suggested date, set from Up next — a suggestion, not an enforced deadline), `position` (the learner's own drag-reorder within a tier) |

**Not built, and not currently planned:** `courses_ref`, `assignments`, `progress`, `knowledge_artifacts`, `schedule_events`, `reminders_log`, `competency_uploads`, `skill_course_map`, `unmatched_skills`, any `roadmap_status` column. If the upload/matching flow (old Section 3) or the agent layer (Sections 6–8) get built later, expect new tables — don't assume these old names are what they'll be called.

---

## 10. Explicitly out of scope (current phase)

- Anything under Sections 6–8 (Planner agent, Knowledge Builder, Scheduler agent) — all unstarted, not merely deferred mid-build
- A real manager/report hierarchy for Team view — it's org-wide (any admin, every learner) by deliberate choice, not scoped to "my direct reports"
- Competency-model file upload and skill-matching (old Section 3) — replaced by simple self-serve track enrollment; not being built toward
- Per-course prerequisite links (course A requires specifically course B) — only tier-level gating (all of tier N before tier N+1) is built; would need a new `course_prerequisites`-style table
- A Google Sheets catalog-sync workflow — catalog edits are SQL migrations for now
- Manager approval on joining a track, or per-role capacity limits
- Real content behind Wrap-up and Knowledge artifacts — both still placeholder UI with no backing data or logic. Up next is a partial exception: target-date suggestion and auto-start-in-progress are real writes; only the Auto Schedule button itself is still a placeholder
- The Wrap-up flow's actual design (what it captures, how it marks a course complete) — discussed but deliberately paused, not decided; see the open discussion in this repo's session history rather than assuming a shape here
