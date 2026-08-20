"use client";

// Your Journey: every course across the tracks you're enrolled in, one flat
// list ordered by track then stage. List view only — see the note in
// JourneyTable below for why there's no mind-map/prerequisite view yet.

import { useCallback, useEffect, useState } from "react";
import AppHeader from "@/components/AppHeader";
import Loading from "@/components/Loading";
import { useSession } from "@/features/auth/SessionProvider";
import { api } from "@/lib/apiClient";
import useRevalidateOnFocus from "@/lib/useRevalidateOnFocus";
import { card, errBanner, STATUS_META, th, td, fmtDate } from "@/features/learning/shared";

function JourneyRow({ course, index, expanded, onToggle }) {
  const status = STATUS_META[course.status] || STATUS_META.not_started;
  return (
    <>
      <tr style={{ borderTop: "1px solid var(--line)", cursor: "pointer" }} onClick={onToggle}>
        <td style={{ ...td, color: "var(--faint)" }}>{index}</td>
        <td style={{ ...td, fontWeight: 700, fontSize: 13.5, color: "var(--ink)" }}>{course.title}</td>
        <td style={td}>{course.track_name}</td>
        <td style={td}>{course.platform || "—"}</td>
        <td style={td}>{course.est_hours ?? "—"}</td>
        <td style={td}>{fmtDate(course.target_date)}</td>
        <td style={td}><span style={{ fontSize: 11, fontWeight: 700, borderRadius: 999, padding: "3px 10px", background: status.bg, color: status.color, whiteSpace: "nowrap" }}>{status.label}</span></td>
        <td style={{ ...td, textAlign: "right", color: "var(--muted)" }}>{expanded ? "︿" : "﹀"}</td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={8} style={{ padding: 0, background: "var(--bg)" }}>
            <div style={{ padding: "12px 8px 16px 8px", display: "flex", flexDirection: "column", gap: 8 }}>
              {course.link && (
                <a href={course.link} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12.5, color: "var(--blue)", fontWeight: 700, textDecoration: "none" }}>
                  Open course{course.platform ? ` on ${course.platform}` : ""} ↗
                </a>
              )}
              {course.outcome && <div style={{ fontSize: 12.5, color: "var(--body)" }}><strong>After this course:</strong> {course.outcome}</div>}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// List view only for now — the mind-map/prerequisite view from the original
// mockup needs a real prerequisite graph, which nothing here models yet.
function JourneyTable({ courses }) {
  const [expandedId, setExpandedId] = useState(null);
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ textAlign: "left", color: "var(--muted)" }}>
            <th style={th}>#</th>
            <th style={th}>Course</th>
            <th style={th}>Track</th>
            <th style={th}>Platform</th>
            <th style={th}>Est. hrs</th>
            <th style={th}>Target</th>
            <th style={th}>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {courses.map((c, i) => (
            <JourneyRow key={c.id} course={c} index={i + 1} expanded={expandedId === c.id} onToggle={() => setExpandedId((id) => (id === c.id ? null : c.id))} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function JourneyPage() {
  const { user: me } = useSession();
  const [journey, setJourney] = useState([]);
  const [err, setErr] = useState("");
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    setErr("");
    try { const { courses } = await api("/api/journey"); setJourney(courses); } catch (e) { setErr(e.message); } finally { setReady(true); }
  }, []);

  useEffect(() => { if (me) load(); }, [me, load]);
  useRevalidateOnFocus(() => { if (me) load(); });

  return (
    <div style={{ minHeight: "100vh", paddingBottom: 40 }}>
      <AppHeader crumb="Your Journey" />
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "24px 22px 0" }}>
        {me === undefined || (me && !ready) ? (
          <Loading label="Loading your journey" />
        ) : (
          <section style={card}>
            <h1 style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 20, color: "var(--ink)", margin: "0 0 4px" }}>Your Journey</h1>
            <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 18px" }}>Every course across the tracks you're enrolled in, ordered by track and stage.</p>
            {err && <div style={{ ...errBanner, marginBottom: 14 }}>{err}</div>}
            {journey.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--muted)" }}>Nothing here yet — enroll in a track from the Learning Hub to start your journey.</div>
            ) : (
              <JourneyTable courses={journey} />
            )}
          </section>
        )}
      </main>
    </div>
  );
}
