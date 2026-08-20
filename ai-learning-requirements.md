# AI Learning Platform — Requirements

**Status:** Draft for dev team
**Owner:** The Kiet
**Purpose:** A single project that runs three connected agents on top of role-based learning roadmaps (Junior → Principal, plus a separate AI Track), so team members get a personalized plan, materials that make each course stick, and a schedule that keeps them moving — all tracked on one dashboard.

---

## 1. Architecture overview

| Layer | Tool | Role |
|---|---|---|
| Course catalog (editorial content) | **Google Sheets** | Human-edited list of courses per skill/level; source of truth for what courses exist |
| Application data (users, assignments, progress) | **Neon DB** | Structured, queryable data the app and agents read/write |
| Web app / dashboards | **Vercel** (Next.js) | Hosts the Learner and Manager dashboards; hosts the catalog sync API route |
| Course Planner & Progress Monitor | **Claude** | Turns a roadmap into a sequenced plan; tracks completion |
| Knowledge Builder | **NotebookLM** | Generates mind map, summary, and exam per completed course |
| Scheduler & Reminders | **Claude + Google Calendar** | Places study time on the calendar; sends reminders |

**Why this split:** Google Sheets was chosen for the catalog because it's already proven (existing AI Track roadmap), needs no new tool, and is easy for non-technical people to bulk-edit. Notion Enterprise was considered but is currently org-blocked pending approval, and Notion Free carries a 1,000-block cap that risks breaking mid-pilot — so it's deferred, not ruled out permanently. n8n was considered for the catalog sync but dropped since it's internally public-facing and this team wants sync logic to live in the app's own codebase instead. Supabase + Vercel were chosen because they're free, pair naturally, and fit the relational/transactional needs of progress and assignment data.

---

## 2. Feature: Competency Model & Course Catalog (data foundation)

### 2.1 Course catalog storage
**What:** Every course suggestion, for every skill across every level (Junior→Principal) and the AI Track, lives in a Google Sheet — one file, multiple tabs (`Read Me`, `AI Roadmap`, `Competency Roadmap`, `Role Expectations`, `Progress Tracker`).

**Schema (per row):**

| Field | Notes |
|---|---|
| `course_id` | Stable unique key (e.g. `AI-L1-03`) — required so syncs match on ID, not title text |
| Level/Role | Junior / Mid / Senior / Principal |
| Competency/Skill | Which skill this course maps to (required for the Competency Roadmap tab; the AI Track tab is single-track so this can default to "AI") |
| Recommended Course / Resource | Title |
| Platform / Source | e.g. Udemy Business, Anthropic Academy |
| Audience | Who it applies to |
| Priority | Core vs. optional |
| Est. Hours | Feeds the Scheduler agent's calendar slotting |
| Cost | Free / paid |
| What you can do after | Applied outcome, shown in the dashboard's expanded course view |
| Expected by (role) | Target completion point tied to level |
| Link | Direct URL to the course |

**Acceptance criteria:**
- [ ] Every skill in the Confluence competency model (Junior→Principal) has ≥1 course row with all required fields filled in
- [ ] AI Track tab reviewed against the same field standard
- [ ] Every row has a unique `course_id`

### 2.2 Catalog sync (Sheets → Supabase)
**What:** A manual "Sync Courses" button on the Manager Dashboard triggers a Vercel API route that reads the Sheet via the Google Sheets API and upserts into Supabase's `courses_ref` table.

**Functional requirements:**
- Sync is manual (button-triggered), not scheduled — course edits are infrequent, so a cron job isn't justified yet
- Sync route lives in the app's own codebase (no third-party workflow tool)
- Upsert keyed on `course_id`, not row position or title text
- Validates each row (required fields present, hours is numeric, link is a valid URL); invalid rows are skipped and reported, not allowed to fail the whole sync
- Result is shown as a toast: counts of updated / added / skipped rows, plus reasons for any skipped rows
- `last_synced_at` timestamp is stored and displayed near the button

**Acceptance criteria:**
- [ ] Clicking "Sync Courses" updates `courses_ref` to match the current Sheet state
- [ ] Malformed rows are skipped with a visible reason, not silently dropped or fatal to the whole sync
- [ ] `last_synced_at` updates and displays correctly after a successful sync

