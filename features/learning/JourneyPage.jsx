"use client";

// Your Journey: every course across the tracks you're enrolled in.
// List view: ordered intern -> principal, scrolled after ~7 rows.
// Mind map view: the same courses laid out in columns by expected_by_position,
// with a "next stage" indicator between columns — not per-course prerequisite
// arrows, since no real prerequisite graph exists between individual courses.

import { useCallback, useEffect, useState } from "react";
import AppHeader from "@/components/AppHeader";
import Loading from "@/components/Loading";
import { useSession } from "@/features/auth/SessionProvider";
import { api } from "@/lib/apiClient";
import useRevalidateOnFocus from "@/lib/useRevalidateOnFocus";
import { card, errBanner, STATUS_META, POSITION_LABEL, POSITION_ORDER, th, td, fmtDate } from "@/features/learning/shared";

const VISIBLE_ROWS = 7;
const ROW_H = 42;
const HEADER_H = 34;

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

// Scrolls after ~7 rows; header stays pinned while the body scrolls.
function JourneyTable({ courses }) {
  const [expandedId, setExpandedId] = useState(null);
  return (
    <div style={{ overflow: "auto", maxHeight: HEADER_H + VISIBLE_ROWS * ROW_H, border: "1px solid var(--line)", borderRadius: 10 }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ textAlign: "left", color: "var(--muted)" }}>
            <th style={{ ...th, position: "sticky", top: 0, background: "var(--card)" }}>#</th>
            <th style={{ ...th, position: "sticky", top: 0, background: "var(--card)" }}>Course</th>
            <th style={{ ...th, position: "sticky", top: 0, background: "var(--card)" }}>Track</th>
            <th style={{ ...th, position: "sticky", top: 0, background: "var(--card)" }}>Platform</th>
            <th style={{ ...th, position: "sticky", top: 0, background: "var(--card)" }}>Est. hrs</th>
            <th style={{ ...th, position: "sticky", top: 0, background: "var(--card)" }}>Target</th>
            <th style={{ ...th, position: "sticky", top: 0, background: "var(--card)" }}>Status</th>
            <th style={{ position: "sticky", top: 0, background: "var(--card)" }} />
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

function MindMapCard({ course }) {
  const status = STATUS_META[course.status] || STATUS_META.not_started;
  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "10px 12px", background: "var(--card)", display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: "var(--ink)", display: "flex", alignItems: "center", gap: 6 }}>
        {course.status === "complete" && (
          <span style={{ width: 16, height: 16, borderRadius: "50%", background: "#1f7a3c", color: "#fff", fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>✓</span>
        )}
        <span>{course.title}</span>
      </div>
      <div style={{ fontSize: 11, color: "var(--muted)" }}>{course.track_name}{course.platform ? ` · ${course.platform}` : ""}</div>
      <span style={{ alignSelf: "flex-start", fontSize: 10.5, fontWeight: 700, borderRadius: 999, padding: "2px 9px", background: status.bg, color: status.color }}>{status.label}</span>
    </div>
  );
}

// Columns by expected_by_position, in ladder order; a "Next stage" indicator
// sits between adjacent columns — a stage transition, not a per-course
// prerequisite (this app doesn't model those).
function JourneyMindMap({ courses }) {
  const groups = POSITION_ORDER
    .map((pos) => ({ position: pos, courses: courses.filter((c) => c.expected_by_position === pos) }))
    .filter((g) => g.courses.length > 0);
  const other = courses.filter((c) => !POSITION_ORDER.includes(c.expected_by_position));
  if (other.length) groups.push({ position: null, courses: other });

  const colMaxHeight = HEADER_H + VISIBLE_ROWS * ROW_H;

  return (
    <div style={{ display: "flex", alignItems: "flex-start", overflowX: "auto", paddingBottom: 8 }}>
      {groups.map((g, i) => (
        <div key={g.position || "other"} style={{ display: "flex", alignItems: "flex-start" }}>
          <div style={{ minWidth: 220, maxWidth: 220 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--muted)", letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 10, textAlign: "center" }}>
              {g.position ? POSITION_LABEL[g.position] : "Other"}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: colMaxHeight, overflowY: "auto", paddingRight: 4 }}>
              {g.courses.map((c) => <MindMapCard key={c.id} course={c} />)}
            </div>
          </div>
          {i < groups.length - 1 && (
            <div style={{ width: 56, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", paddingTop: 40 }}>
              <div style={{ fontSize: 18, color: "var(--blue)" }}>→</div>
              <div style={{ fontSize: 10, color: "var(--muted)", textAlign: "center", marginTop: 4, whiteSpace: "nowrap" }}>Next stage</div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ViewToggle({ view, onChange }) {
  const seg = (active) => ({
    height: 30, padding: "0 16px", fontSize: 12.5, fontWeight: 700, fontFamily: "inherit",
    border: "none", cursor: "pointer", background: active ? "var(--bg)" : "var(--card)", color: active ? "var(--ink)" : "var(--muted)",
  });
  return (
    <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", border: "1px solid var(--line)", flexShrink: 0 }}>
      <button onClick={() => onChange("list")} style={{ ...seg(view === "list"), borderRight: "1px solid var(--line)" }}>List</button>
      <button onClick={() => onChange("mindmap")} style={seg(view === "mindmap")}>Mind map</button>
    </div>
  );
}

export default function JourneyPage() {
  const { user: me } = useSession();
  const [journey, setJourney] = useState([]);
  const [err, setErr] = useState("");
  const [ready, setReady] = useState(false);
  const [view, setView] = useState("list");

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
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 18 }}>
              <div>
                <h1 style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 20, color: "var(--ink)", margin: "0 0 4px" }}>Your Journey</h1>
                <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>Ordered intern → principal, across every track you're enrolled in.</p>
              </div>
              {journey.length > 0 && <ViewToggle view={view} onChange={setView} />}
            </div>
            {err && <div style={{ ...errBanner, marginBottom: 14 }}>{err}</div>}
            {journey.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--muted)" }}>Nothing here yet — enroll in a track from the Learning Hub to start your journey.</div>
            ) : view === "list" ? (
              <JourneyTable courses={journey} />
            ) : (
              <JourneyMindMap courses={journey} />
            )}
          </section>
        )}
      </main>
    </div>
  );
}
