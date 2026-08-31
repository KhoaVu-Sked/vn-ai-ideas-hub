# Feature: Learner Dashboard

Part of [ai-learning-requirements](00-overview.md) — read that first for the status-tag legend and how these files relate.

## 4.10 Learner Dashboard — ✅ Built (rebuilt this pass to follow a design mockup)
Lives at `/learning-hub/dashboard` (`features/learning/LearnerDashboardPage.jsx`). Originally built alongside pulling the Mind map out of Your Journey ([03-your-journey.md](03-your-journey.md), 4.4); since rebuilt again to follow a design mockup (`AI Learning dashboards.html`, repo root) rather than the plain stat-tiles layout described in earlier drafts of this doc. Still reuses the same `GET /api/journey` fetch Your Journey already makes — no new endpoint, no new table.

**KPI row** — four tiles:
- **Roadmap complete** — % of what's expected by now (the same `isExpectedByNow`/`effectivePosition` scoping Your Journey uses: courses at or below the learner's own tier, plus one stage of early access once that tier's done) that's actually `complete`.
- **Level** — current position, plus the next rung up (e.g. "Target: Middle · 2 stages left"), or "Top of the ladder" once at Principal.
- **Weekly streak** — see below.
- **Skills applied** — placeholder, "Coming soon · Phase 2": needs an idea↔course link that lives in the Ideas Hub's own schema, not this feature's.

**Learning card — "Progress by level"**: a **display-only** regrouping of the same 5-tier position ladder into 4 named levels — **Foundations** (Intern), **Applied** (Junior), **Intermediate** (Middle), **Advanced** (Senior *and* Principal, collapsed onto one shared bar). Computed client-side (`progressLevelForPosition`/`rolesForProgressLevel`/`PROGRESS_LEVEL_ORDER`/`PROGRESS_LEVEL_LABEL`, all in `features/learning/shared.js`) by re-bucketing `courses.expected_by_position` at read time — **no schema change**, no `progress_level` column or table anywhere in the database (see [08-data-model.md](08-data-model.md)). Every gating/locking/ordering rule everywhere else in this feature — the Mind map's columns, the List view's tier-gated drag-drop, Team view's roster, every SQL query in `queries.js` — still reads the raw 5-value ladder exactly as before; this chart is the only place the 4-level regrouping exists. Below the level bars, **"My courses"** reuses `JourneyTable` — the *exact same* List-view component from Your Journey ([03-your-journey.md](03-your-journey.md), 4.4), same columns, same drag-reorder, same Wrap-up link — not a second implementation of the same list.

**Weekly streak** (the KPI tile, and repeated as "Current streak" on the Consistency card below): `weeklyStreak()` (`shared.js`) counts consecutive Mon–Sun weeks — ending at the current week, or last week if this week hasn't landed one yet — with at least one course completed **through Auto Schedule**, scoped to `course_assignments.calendar_event_id` being set (Auto Schedule is the only thing in this app resembling a "session," so that's the signal, not every completion regardless of how it was scheduled). A learner who's never used Auto Schedule reads a plain 0, not a broken number. No live Google Calendar read: completion only ever lives in `course_assignments.status`, never on the calendar event itself, so `calendar_event_id` already carries the one bit a live fetch would add, without the token-refresh/revoked-access failure modes a live call brings. See [07-scheduler-auto-schedule.md](07-scheduler-auto-schedule.md) for Auto Schedule itself.

**Consistency card — "Learning activity"**: Courses completed, Hours logged (sum of `est_hours` on complete courses, all-time — not "this month": `course_assignments` keeps one `updated_at` per row, not a change history, so a monthly window isn't derivable), In progress, Current streak (same number as the Weekly streak KPI).

**Retention card — placeholder** ("Coming soon."): `courses.focus_area` turned out to be a per-course description, effectively 1:1 with the title, not a shared skill taxonomy multiple courses group under — nothing real to bucket a "confidence by skill" view by without inventing a new taxonomy.

**What's next card**: reuses Your Journey's own "upcoming" pick — dated soonest-first, then undated in roadmap order — for a "Finish course X" row (shown as its target date, not "from your calendar": a live calendar read is a separate lift not covered here, and `target_date` is real data either way), plus a second row surfacing the most recently completed course's own `outcome` copy as a "try this" nudge — no fabricated suggestions.

**Application · AI Ideas Hub card — placeholder** ("Coming soon · Phase 2 — needs an idea↔course link on the Ideas Hub side."): same blocker as Skills applied above — this repo has no `ideas`-to-`courses` relationship anywhere yet.

**Kept from the previous layout, moved below the sections above** (unaffected by any of the progress-level or KPI work):
- **Roadmap progress**: one completion bar per enrolled track (complete / total courses for that track, scoped by raw `isExpectedByNow`), always covering every enrolled track regardless of the Mind map's own filter below it.
- **Mind map**: the same tier-gated view described in Your Journey ([03-your-journey.md](03-your-journey.md), 4.4/4.5) — same columns-by-position-tier layout (still position-grouped, not level-grouped), same Locked/Skip-prerequisite behavior and confirm wording, same `features/learning/MindMap.jsx` component Your Journey's "See the Mind map →" link also points to. Has its own track-filter dropdown, separate from anything above it.

A nav link ("My Dashboard," in the app header, next to "Learning Hub") points here.

**Acceptance criteria:**
- [x] A learner with zero enrolled tracks sees the empty state, never a broken roadmap
- [x] Locked courses (Mind map) can't be worked around without Skip prerequisite
- [x] Skipped and not-started are visibly distinct from Complete/In progress
- [x] Reordering never crosses a stage boundary
- [x] Knowledge artifacts show real quiz results for completed courses, plus a nudge for what's in progress
- [x] Wrap-up is a real quiz that marks a course complete, not a placeholder button
- [x] Up next reflects a real scheduled plan *(Auto Schedule writes real `target_date`s from real Google Calendar events — [07-scheduler-auto-schedule.md](07-scheduler-auto-schedule.md))*
- [x] The Mind map and its Skip-prerequisite flow work identically on the Learner Dashboard as they did on Your Journey before the move
- [x] Roadmap complete / Level / Weekly streak (KPIs) and the Learning / Consistency / What's next cards show real, derived data — no fabricated numbers standing in for data that doesn't exist
- [ ] Skills applied (KPI) and the Application card — blocked on an idea↔course link (Ideas Hub side), Phase 2
- [ ] Retention "Confidence by skill" — blocked on a shared skill taxonomy that doesn't exist on `courses` yet
