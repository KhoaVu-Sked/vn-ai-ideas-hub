"use client";

// Learner Dashboard — rebuilt to follow the "AI Learning dashboards" mockup
// (repo root, member/"My Progress" view): a KPI row, a Learning card (fully
// wired — the roadmap-by-level bars + course table use data we already have
// via /api/journey), a column of not-yet-wired card holders (Consistency,
// Retention, What's next), and a full-width Application card holder for the
// AI Ideas Hub link-back (no idea↔course relationship exists yet).
//
// The mockup's own "My Progress / Team View" toggle is dropped here — this
// app already separates those as two nav links in AppHeader ("My Dashboard"
// vs "Team"), so an in-page tab would just duplicate that.
//
// The pre-existing Roadmap-by-track section and Mind map (with its
// skip-a-tier action) aren't part of the mockup, but stay below the new
// layout rather than being dropped — kept at the user's request.

import { useCallback, useEffect, useState } from "react";
import AppHeader from "@/components/AppHeader";
import Loading from "@/components/Loading";
import { useSession } from "@/features/auth/SessionProvider";
import { api } from "@/lib/apiClient";
import useRevalidateOnFocus from "@/lib/useRevalidateOnFocus";
import {
  card, eyebrow, errBanner, POSITION_LABEL, isExpectedByNow, effectivePosition,
  PROGRESS_LEVEL_ORDER, PROGRESS_LEVEL_LABEL, progressLevelForPosition, rolesForProgressLevel,
} from "@/features/learning/shared";
import ProgressBar from "@/features/learning/ProgressBar";
import { JourneyMindMap, SkipConfirmModal } from "@/features/learning/MindMap";
import { JourneyTable } from "@/features/learning/JourneyPage";

const cardTitle = { fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 14, margin: "0 0 2px", color: "var(--ink)" };
const cardCaption = { fontSize: 12, color: "var(--muted)", margin: "0 0 14px" };

// `total` here is the track's course count SCOPED to what's expected of
// this account's own position (isExpectedByNow, shared.js) — not every
// course the track has. Easy to misread as "the whole track" otherwise, so
// the row spells it out right under the track name rather than relying on
// the section's own caption above it.
function TrackProgressRow({ name, complete, total, position }) {
  const pct = total ? Math.round((complete / total) * 100) : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderTop: "1px solid var(--line)" }}>
      <div style={{ flex: "0 0 180px" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>{name}</div>
        {position && (
          <div style={{ fontSize: 10.5, color: "var(--muted)" }} title="Courses expected for your current level, not the whole track">
            Through {POSITION_LABEL[position] || position}
          </div>
        )}
      </div>
      {/* ProgressBar defaults to width: "100%", which — with no flex-basis
          of its own — resolves against the WHOLE row, not the space left
          after the label, blowing past the % and count columns entirely
          (they were still in the DOM, just squeezed out of view). Wrapping
          it in a flex: 1 / min-width: 0 container gives it just the
          remaining space instead — min-width: 0 overrides a flex item's
          default min-width: auto, which is what let width: 100% win out
          over its siblings in the first place. */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <ProgressBar pct={pct} />
      </div>
      <div style={{ flex: "0 0 44px", textAlign: "right", fontSize: 12.5, fontWeight: 700, color: "var(--ink)" }}>{pct}%</div>
      <div style={{ flex: "0 0 60px", textAlign: "right", fontSize: 12, color: "var(--muted)" }}>{complete}/{total}</div>
    </div>
  );
}

// ── New (mockup-driven) pieces below ────────────────────────────────────

// Top KPI row — visual shell only for now (label + dash + "Coming soon"),
// same 4 tiles the mockup shows. `accent` gives the last tile the mockup's
// dark navy treatment.
function KpiHolder({ label, accent }) {
  return (
    <div style={{
      ...card, flex: "1 1 220px", padding: "16px 18px",
      ...(accent ? { background: "var(--navy)", borderColor: "var(--navy)" } : {}),
    }}>
      <div style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 11.5, letterSpacing: 0.6, textTransform: "uppercase", color: accent ? "#8fa6c2" : "var(--muted)" }}>{label}</div>
      <div style={{ fontFamily: "var(--font-sora)", fontWeight: 800, fontSize: 30, letterSpacing: -0.3, margin: "6px 0 2px", color: accent ? "#fff" : "var(--ink)" }}>—</div>
      <div style={{ fontSize: 12, color: accent ? "#b9c6d8" : "var(--muted)" }}>Coming soon</div>
    </div>
  );
}