---

## 3. Feature: Competency Model Upload → Auto-Assigned Roadmap

*(Full detail already captured in `requirements-competency-upload-roadmap.md` — summarized here for completeness; that document is the source of truth for this feature.)*

**What:** A learner with no roadmap yet uploads their competency model file (`.xlsx`). The system matches each skill/requirement in that file against a pre-existing, hard-coded skill→course mapping, and auto-generates the learner's roadmap from the matches.

**Key requirements:**
- Learners start in an `unassigned` roadmap state — no manually pre-seeded roadmap
- Upload accepts `.xlsx` only, must conform to a required template (see below)
- Matching is against a hard-coded `skill_course_map` table — not fuzzy/AI matching in v1
- Skills already marked `Qualified` in the uploaded file are assumed to skip course assignment (needs product confirmation before build)
- Unmatched skills don't block roadmap generation; they're logged and surfaced to managers for review
- A required standard upload template must be defined and enforced — the two sample files reviewed had incompatible structures, and supporting both would require significantly more parsing logic for no real benefit

**Data model additions:** `roadmap_status` on `users`; new tables `competency_uploads`, `skill_course_map`, `unmatched_skills`.

**Acceptance criteria:** see `requirements-competency-upload-roadmap.md` Section 10.

---

## 4. Feature: Learner Dashboard

**What:** A learner's personal view of their roadmap and progress.

### 4.1 Empty state (new)
- Shown when `roadmap_status = 'unassigned'`
- Prompts the upload flow described in Section 3
- Blocks access to the normal roadmap view until a roadmap exists

### 4.2 Header / identity strip
- Name, avatar, current level, track (AI Track / Core Competency / both)
- Overall progress: "X of Y core courses complete" with a progress bar

### 4.3 Roadmap view
- Two view modes: **List** (table) and **Map** (visual node graph showing course sequence and prerequisite links)
- List view columns: order, course title, platform, target date, status (`Complete` / `In progress` / `Not started` / `Skipped`)
- Map view: nodes positioned per sequence, edges colored by whether the prerequisite is satisfied
- **Prerequisites / locking:** a course is locked if its prerequisite(s) aren't yet Complete or Skipped; locked courses are visually distinct and show which course is blocking them
- **Skip flow:** if a learner wants to move past a locked prerequisite, a confirmation modal explains what's being skipped and records the skip — visible to their manager
- Clicking a course row/node expands it to show: link, "what you can do after" description, and (if complete) links to generated knowledge artifacts

### 4.4 Up next panel
- Shows the next 1–2 courses that are `In progress` or `Not started`, mirroring what the Scheduler agent would place on the calendar

### 4.5 Knowledge artifacts section
- For each completed course: mind map link, summary link, exam score (generated by NotebookLM)
- Toggleable via a `showArtifacts` setting

**Acceptance criteria:**
- [ ] A learner with `unassigned` status sees the empty state, never a broken/empty roadmap
- [ ] Locked courses cannot be marked complete without either satisfying the prerequisite or explicitly skipping it
- [ ] Skipped courses are visibly distinct from Complete/In progress/Not started
- [ ] Knowledge artifacts only appear for completed courses

---

## 5. Feature: Manager Dashboard

**What:** A roll-up view of the whole team's progress, with drill-down into any individual.

### 5.1 Team overview table
- One row per team member: name, level, track, % complete, courses in progress, last activity
- Learners with `unassigned` roadmap status show a "No roadmap yet" indicator instead of a % complete
- Filterable by track (All / AI Track / AI + Core / Core Competency); sortable by % complete (asc/desc) or name

### 5.2 Drill-down
- Clicking a team member's row opens their full roadmap table (read-only version of the Learner Dashboard's roadmap view)

### 5.3 Team summary stats
- Stat cards: total learners, how many on each track, and similar at-a-glance counts

### 5.4 Unmatched skills review
- Surfaces skills flagged during the competency-model-upload matching process (Section 3) that couldn't be matched to a course, so a manager/admin can add a mapping without requiring the learner to re-upload

