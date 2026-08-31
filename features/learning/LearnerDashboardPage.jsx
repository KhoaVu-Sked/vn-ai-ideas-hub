"use client";

// Learner Dashboard — rebuilt to follow the "AI Learning dashboards" mockup
// (repo root, member/"My Progress" view). Wired to real data: the KPI row's
// Roadmap complete/Level/Weekly streak, the Learning card (progress-by-level
// bars + My courses), and the Consistency + Retention + What's next side
// cards.
//
// Retention "Confidence by skill" (skillConfidence, shared.js) reads
// courses.skills — a shared tag array (migration 028, seeded by
// ai-track-seed.sql) that's deliberately coarser than courses.focus_area
// (a per-course description, ~1:1 with the title, and not what this reads).
// Each skill's meter averages courseStrength (shared.js) across whichever of
// that skill's courses the learner has actually started — quiz accuracy
// where one exists, full credit for a complete course with no quiz, half
// credit for in_progress, and not-started/skipped courses excluded rather
// than dragging the average toward 0.
//
// Skills applied (KPI) and the full-width Application card stay placeholders
// for a different reason: both need an idea<->course link, which lives in
// the Ideas Hub's schema (the `ideas` table), not this feature's — left
// alone on purpose, see the chat for why.
//
// Weekly streak (weeklyStreak, shared.js) is scoped to courses actually
// booked through Auto Schedule (calendar_event_id set) — Auto Schedule is
// the only place this app has anything resembling a "session," so that's
// the signal, not every completion regardless of how it was scheduled. No
// live Google Calendar read: completion only ever lives in
// course_assignments.status, never in the calendar event itself, so
// calendar_event_id already carries the one bit a live fetch would add
// ("was this actually booked") without the token-refresh/revoked-access
// failure modes a live call brings.
//
// The mockup's own "My Progress / Team View" toggle is dropped here — this
// app already separates those as two nav links in AppHeader ("My Dashboard"
// vs "Team"), so an in-page tab would just duplicate that.
//
// The pre-existing Mind map (with its skip-a-tier action) isn't part of the
// mockup either, but stays below the new layout rather than being dropped —
// kept at the user's request. The per-track "Roadmap progress" section that
// used to sit above it was dropped later (removed, not part of the mockup
// to begin with — see TrackProgressRow's git history if it's ever wanted
// back).

import { useCallback, useEffect, useState } from "react";
import AppHeader from "@/components/AppHeader";
import Loading from "@/components/Loading";
import { useSession } from "@/features/auth/SessionProvider";
import { api } from "@/lib/apiClient";
import useRevalidateOnFocus from "@/lib/useRevalidateOnFocus";
import {
  card, eyebrow, errBanner, POSITION_LABEL, POSITION_ORDER, isExpectedByNow, effectivePosition, fmtDate,
  PROGRESS_LEVEL_ORDER, PROGRESS_LEVEL_LABEL, progressLevelForPosition, rolesForProgressLevel, weeklyStreak,
  skillConfidence, SKILL_CONFIDENCE_SCALE,
} from "@/features/learning/shared";
import ProgressBar from "@/features/learning/ProgressBar";
import { JourneyMindMap, SkipConfirmModal } from "@/features/learning/MindMap";
import { JourneyTable } from "@/features/learning/JourneyPage";

const cardTitle = { fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 14, margin: "0 0 2px", color: "var(--ink)" };
const cardCaption = { fontSize: 12, color: "var(--muted)", margin: "0 0 14px" };

// ── New (mockup-driven) pieces below ────────────────────────────────────

// Top KPI row — same 4 tiles the mockup shows. `accent` gives the last tile
// the mockup's dark navy treatment. Wired tiles pass `value`/`hint`; the
// ones with no honest data behind them yet (Weekly streak, Skills applied —
// see the file header comment) omit both and fall back to a dash +
// "Coming soon" rather than a fabricated number.
function KpiHolder({ label, value, hint, accent }) {
  return (
    <div style={{
      ...card, flex: "1 1 220px", padding: "16px 18px",
      ...(accent ? { background: "var(--navy)", borderColor: "var(--navy)" } : {}),
    }}>
      <div style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 11.5, letterSpacing: 0.6, textTransform: "uppercase", color: accent ? "#8fa6c2" : "var(--muted)" }}>{label}</div>
      <div style={{ fontFamily: "var(--font-sora)", fontWeight: 800, fontSize: 30, letterSpacing: -0.3, margin: "6px 0 2px", color: accent ? "#fff" : "var(--ink)" }}>{value ?? "—"}</div>
      <div style={{ fontSize: 12, color: accent ? "#b9c6d8" : "var(--muted)" }}>{hint || "Coming soon"}</div>
    </div>
  );
}

