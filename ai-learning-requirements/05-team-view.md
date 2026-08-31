# Feature: Team view (replaces "Manager Dashboard") — ✅ Built

Part of [ai-learning-requirements](00-overview.md) — read that first for the status-tag legend and how these files relate.

Lives at `/learning-hub/team`.

**Access — a real decision, not the original plan:** this app has no manager/report hierarchy anywhere (no `manager_id`, no "my direct reports" concept). Rather than build one, Team view reuses `accounts.role = 'admin'` — the exact same gate as Dashboard/Manage/Activity. That means **any admin sees every enrolled learner org-wide**, not a personal "my team" view scoped to specific reports. If a real hierarchy is ever wanted, that's new schema (an admin UI to assign who manages whom) — not built, not planned.

**What's on the page, all computed from existing tables — no new schema:**
- **Stat cards**: Learners (count + breakdown by track combination), Average completion (pooled `core` course completion across everyone), In progress over 3 weeks ("stalled" — an `in_progress` course whose `course_assignments.updated_at` hasn't moved in 21+ days, with an example course + name).
- **Team progress table**: name, `user_role.position`, enrolled track(s), % core-course complete + bar, in-progress count, last activity (relative time from `updated_at`). Filterable by track, sortable by name or % complete.
- **Drill-down**: clicking a row opens that person's roadmap **read-only** — literally the same `JourneyTable` component the learner's own Journey page uses ([03-your-journey.md](03-your-journey.md), 4.4), given `readOnly` (disables drag-reorder) and `ownRoadmap={false}` (hides the Wrap-up link entirely, not just disables it — an admin can't jump into someone else's quiz from here).
- **Annual review date editor** — in the Team progress card's header, next to the track/sort filters: a pill (`🗓 Annual review: Oct 13 ✎`) that expands into a native date picker on click. Saving PATCHes the same `app_settings.annual_review_date` row Auto Schedule's "Complete by" field defaults to ([07-scheduler-auto-schedule.md](07-scheduler-auto-schedule.md), 8.5/8.6) — the only cross-linked control in this app where an admin setting changes what every learner sees on their own page, live, with no redeploy.

**Deliberately not included:** the "Sync courses" / "Catalog last synced" control from early mockups — that's the Google Sheets pipeline in [01-course-catalog.md](01-course-catalog.md) (2.2), never built and not planned. No unmatched-skills review either, since the upload/matching flow it would review (old track-enrollment plan, [02-track-enrollment.md](02-track-enrollment.md)) doesn't exist.
