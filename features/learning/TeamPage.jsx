"use client";

// Team view (admin only): a roll-up of every enrolled learner's progress,
// with a read-only drill-down into any one person's roadmap.
//
// Access: reuses accounts.role = 'admin', the same gate as Dashboard/Manage/
// Activity — this app has no manager/report hierarchy, so it's org-wide
// ("any admin sees every learner"), not scoped to "my direct reports".
//
// Stats and the roster are all computed from data that already exists
// (account_tracks, user_role, courses, course_assignments) — no new schema.
// "Stalled" = an in_progress course whose status hasn't moved in 21+ days
// (course_assignments.updated_at), computed server-side in getTeamOverview.
//
// Deliberately does NOT include a "Sync courses" control — that's the
// Google Sheets catalog-sync pipeline from the original spec, which was
// never built and isn't planned (see ai-learning-requirements.md, section 2.2).

import { useCallback, useEffect, useState } from "react";
import AppHeader from "@/components/AppHeader";
import Avatar from "@/components/Avatar";
import Loading from "@/components/Loading";
import { useSession } from "@/features/auth/SessionProvider";
import { api } from "@/lib/apiClient";
import useRevalidateOnFocus from "@/lib/useRevalidateOnFocus";
import { card, errBanner, POSITION_LABEL, th, td } from "@/features/learning/shared";
import { JourneyTable } from "@/features/learning/JourneyPage";
import ProgressBar from "@/features/learning/ProgressBar";

function relTime(d) {
  if (!d) return "—";
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;
  const months = Math.floor(days / 30);
  return months <= 1 ? "1 month ago" : `${months} months ago`;
}

const trackLabel = (tracks) => (!tracks || tracks.length === 0 ? "—" : tracks.join(" + "));
const pctOf = (m) => (m.core_total ? Math.round((m.core_complete / m.core_total) * 100) : 0);

function StatCard({ label, value, hint }) {
  return (
    <div style={{ ...card, flex: "1 1 220px" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 8 }}>{label}</div>
      <div style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 28, color: "var(--ink)", marginBottom: 6 }}>{value}</div>
      <div style={{ fontSize: 12, color: "var(--muted)" }}>{hint}</div>
    </div>
  );
}

function MemberRow({ member, onOpen }) {
  const pct = pctOf(member);
  return (
    <tr style={{ borderTop: "1px solid var(--line)", cursor: "pointer" }} onClick={() => onOpen(member)}>
      <td style={td}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Avatar person={member} size={28} />
          <span style={{ fontWeight: 700, color: "var(--ink)" }}>{member.name || member.username}</span>
          {member.stalled && (
            <span style={{ fontSize: 10.5, fontWeight: 700, borderRadius: 999, padding: "2px 8px", background: "#fff4e0", color: "#a15c00" }}>Stalled</span>
          )}
        </div>
      </td>
      <td style={td}>{POSITION_LABEL[member.position] || member.position || "—"}</td>
      <td style={td}>{trackLabel(member.tracks)}</td>
      <td style={td}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <ProgressBar pct={pct} width={100} />
          <span>{pct}%</span>
        </div>
      </td>
      <td style={td}>{member.in_progress_count}</td>
      <td style={td}>{relTime(member.last_activity)}</td>
      <td style={{ ...td, textAlign: "right", color: "var(--muted)" }}>›</td>
    </tr>
  );
}

function MemberDrilldown({ member, onClose }) {
  const [courses, setCourses] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let live = true;
    setCourses(null);
    setErr("");
    api(`/api/team/${member.id}/journey`).then(({ courses: c }) => { if (live) setCourses(c); })
      .catch((e) => { if (live) setErr(e.message); });
    return () => { live = false; };
  }, [member.id]);

  const pct = pctOf(member);

  return (
    <section style={{ ...card, marginTop: 18 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Avatar person={member} size={36} />
          <div>
            <div style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 16, color: "var(--ink)" }}>{member.name || member.username} — roadmap</div>
            <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2 }}>
              {POSITION_LABEL[member.position] || member.position || "—"} · {trackLabel(member.tracks)} · {pct}% complete · read-only
            </div>
          </div>
        </div>
        <button onClick={onClose} style={{ border: "1px solid var(--line)", background: "var(--card)", borderRadius: 8, padding: "6px 14px", fontSize: 12.5, fontWeight: 700, color: "var(--body)", cursor: "pointer" }}>Close</button>
      </div>
      {err && <div style={errBanner}>{err}</div>}
      {!err && (courses === null ? <Loading label="Loading roadmap" /> : <JourneyTable courses={courses} readOnly ownRoadmap={false} />)}
    </section>
  );
}

