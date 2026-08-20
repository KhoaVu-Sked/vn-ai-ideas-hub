# Migrations

Small, **safe, additive** SQL deltas to run on the **live** Neon database — one file per change, in order. Run each new file once in the Neon SQL editor.

These never delete data (no `DELETE` / `TRUNCATE` / `DROP` of your rows) and are idempotent (safe to re-run).

## The three SQL files — what to run when

| File | Purpose | Safe on a DB with data? |
|---|---|---|
| `migrations/NNN_*.sql` | Incremental change for one batch | ✅ Yes — run these on the live DB |
| `../schema.sql` | Full schema for a **fresh** database | ✅ Yes (idempotent) but you only need it once |
| `../seed.sql` | Sample/demo data | ❌ **No — it `TRUNCATE`s ideas.** Only ever on an empty DB |

**Do not run `seed.sql` (or any file that includes it) once you have real data.**

## Log
- `001_tag_color.sql` — add `tags.color` for admin-editable tag colours.
- `002_feedback.sql` — add the `feedback` table for the feedback widget.
- `003_form_fields.sql` — add `form_fields` + `ideas.extra` for the admin form builder.
- `004_idea_deletion.sql` — add `ideas.delete_requested/reason/by` for delete requests.
- `005_merge_lead_roles.sql` — merge the two lead roles into `Initiator / Project Lead`.
- `006_roles_array_timeframes.sql` — multiple roles per member + admin-managed time frames.
- `007_audit_log.sql` — audit log with 14-day retention.
- `008_password_reset.sql` — OTP codes for the forgot-password flow.
- `009_signup_codes.sql` — OTP codes for email verification at sign-up.
- `010_profiles.sql` — profile fields (avatar, colour, region, timezone) + `requests.updated_at`.
- `011_tasks_comments.sql` — requests become Task-board cards (title, assignee, dates, position, seq); new `comments` table for discussion.
- `020_user_role_position.sql` — add `user_role` table: one seniority `position` per account, for the AI Learning roadmap work.
- `021_fix_position_values.sql` — correct `user_role.position` to intern/junior/middle/senior/principal (020 shipped `manager` by mistake).
- `022_learning_tracks_courses.sql` — add `tracks`, `account_tracks`, `courses`, `course_assignments` for the AI Learning roadmap work.
- `023_fix_courses_ai_track_seed.sql` — fix for UAT: adds `courses.stage/cost/outcome` (022 shipped without them) and seeds the AI Track's 23 real courses from the roadmap spreadsheet.
