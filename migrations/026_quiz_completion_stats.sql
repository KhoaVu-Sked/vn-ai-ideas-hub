-- Migration 026 -- quiz completion stats on course_assignments
--
-- Two columns, both a snapshot taken at the moment a course is marked
-- complete (not a live join against course_quiz_questions, which could
-- change later): quiz_total_questions is how many questions the quiz had,
-- quiz_correct_first_try is how many of those the learner got right on
-- their first click. Together they give accuracy (correct / total); "time
-- completed" is just course_assignments.updated_at, already there.
--
-- Deliberately NOT an attempts/answers table -- still no per-click history,
-- matching how the quiz itself was scoped. This is one aggregate pair
-- written once, at completion, not a growing log.
--
-- Both null for any course marked complete before this migration (or a
-- course with no quiz, which the front end doesn't let a learner complete
-- through the quiz flow at all) -- the Knowledge artifacts card shows those
-- honestly as "no quiz data" rather than a fake number.

alter table course_assignments add column if not exists quiz_total_questions integer;
alter table course_assignments add column if not exists quiz_correct_first_try integer;
