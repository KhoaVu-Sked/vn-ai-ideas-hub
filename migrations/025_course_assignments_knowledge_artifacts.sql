-- Migration 025 — course_assignments.wrap_up_url / exam_score
--
-- Minimal knowledge-artifact fields for the List view's expanded row
-- (Knowledge Artifacts: Wrap-up link + Passed X%). Deliberately NOT the
-- full mind_map_url/knowledge_artifacts table from the original AI
-- Learning requirements doc's "Knowledge Builder" feature — nothing
-- generates that content yet, and this ask explicitly excludes the mind
-- map artifact. Both columns stay null (and the UI block stays hidden)
-- until something actually writes them; nothing does yet.

alter table course_assignments add column if not exists wrap_up_url text;
alter table course_assignments add column if not exists exam_score integer;