### 5.5 Sync Courses control
- The "Sync Courses" button and `last_synced_at` display (Section 2.2) live here, visible only to managers/admins

**Acceptance criteria:**
- [ ] Manager can filter/sort the team table without a page reload
- [ ] Drilling into a team member shows their real roadmap data, read-only
- [ ] Unmatched skills are visible and actionable (can be resolved without a re-upload)

---

## 6. Feature: Course Planner & Progress Monitor (agent)

**What:** Takes a learner's assigned roadmap (from catalog matches) and turns it into an ordered, sequenced plan with rough timing; tracks completion as courses finish.

**Functional requirements:**
- Reads: matched courses (from the upload/matching flow), `courses_ref` (for hours/metadata), existing `assignments`
- Writes: `assignments` (sequence order, target start/end dates)
- Re-plans when: a course is marked complete out of order, a target date is missed, or a new course is added to a learner's plan
- Respects prerequisite relationships when sequencing (a course can't be sequenced before its prerequisite unless explicitly skipped)

**Acceptance criteria:**
- [ ] A freshly matched set of courses is turned into a sequenced `assignments` list with target dates
- [ ] Marking a course complete updates `progress` and is reflected on the dashboard without manual intervention
- [ ] A missed target date triggers a visible re-plan (exact re-plan behavior/thresholds to be defined in a follow-up spec)

---

## 7. Feature: Knowledge Builder (NotebookLM)

**What:** For each course a learner completes, generates a mind map, a concise summary, and a tailored exam.

**Functional requirements:**
- Triggered when a course's `progress.status` becomes `Complete`
- Inputs: the course's source materials (link/content from `courses_ref`)
- Outputs stored and linked back to the course: `mind_map_url`, `summary_url`, `exam_score`, `exam_completed_at` (in `knowledge_artifacts`)
- Dashboard reads these to populate the Knowledge Artifacts section (Section 4.5)

**Acceptance criteria:**
- [ ] Completing a course triggers generation without manual steps
- [ ] Generated artifacts are correctly linked to the specific user + course pair
- [ ] Exam score is captured and displayed on the dashboard

---

## 8. Feature: Scheduler & Reminders (agent)

**What:** Turns the sequenced plan into calendar time and sends reminders, so learning gets a real slot in the week.

**Functional requirements:**
- Reads: `assignments` (sequence, target dates, est. hours)
- Writes: Google Calendar events; `schedule_events` table (`calendar_event_id`, `scheduled_date`, `status`)
- Reminder logic: sends a reminder ahead of a scheduled session (exact timing/channel TBD)
- Handles missed sessions: flips `schedule_events.status` to `Missed` and signals the Planner agent to consider a re-plan

**Acceptance criteria:**
- [ ] A learner's sequenced plan results in real Google Calendar events
- [ ] Reminders fire ahead of scheduled sessions
- [ ] A missed session is detected and reflected in `schedule_events`, not silently ignored

---

## 9. Data model (Supabase — full reference)

| Table | Purpose |
|---|---|
| `users` | Identity, assigned level/track, `roadmap_status` |
| `courses_ref` | Cached mirror of the Sheet catalog (synced manually) |
| `assignments` | A learner's sequenced plan (Planner agent output) |
| `progress` | Per-course completion status per learner |
| `knowledge_artifacts` | NotebookLM outputs per completed course |
| `schedule_events` | Calendar events placed by the Scheduler agent |
| `reminders_log` | Reminder history, for tuning timing/effectiveness |
| `competency_uploads` | Record of each uploaded competency file |
| `skill_course_map` | Hard-coded skill → course mapping used for auto-assignment |
| `unmatched_skills` | Skills from an upload that couldn't be matched, pending review |

---

## 10. Explicitly out of scope (current phase)

- Fuzzy/AI-based skill-text matching (v1 is exact/normalized match only)
- Manual editing of an auto-generated roadmap after creation
- Re-uploading an updated competency model to refresh an existing roadmap
- File formats other than `.xlsx` for the competency model upload
- Scheduled (automatic) catalog sync — manual button only for now
- Migrating the course catalog off Google Sheets (revisit if agent write-back at scale becomes necessary, or if Notion Enterprise access is later approved)