// A card whose chrome (kicker/title/caption) matches the mockup but whose
// body isn't wired up to real data yet — Consistency, Retention, What's
// next, and the Ideas Hub application card all use this until there's data
// behind them.
function PlaceholderCard({ kicker, title, caption, style }) {
  return (
    <div style={{ ...card, ...style }}>
      <p style={eyebrow}>{kicker}</p>
      <h2 style={cardTitle}>{title}</h2>
      {caption && <p style={cardCaption}>{caption}</p>}
      <div style={{ fontSize: 12.5, color: "var(--muted)", padding: caption ? "2px 0 0" : "0" }}>Coming soon.</div>
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
  const [err, setErr] = useState("");
  const [ready, setReady] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState("all");
  const [skipTarget, setSkipTarget] = useState(null);
  const [skipping, setSkipping] = useState(false);
  const [skipErr, setSkipErr] = useState("");

  const load = useCallback(async () => {
    setErr("");
    try {
      const { courses, position: pos } = await api("/api/journey");
      setJourney(courses);
      setPosition(pos);
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

  // Roadmap progress-by-track always covers every enrolled track, independent
  // of the Mind map's own track filter below — switching that filter
  // shouldn't collapse this list down to one row. Scoped the same way as
  // the stat tiles above (isExpectedByNow on the raw position) — a Senior's
  // "AI Track" bar reads against Intern-through-Senior, not the whole
  // roadmap up to Principal.
  const perTrack = trackOptions.map((t) => {
    const courses = journey.filter((c) => c.track_id === t.id && isExpectedByNow(c, position));
    return { name: t.name, total: courses.length, complete: courses.filter((c) => c.status === "complete").length };
  });

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
  // map's own track filter below — same as Roadmap progress above it.
  const visiblePosition = effectivePosition(journey, position);
  const visibleJourney = journey.filter((c) => isExpectedByNow(c, visiblePosition));

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
                {/* ── KPI row (mockup card holders — not wired yet) ── */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 16 }}>
                  <KpiHolder label="Roadmap complete" />
                  <KpiHolder label="Level" />
                  <KpiHolder label="Weekly streak" />
                  <KpiHolder label="Skills applied" accent />
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
                    <PlaceholderCard kicker="Consistency" title="This month" />
                    <PlaceholderCard kicker="Retention" title="Confidence by skill" />
                    <PlaceholderCard kicker="What's next" title="Keep the momentum" />
                  </div>
                </div>

                {/* ── Application · AI Ideas Hub (mockup card holder) ── */}
                <PlaceholderCard
                  kicker="Application · AI Ideas Hub"
                  title="What I've built from what I learned"
                  caption="Each idea will link back to the course or skill it came from."
                  style={{ marginBottom: 16 }}
                />

                {/* ── Kept from the previous dashboard, per request ── */}
                <section style={{ ...card, marginBottom: 18 }}>
                  <h1 style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 18, color: "var(--ink)", margin: "0 0 4px" }}>Roadmap progress</h1>
                  <p style={{ fontSize: 12.5, color: "var(--muted)", margin: 0 }}>
                    Course completion by track{position ? `, through ${POSITION_LABEL[position] || position}` : ""}.
                  </p>
                  <div>
                    {perTrack.map((t) => <TrackProgressRow key={t.name} {...t} position={position} />)}
                  </div>
                </section>

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
