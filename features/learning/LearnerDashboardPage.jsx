"use client";

// Learner Dashboard: course + roadmap progress at a glance, plus the roadmap
// Mind map — moved here from Your Journey (features/learning/JourneyPage.jsx),
// which now shows the List view only. Reuses the same /api/journey fetch
// Your Journey already uses, so there's no new endpoint or table behind this.

import { useCallback, useEffect, useState } from "react";
import AppHeader from "@/components/AppHeader";
import Loading from "@/components/Loading";
import { useSession } from "@/features/auth/SessionProvider";
import { api } from "@/lib/apiClient";
import useRevalidateOnFocus from "@/lib/useRevalidateOnFocus";
import { card, errBanner, POSITION_LABEL, isExpectedByNow } from "@/features/learning/shared";
import ProgressBar from "@/features/learning/ProgressBar";
import { JourneyMindMap, SkipConfirmModal } from "@/features/learning/MindMap";

function StatCard({ label, value, hint }) {
  return (
    <div style={{ ...card, flex: "1 1 190px" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 8 }}>{label}</div>
      <div style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 28, color: "var(--ink)", marginBottom: 6 }}>{value}</div>
      <div style={{ fontSize: 12, color: "var(--muted)" }}>{hint}</div>
    </div>
  );
}

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

  // Everything below — both stat tiles AND "Roadmap progress" — is scoped
  // to what's actually expected of this account by now, on their RAW
  // officially-assigned position (isExpectedByNow — Intern is only on the
  // hook for the Intern tier, Senior for everything through Senior), not
  // the whole roadmap up to Principal — same rule Journey's profile strip
  // and Team view's roster use. Deliberately NOT the one-stage-ahead
  // "early access" position Journey's List grants once a tier is finished
  // (effectivePosition, shared.js) — % completion is a graded expectation,
  // and earning early access to bonus material you haven't had time to
  // touch yet shouldn't make your score go down the moment you unlock it.
  const expected = filteredJourney.filter((c) => isExpectedByNow(c, position));
  const coreCourses = expected.filter((c) => c.priority === "core");
  const coreComplete = coreCourses.filter((c) => c.status === "complete").length;
  const corePct = coreCourses.length ? Math.round((coreComplete / coreCourses.length) * 100) : 0;

  const completeCount = expected.filter((c) => c.status === "complete").length;
  const inProgressCount = filteredJourney.filter((c) => c.status === "in_progress").length;
  const overallPct = expected.length ? Math.round((completeCount / expected.length) * 100) : 0;

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
                <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginBottom: 18 }}>
                  <StatCard label="Level" value={POSITION_LABEL[position] || "—"} hint="Your seniority tier" />
                  <StatCard label="Tracks enrolled" value={trackOptions.length} hint={trackOptions.map((t) => t.name).join(" · ") || "—"} />
                  <StatCard label="Core courses complete" value={`${corePct}%`} hint={`${coreComplete} of ${coreCourses.length}${position ? ` · through ${POSITION_LABEL[position] || position}` : ""}`} />
                  <StatCard label="In progress" value={inProgressCount} hint="Courses you're currently on" />
                  <StatCard label="All courses complete" value={`${overallPct}%`} hint={`${completeCount} of ${expected.length}${position ? ` · through ${POSITION_LABEL[position] || position}` : ""}`} />
                </div>

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
