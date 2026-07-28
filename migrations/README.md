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