export default function TeamPage() {
  const { user } = useSession();
  const me = user === undefined ? undefined : (user?.role === "admin" ? user : null);
  const [members, setMembers] = useState([]);
  const [err, setErr] = useState("");
  const [ready, setReady] = useState(false);
  const [trackFilter, setTrackFilter] = useState("all");
  const [sortBy, setSortBy] = useState("default");
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    setErr("");
    try { const { members: m } = await api("/api/team"); setMembers(m); } catch (e) { setErr(e.message); } finally { setReady(true); }
  }, []);

  useEffect(() => { if (me) load(); }, [me, load]);
  useRevalidateOnFocus(() => { if (me) load(); });

  const trackOptions = Array.from(new Set(members.flatMap((m) => m.tracks || []))).sort();

  let rows = trackFilter === "all" ? members : members.filter((m) => (m.tracks || []).includes(trackFilter));
  if (sortBy === "pct_desc") rows = [...rows].sort((a, b) => pctOf(b) - pctOf(a));
  else if (sortBy === "pct_asc") rows = [...rows].sort((a, b) => pctOf(a) - pctOf(b));
  else if (sortBy === "name") rows = [...rows].sort((a, b) => (a.name || a.username).localeCompare(b.name || b.username));

  const comboCounts = new Map();
  members.forEach((m) => {
    const key = trackLabel((m.tracks || []).slice().sort());
    comboCounts.set(key, (comboCounts.get(key) || 0) + 1);
  });
  const comboSummary = [...comboCounts.entries()].map(([label, count]) => `${count} on ${label}`).join(" · ");

  const totalCoreTotal = members.reduce((s, m) => s + m.core_total, 0);
  const totalCoreComplete = members.reduce((s, m) => s + m.core_complete, 0);
  const avgPct = totalCoreTotal ? Math.round((totalCoreComplete / totalCoreTotal) * 100) : 0;

  const stalledMembers = members.filter((m) => m.stalled);
  const stalledExamples = stalledMembers.slice(0, 2).map((m) => `${m.stalled_course || "a course"} · ${m.name || m.username}`).join(", ");

  return (
    <div style={{ minHeight: "100vh", paddingBottom: 40 }}>
      <AppHeader crumb="Team view" />
      <main style={{ maxWidth: 1080, margin: "0 auto", padding: "24px 22px 0" }}>
        {me === undefined || (me && !ready) ? (
          <Loading label="Loading team" />
        ) : me === null ? (
          <div style={{ ...card, color: "#c92a2a", background: "#fff4f4", borderColor: "#ffc9c9" }}>Admins only.</div>
        ) : (
          <>
            {err && <div style={{ ...errBanner, marginBottom: 14 }}>{err}</div>}

            <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginBottom: 18 }}>
              <StatCard label="Learners" value={members.length} hint={comboSummary || "No one enrolled yet"} />
              <StatCard label="Average completion" value={`${avgPct}%`} hint="Across all assigned core courses" />
              <StatCard
                label="In progress over 3 weeks"
                value={stalledMembers.length}
                hint={stalledMembers.length === 0 ? "Nothing stalled" : stalledExamples}
              />
            </div>

            <section style={card}>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
                <div>
                  <h1 style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 18, color: "var(--ink)", margin: "0 0 4px" }}>Team progress</h1>
                  <p style={{ fontSize: 12.5, color: "var(--muted)", margin: 0 }}>Click a row to open that person's roadmap.</p>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <select value={trackFilter} onChange={(e) => setTrackFilter(e.target.value)} style={{ border: "1px solid var(--line)", background: "var(--card)", borderRadius: 8, padding: "0 10px", height: 30, fontSize: 12.5, fontWeight: 700, color: "var(--ink)" }}>
                    <option value="all">All tracks</option>
                    {trackOptions.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={{ border: "1px solid var(--line)", background: "var(--card)", borderRadius: 8, padding: "0 10px", height: 30, fontSize: 12.5, fontWeight: 700, color: "var(--ink)" }}>
                    <option value="default">Default order</option>
                    <option value="pct_desc">% complete (high → low)</option>
                    <option value="pct_asc">% complete (low → high)</option>
                    <option value="name">Name</option>
                  </select>
                </div>
              </div>

              {rows.length === 0 ? (
                <div style={{ fontSize: 13, color: "var(--muted)" }}>No one enrolled in a track yet.</div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ color: "var(--muted)" }}>
                        <th style={th}>Name</th>
                        <th style={th}>Level</th>
                        <th style={th}>Track</th>
                        <th style={th}>% Complete</th>
                        <th style={th}>In Progress</th>
                        <th style={th}>Last Activity</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((m) => <MemberRow key={m.id} member={m} onOpen={setSelected} />)}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {selected && <MemberDrilldown member={selected} onClose={() => setSelected(null)} />}
          </>
        )}
      </main>
    </div>
  );
}
