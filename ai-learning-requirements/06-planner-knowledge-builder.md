# Features: Course Planner & Progress Monitor, Knowledge Builder (agents) — ⬜ Not started

Part of [ai-learning-requirements](00-overview.md) — read that first for the status-tag legend and how these files relate.

Both agents from the original plan. Neither is built, and neither is close to built — kept in one short file since there's genuinely little to say about either yet.

## 6. Course Planner & Progress Monitor — ⬜ Not started

No agent reads a roadmap and sequences it. The only ordering a learner has control over is the manual drag-reorder within a stage ([03-your-journey.md](03-your-journey.md), 4.6); there's no automatic re-planning, no target-date generation, and completion tracking is the plain `course_assignments.status` writes described throughout [03-your-journey.md](03-your-journey.md) — not an agent-driven process.

## 7. Knowledge Builder (NotebookLM) — ⬜ Not started

No generation pipeline, no `mind_map_url`/`summary_url` fields, nothing triggered on course completion by an agent. This is still entirely unbuilt as originally scoped.

What exists instead, and predates any of this: `course_quiz_questions` ([01-course-catalog.md](01-course-catalog.md), 2.1) is real quiz content, but it was written once by hand from a course-framework spreadsheet, not generated per-completion by NotebookLM or anything else. The "Knowledge artifacts" card ([03-your-journey.md](03-your-journey.md), 4.8) reuses that same name from the original mockups, but shows the learner's own quiz results, not generated artifacts — there's no `exam_score` field or NotebookLM call anywhere in this path. If mind-map/summary generation gets built later, it's new work on top of this, not a continuation of it.
