"use client";

// Track browsing + enrollment: TrackCard (a track's own summary tile),
// CourseRow (one course inside a track's roadmap preview), and TrackPreview
// (the modal that shows a track's full roadmap and enrolls into it).
// Shared by two call sites — the onboarding wizard's TracksStep
// (LearningHubPage.jsx) and Your Journey's "Tracks" tab (JourneyPage.jsx) —
// which is why this lives in its own module rather than either page.

import { useEffect, useState } from "react";
import Loading from "@/components/Loading";
import { api } from "@/lib/apiClient";
import { errBanner, STATUS_META, statusPill, POSITION_LABEL } from "@/features/learning/shared";

// "Completed" replaces "Enrolled" once every course in the track is done
// for THIS account (complete_count === course_count, and there's at least
// one course — an empty track never reads as "completed"). Same badge,
// just a different label, so it shows wherever this card does: "Your
// tracks"/"Suggested tracks" (both call sites below) and the onboarding
// wizard's track-picker (TracksStep, LearningHubPage.jsx).
export function TrackCard({ track, onPreview }) {
  const completed = track.course_count > 0 && track.complete_count === track.course_count;
  return (
    <button
      onClick={() => onPreview(track.id)}
      style={{
        textAlign: "left", cursor: "pointer", background: "var(--card)", border: "1px solid var(--line)",
        borderRadius: 14, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 8,
        fontFamily: "inherit", transition: "box-shadow 0.15s, border-color 0.15s",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 8px 24px rgba(10,22,44,0.10)"; e.currentTarget.style.borderColor = "#c9d3e6"; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.borderColor = "var(--line)"; }}
    >
      <div style={{ width: 34, height: 34, borderRadius: 9, background: "var(--blue)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 14 }}>
        {track.name.slice(0, 1)}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 15.5, color: "var(--ink)" }}>{track.name}</div>
        {track.assigned && (
          <span style={{ fontSize: 10.5, fontWeight: 700, borderRadius: 999, padding: "2px 8px", background: "#e6f4ea", color: "#1f7a3c" }}>
            {completed ? "Completed" : "Enrolled"}
          </span>
        )}
      </div>
      <div style={{ fontSize: 12.5, color: "var(--muted)" }}>{track.course_count} course{track.course_count === 1 ? "" : "s"}</div>
      <div style={{ fontSize: 12.5, color: "var(--blue)", fontWeight: 700, marginTop: 4 }}>Preview roadmap →</div>
    </button>
  );
}

export function CourseRow({ course, index }) {
  const status = STATUS_META[course.status] || STATUS_META.not_started;
  const position = POSITION_LABEL[course.expected_by_position] || course.expected_by_position;
  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 12, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 26, height: 26, flexShrink: 0, borderRadius: "50%", background: "var(--bg)", color: "var(--muted)", fontWeight: 700, fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {index}
        </div>
        <div style={{ fontWeight: 700, fontSize: 14, color: "var(--ink)", flex: 1 }}>{course.title}</div>
        <span style={statusPill(course.status)}>{status.label}</span>
      </div>
      <div style={{ fontSize: 12, color: "var(--muted)", paddingLeft: 36 }}>
        {[course.platform, course.est_hours != null ? `${course.est_hours} hrs` : null, course.cost].filter(Boolean).join(" · ")}
        {position && <span style={{ marginLeft: 8, padding: "1px 8px", borderRadius: 999, background: "var(--bg)", fontSize: 11, fontWeight: 600 }}>Expected by: {position}</span>}
        {course.priority && <span style={{ marginLeft: 6, padding: "1px 8px", borderRadius: 999, background: "var(--bg)", fontSize: 11, fontWeight: 600, textTransform: "capitalize" }}>{course.priority}</span>}
      </div>
      {course.outcome && <div style={{ fontSize: 12.5, color: "var(--body)", paddingLeft: 36 }}>{course.outcome}</div>}
      {course.link && (
        <div style={{ paddingLeft: 36 }}>
          <a href={course.link} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12.5, color: "var(--blue)", fontWeight: 700, textDecoration: "none" }}>View course →</a>
        </div>
      )}
    </div>
  );
}

export function TrackPreview({ trackId, onClose, onAssignedChange }) {
  const [track, setTrack] = useState(null);
  const [err, setErr] = useState("");
  const [ready, setReady] = useState(false);
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    let live = true;
    setReady(false);
    setErr("");
    api(`/api/tracks/${trackId}`).then(({ track: t }) => { if (live) { setTrack(t); setReady(true); } })
      .catch((e) => { if (live) { setErr(e.message); setReady(true); } });
    return () => { live = false; };
  }, [trackId]);

  // One-directional — enrolling is a real commitment, not a toggle (see
  // enrollInTrack(), features/learning/queries.js, for why), so this is
  // only ever called while !track.assigned; the button itself becomes a
  // plain non-interactive "Enrolled ✓" once it's true, below.
  const enroll = async () => {
    setAssigning(true);
    try {
      const { assigned } = await api(`/api/tracks/${trackId}/assignment`, { method: "POST" });
      setTrack((t) => ({ ...t, assigned }));
      onAssignedChange(trackId, assigned);
    } catch (e) {
      setErr(e.message);
    } finally {
      setAssigning(false);
    }
  };

  const stages = track ? [...new Set(track.courses.map((c) => c.stage || "Other"))] : [];
  let running = 0;

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(10,22,44,0.5)", zIndex: 200, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 20px", overflowY: "auto" }}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: "var(--card)", borderRadius: 16, width: 760, maxWidth: "100%", boxShadow: "0 20px 60px rgba(10,22,44,0.35)", overflow: "hidden" }}>
        <div style={{ padding: "22px 26px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 20, color: "var(--ink)" }}>{track ? track.name : "Loading…"}</div>
            <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2 }}>
              {track ? `Ordered by stage · ${track.courses.length} course${track.courses.length === 1 ? "" : "s"}` : " "}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {track && (
              track.assigned ? (
                <span
                  title="You can't remove a track from your inventory once you've enrolled."
                  style={{ border: "1px solid #bfe3c9", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, background: "#e6f4ea", color: "#1f7a3c", whiteSpace: "nowrap", cursor: "default" }}
                >
                  Enrolled ✓
                </span>
              ) : (
                <button
                  onClick={enroll}
                  disabled={assigning}
                  title="Enroll yourself in this track — this can't be undone later"
                  style={{ border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: assigning ? "wait" : "pointer", background: "var(--blue)", color: "#fff", opacity: assigning ? 0.7 : 1, whiteSpace: "nowrap" }}
                >
                  {assigning ? "…" : "Enroll"}
                </button>
              )
            )}
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--muted)", lineHeight: 1, padding: 4 }} aria-label="Close">×</button>
          </div>
        </div>

        <div style={{ padding: "22px 26px", maxHeight: "70vh", overflowY: "auto" }}>
          {!ready ? (
            <Loading label="Loading roadmap" />
          ) : err ? (
            <div style={errBanner}>{err}</div>
          ) : track.courses.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--muted)" }}>No courses in this track yet.</div>
          ) : (
            stages.map((stage) => (
              <div key={stage} style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--muted)", letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 8 }}>{stage}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {track.courses.filter((c) => (c.stage || "Other") === stage).map((c) => {
                    running += 1;
                    return <CourseRow key={c.id} course={c} index={running} />;
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