// A card whose chrome (kicker/title/caption) matches the mockup but whose
// body isn't wired up to real data yet — Retention and the Ideas Hub
// application card use this (see the file header comment for why). `note`
// defaults to a plain "Coming soon." (Retention — no skill taxonomy exists
// yet); the Application card passes its own "Phase 2" wording since that one
// needs a cross-feature change (an idea<->course link in the Ideas Hub's own
// schema), not just more time on this feature.
function PlaceholderCard({ kicker, title, caption, note = "Coming soon.", style }) {
  return (
    <div style={{ ...card, ...style }}>
      <p style={eyebrow}>{kicker}</p>
      <h2 style={cardTitle}>{title}</h2>
      {caption && <p style={cardCaption}>{caption}</p>}
      <div style={{ fontSize: 12.5, color: "var(--muted)", padding: caption ? "2px 0 0" : "0" }}>{note}</div>
    </div>
  );
}

// A label/value row — mockup's ".mini" rows (Consistency).
function MiniRow({ k, v }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "8px 0", borderTop: "1px solid var(--line)" }}>
      <span style={{ fontSize: 12.5, color: "var(--muted)" }}>{k}</span>
      <span style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 14, color: "var(--ink)" }}>{v}</span>
    </div>
  );
}

// The mockup's ".conf" dot meter (Retention card) — SKILL_CONFIDENCE_SCALE
// small segments, filled left-to-right up to `dots`. Deliberately its own
// shape rather than ProgressBar: ProgressBar's continuous fill already means
// "% of a checklist done" everywhere else on this page (Roadmap, Progress by
// level); a discrete meter reads as the different thing confidence actually
// is — a graded signal, not a completion count. --blue/--line are the same
// two tokens ProgressBar itself uses, so it stays visually part of the same
// page rather than introducing a new color for "filled."
function ConfidenceMeter({ dots }) {
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {Array.from({ length: SKILL_CONFIDENCE_SCALE }, (_, i) => (
        <span key={i} style={{ width: 14, height: 8, borderRadius: 2, background: i < dots ? "var(--blue)" : "var(--line)" }} />
      ))}
    </div>
  );
}

// A skill name + its confidence meter — Retention card's own row shape
// (label left, meter right), distinct from MiniRow (label + text value)
// even though both share the same border-top/padding rhythm.
function SkillRow({ skill, dots }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderTop: "1px solid var(--line)" }}>
      <span style={{ fontSize: 12.5, color: "var(--muted)" }}>{skill}</span>
      <ConfidenceMeter dots={dots} />
    </div>
  );
}

// An icon + title + description row — mockup's ".nextrow" (What's next).
function NextRow({ icon, title, detail }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 0", borderTop: "1px solid var(--line)" }}>
      <div style={{ width: 30, height: 30, borderRadius: 8, background: "var(--bg)", flex: "none", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>{icon}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{title}</div>
        <div style={{ fontSize: 12, color: "var(--muted)" }}>{detail}</div>
      </div>
    </div>
  );
}

// One row of the "Progress by level" breakdown — completion for a whole
// progress level (Foundations/Applied/Intermediate/Advanced) across every
// enrolled track (not scoped to isExpectedByNow, unlike the stat
// tiles/Roadmap-by-track section below: the point of this view is to show
// the full roadmap, stages ahead of the learner included, most of them just
// sitting at 0% until they get there). `roleLabel` names the role(s) that
// map to this level (progressLevelForPosition/rolesForProgressLevel,
// shared.js) — the visible form of that mapping, not just an internal one.
function LevelRow({ label, roleLabel, complete, total, current }) {
  const pct = total ? Math.round((complete / total) * 100) : 0;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "120px 1fr 44px", alignItems: "center", gap: 12, margin: "11px 0" }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>
          {label}{current && <span style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 700, color: "var(--blue)" }}>· you</span>}
        </div>
        {roleLabel && <div style={{ fontSize: 10.5, color: "var(--muted)" }}>{roleLabel}</div>}
      </div>
      <ProgressBar pct={pct} height={10} />
      <div style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 12.5, textAlign: "right", color: "var(--muted)" }}>{pct}%</div>
    </div>
  );
}

