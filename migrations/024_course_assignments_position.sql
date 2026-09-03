-- Migration 024 — course_assignments.position
--
-- Lets a learner reorder the courses within one position tier (Intern,
-- Junior, ...) on their own Journey view. Per-account, not catalog-wide —
-- someone else's ordering of the same tier is untouched. Reordering a tier
-- writes position for every course in that tier at once, so once it's been
-- touched there's no partial-null mixing; before that, getJourney's
-- coalesce(ca.position, ...) falls back to the existing track/stage/
-- created_at ordering.

alter table course_assignments add column if not exists position integer;