export default function LearnerDashboardPage() {
  const { user: me } = useSession();
  const [journey, setJourney] = useState([]);
  const [position, setPosition] = useState(null);
  const [recentCompletions, setRecentCompletions] = useState([]);
  const [err, setErr] = useState("");
  const [ready, setReady] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState("all");
  const [skipTarget, setSkipTarget] = useState(null);
  const [skipping, setSkipping] = useState(false);
  const [skipErr, setSkipErr] = useState("");

  const load = useCallback(async () => {
    setErr("");
    try {
      const { courses, position: pos, recentCompletions: completions } = await api("/api/journey");
      setJourney(courses);
      setPosition(pos);
      setRecentCompletions(completions || []);
    } catch (e) { setErr(e.message); } finally { setReady(true); }
  }, []);

  useEffect(() => { if (me) load(); }, [me, load]);
  useRevalidateOnFocus(() => { if (me) load(); });

  // Derived straight from the journey data already on hand — no extra fetch,
  // same pattern JourneyPage uses for its own track filter.
  const trackOptions = Array.from(new Map(journey.map((c) => [c.track_id, c.track_name])).entries())
    .map(([id, name]) => ({ id, name }));
  useEffect(() => {
    if (selectedTrack !== "all" && !trackOptions.some((t) => t.id === selectedTrack)) setSelectedTrack("all");
  }, [journey]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredJourney = selectedTrack === "all" ? journey : journey.filter((c) => c.track_id === selectedTrack);

  // "Progress by level" — completion per progress level (not raw role;
  // see PROGRESS_LEVEL_ORDER, shared.js) across every enrolled track,
  // unscoped by isExpectedByNow on purpose (see LevelRow). A course's level
  // is derived from its existing expected_by_position via
  // progressLevelForPosition — no new course field, no change to gating.
  const myLevel = progressLevelForPosition(position);
  const perLevel = PROGRESS_LEVEL_ORDER.map((level) => {
    const courses = journey.filter((c) => progressLevelForPosition(c.expected_by_position) === level);
    const roles = rolesForProgressLevel(level).map((p) => POSITION_LABEL[p] || p);
    return { level, label: PROGRESS_LEVEL_LABEL[level], roleLabel: roles.join(" & "), total: courses.length, complete: courses.filter((c) => c.status === "complete").length };
  }).filter((l) => l.total > 0);

  // "My courses" reuses Your Journey's own list (JourneyTable) as-is, so it
  // behaves and scopes identically: what's expected by now (own tier, or one
  // stage of early access once that tier's fully done — effectivePosition/
  // isExpectedByNow, shared.js), across every enrolled track. Not the Mind
  // map's own track filter below.
  const visiblePosition = effectivePosition(journey, position);
  const visibleJourney = journey.filter((c) => isExpectedByNow(c, visiblePosition));

  // KPI: "Roadmap complete" — % of what's expected by now (same scope as
  // My courses above) that's actually done. No "+X% this month" trend, on
  // purpose — that would need a snapshot history we don't keep, and a
  // fabricated delta would be worse than none.
  const roadmapComplete = visibleJourney.filter((c) => c.status === "complete").length;
  const roadmapPct = visibleJourney.length ? Math.round((roadmapComplete / visibleJourney.length) * 100) : 0;

  // Consistency card — all-time, not "this month": course_assignments only
  // keeps ONE updated_at per row (the latest change), not a change log, so
  // "completed this month" can't be told apart from "completed 3 months ago,
  // untouched since" — a monthly window isn't derivable from it. Scoped to
  // the FULL journey, not visibleJourney — a completion earned via early
  // access still counts as hours actually put in. No "sessions" row here —
  // Auto Schedule is the closest thing to a "session" this app has, and
  // that's what Weekly streak (below) already covers.
  const completeCourses = journey.filter((c) => c.status === "complete");
  const hoursLogged = completeCourses.reduce((sum, c) => sum + (Number(c.est_hours) || 0), 0);
  const inProgressCount = journey.filter((c) => c.status === "in_progress").length;

  // KPI + Consistency's "Weekly streak" (weeklyStreak, shared.js) — see the
  // file header comment for what this does and doesn't count.
  const streak = weeklyStreak(journey);

  // Retention card — "Confidence by skill" (skillConfidence, shared.js) plus
  // its own "Avg exam score" footer row: the same first-try-accuracy ratio
  // skillConfidence uses per course, just averaged across every completed,
  // quiz-graded course instead of grouped by skill — the card's own overall
  // number, same all-time scope as Consistency next to it (see that card's
  // own comment for why "this month" isn't derivable).
  const skillRows = skillConfidence(journey);
  const examScored = completeCourses.filter((c) => c.quiz_total_questions);
  const avgExamScore = examScored.length
    ? Math.round((examScored.reduce((sum, c) => sum + c.quiz_correct_first_try / c.quiz_total_questions, 0) / examScored.length) * 100)
    : null;

  // What's next — same "upcoming" pick as Your Journey's Up next card (dated
  // soonest-first, then undated filling the roadmap's own order), just the
  // top one rather than 2. Its target_date is shown plainly as "Target", not
  // "from your calendar" — a live calendar read would need its own API call
  // (see googleCalendar.js) beyond what this pass covers, and target_date is
  // real, already-fetched data either way, calendar-booked or not.
  const eligibleNext = visibleJourney.filter((c) => c.status !== "complete" && c.status !== "skipped");
  const datedNext = eligibleNext.filter((c) => c.target_date).sort((a, b) => new Date(a.target_date) - new Date(b.target_date));
  const undatedNext = eligibleNext.filter((c) => !c.target_date);
  const nextCourse = datedNext[0] || undatedNext[0] || null;

  // The most recently completed course's own "outcome" copy — already
  // written per-course (courses.outcome, e.g. "Use Claude for writing,
  // summarizing..."), reused as-is rather than fabricating a suggestion.
  const lastCompletion = recentCompletions[0];
  const lastCompletionCourse = lastCompletion ? journey.find((c) => c.id === lastCompletion.id) : null;

  // KPI: "Level" — current role, plus the next rung up (POSITION_ORDER,
  // shared.js). Already at the top of the ladder: say so instead of
  // showing an empty "Target: — · 0 levels left".
  const posIdx = position ? POSITION_ORDER.indexOf(position) : -1;
  const nextPosition = posIdx >= 0 ? POSITION_ORDER[posIdx + 1] : null;
  const levelHint = !position
    ? "Not yet assigned"
    : nextPosition
      ? `Target: ${POSITION_LABEL[nextPosition] || nextPosition} · ${POSITION_ORDER.length - 1 - posIdx} stage${POSITION_ORDER.length - 1 - posIdx === 1 ? "" : "s"} left`
      : "Top of the ladder";

  // JourneyTable already reorders itself locally for instant feedback (same
  // component Your Journey uses); this just persists it. No reload — see
  // JourneyPage's own reorderStage for why.
  const reorderCourses = (tierPosition, courseIds) => {
    api("/api/journey/reorder", { method: "POST", body: JSON.stringify({ position: tierPosition, courseIds }) })
      .catch((e) => setErr(e.message));
  };

  // Same skip-a-tier action the Mind map has always had — moved here with it.
  const confirmSkip = async () => {
    setSkipping(true);
    setSkipErr("");
    try {
      await api(`/api/courses/${skipTarget.id}/skip`, { method: "POST" });
      await load();
      setSkipTarget(null);
    } catch (e) {
      setSkipErr(e.message);
    } finally {
      setSkipping(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", paddingBottom: 40 }}>
      <AppHeader crumb="My Dashboard" />
      <main style={{ maxWidth: 1080, margin: "0 auto", padding: "24px 22px 0" }}>
        {me === undefined || (me && !ready) ? (
          <Loading label="Loading your dashboard" />
        ) : (
          <>
            {err && <div style={{ ...errBanner, marginBottom: 14 }}>{err}</div>}

            {journey.length === 0 ? (
              <div style={card}>
                <div style={{ fontSize: 13, color: "var(--muted)" }}>Nothing here yet — enroll in a track from the Learning Hub to see your progress.</div>
              </div>
            ) : (
              <>
                {/* ── KPI row — Roadmap complete/Level/Weekly streak wired to
                    real data; Skills applied needs an idea↔course link
                    (Ideas Hub), so it stays a placeholder — see the file
                    header comment. ── */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 16 }}>
                  <KpiHolder label="Roadmap complete" value={`${roadmapPct}%`} hint={`${roadmapComplete} of ${visibleJourney.length}${visiblePosition ? ` · through ${POSITION_LABEL[visiblePosition] || visiblePosition}` : ""}`} />
                  <KpiHolder label="Level" value={POSITION_LABEL[position] || "—"} hint={levelHint} />
                  <KpiHolder label="Weekly streak" value={`${streak} wk${streak === 1 ? "" : "s"}`} hint="From Auto Schedule sessions" />
                  <KpiHolder label="Skills applied" hint="Coming soon · Phase 2" accent />
                </div>

                {/* ── Learning + side column ── */}
                <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 14, marginBottom: 16 }}>
                  <section style={card}>
                    <p style={eyebrow}>Learning</p>
                    <h2 style={{ ...cardTitle, fontSize: 16 }}>Progress by level</h2>
                    <p style={cardCaption}>Completion by roadmap stage, across every track you're enrolled in.</p>
                    <div>
                      {perLevel.map((l) => (
                        <LevelRow key={l.level} label={l.label} roleLabel={l.roleLabel} complete={l.complete} total={l.total} current={l.level === myLevel} />
                      ))}
                    </div>

                    <h2 style={{ ...cardTitle, fontSize: 16, marginTop: 20 }}>My courses</h2>
                    <p style={cardCaption}>Same list as Your Journey — drag a row to reorder it within its stage.</p>
                    {visibleJourney.length === 0 ? (
                      <div style={{ fontSize: 13, color: "var(--muted)" }}>Nothing expected yet for your stage.</div>
                    ) : (
                      <JourneyTable courses={visibleJourney} onReorder={reorderCourses} />
                    )}
                  </section>

                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    <div style={card}>
                      <p style={eyebrow}>Consistency</p>
                      <h2 style={cardTitle}>Learning activity</h2>
                      <p style={cardCaption}>All time, not "this month" — course records keep the latest state, not a change history, so a monthly window isn't derivable yet.</p>
                      <div>
                        <MiniRow k="Courses completed" v={completeCourses.length} />
                        <MiniRow k="Hours logged" v={hoursLogged.toFixed(1).replace(/\.0$/, "")} />
                        <MiniRow k="In progress" v={inProgressCount} />
                        <MiniRow k="Current streak" v={`${streak} wk${streak === 1 ? "" : "s"}`} />
                      </div>
                    </div>
                    <div style={card}>
                      <p style={eyebrow}>Retention</p>
                      <h2 style={cardTitle}>Confidence by skill</h2>
                      <p style={cardCaption}>From courses you've started — quiz accuracy where one exists, completion otherwise.</p>
                      {skillRows.length === 0 ? (
                        <div style={{ fontSize: 12.5, color: "var(--muted)" }}>Start a course to see your confidence by skill.</div>
                      ) : (
                        <div>
                          {skillRows.map((s) => <SkillRow key={s.skill} skill={s.skill} dots={s.dots} />)}
                          {avgExamScore != null && <MiniRow k="Avg exam score" v={`${avgExamScore}%`} />}
                        </div>
                      )}
                    </div>
                    <div style={card}>
                      <p style={eyebrow}>What's next</p>
                      <h2 style={cardTitle}>Keep the momentum</h2>
                      {!nextCourse && !lastCompletionCourse ? (
                        <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "10px 0 0" }}>Nothing left to plan — every course is complete or skipped.</p>
                      ) : (
                        <div>
                          {nextCourse && (
                            <NextRow
                              icon="📘"
                              title={`Finish "${nextCourse.title}"`}
                              detail={nextCourse.target_date ? `Target ${fmtDate(nextCourse.target_date)}` : nextCourse.est_hours != null ? `~${nextCourse.est_hours} hrs` : "No target set"}
                            />
                          )}
                          {lastCompletionCourse?.outcome && (
                            <NextRow icon="💡" title={lastCompletionCourse.outcome} detail={`From "${lastCompletionCourse.title}"`} />
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* ── Application · AI Ideas Hub (mockup card holder) ── */}
                <PlaceholderCard
                  kicker="Application · AI Ideas Hub"
                  title="What I've built from what I learned"
                  caption="Each idea will link back to the course or skill it came from."
                  note="Coming soon · Phase 2 — needs an idea↔course link on the Ideas Hub side."
                  style={{ marginBottom: 16 }}
                />

                <section style={card}>
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 18 }}>
                    <div>
                      <h1 style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 20, color: "var(--ink)", margin: "0 0 4px" }}>Mind map</h1>
                      <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>
                        Ordered intern → principal. Reorder from the List view on Your Journey.
                      </p>
                    </div>
                    <select
                      value={selectedTrack}
                      onChange={(e) => setSelectedTrack(e.target.value)}
                      style={{ border: "1px solid var(--line)", background: "var(--card)", borderRadius: 8, padding: "0 10px", height: 28, fontSize: 12.5, fontWeight: 700, color: "var(--ink)" }}
                    >
                      <option value="all">All tracks</option>
                      {trackOptions.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                  {filteredJourney.length === 0 ? (
                    <div style={{ fontSize: 13, color: "var(--muted)" }}>No courses in this track.</div>
                  ) : (
                    <JourneyMindMap courses={filteredJourney} onRequestSkip={(c) => { setSkipErr(""); setSkipTarget(c); }} />
                  )}
                </section>
              </>
            )}
          </>
        )}
      </main>

      {skipTarget && (
        <SkipConfirmModal
          course={skipTarget}
          busy={skipping}
          err={skipErr}
          onCancel={() => setSkipTarget(null)}
          onConfirm={confirmSkip}
        />
      )}
    </div>
  );
}
