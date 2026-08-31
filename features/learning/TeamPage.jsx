"use client";

// Team view (admin only): rebuilt to follow the "AI Learning dashboards"
// mockup's Team View tab (repo root, manager view) — same relationship
// LearnerDashboardPage.jsx already has to that mockup's "My Progress" tab.
// KPI row, a "Needs support" card, the roster table (now with Level→target/
// Pace/Avg exam columns), a skills heatmap, and a level-distribution chart
// are all real, derived from data that already exists — no new schema.
//
// "Ideas shipped" (KPI) and the "Application · Ideas Hub" funnel read the
// Ideas Hub's `ideas` table by OWNER and STATUS only
// (ideas.initiator_account_id, ideas.status — see getTeamIdeas(),
// features/learning/queries.js), scoped to currently-enrolled learners
// (account_tracks). That's a real cross-feature read, but not the
// idea<->course link that's still genuinely missing: nothing here can say
// which course or skill a given idea came from, so the funnel below shows
// the Ideas Hub's own real lifecycle (STATUS_ORDER, features/ideas/
// constants.js) rather than per-idea skill attribution.
//
// The mockup's "Needs support" card flags three categories (Stalled,
// Struggling, Stuck) with fabricated-sounding thresholds ("two exam scores
// below 70%"). This app has no notion of a passing quiz score anywhere — the
// wrap-up quiz is deliberately un-scored/un-gated (03-your-journey.md) — so
// "Struggling"/"Stuck" would mean inventing a threshold with no basis in the
// product. Only "Stalled" (in_progress, untouched 28+ days — already
// computed server-side) is real here; that's the one category this card
// shows, one row per person instead of the two-examples-squeezed-into-a-
// stat-card-hint it used to be.
//
// Skills heatmap and the roster's "Avg exam" column reuse skillConfidence()/
// avgExamScore() (shared.js) — the exact same formulas the learner's own
// Dashboard uses for "Confidence by skill"/"Avg exam score" — computed
// client-side per member off the lean `courses` array getTeamOverview() now
// returns per row (features/learning/queries.js), not a second copy of that
// math in SQL.
//
// Access: reuses accounts.role = 'admin', the same gate as Dashboard/Manage/
// Activity — this app has no manager/report hierarchy, so it's org-wide
// ("any admin sees every learner"), not scoped to "my direct reports".
//
// Deliberately does NOT include a "Sync courses" control — that's the
// Google Sheets catalog-sync pipeline from the original spec, which was
// never built and isn't planned (see ai-learning-requirements/01-course-catalog.md, section 2.2).

import { useCallback, useEffect, useState } from "react";
import AppHeader from "@/components/AppHeader";
import Avatar from "@/components/Avatar";
import Loading from "@/components/Loading";
import { useSession } from "@/features/auth/SessionProvider";
import { api } from "@/lib/apiClient";
import useRevalidateOnFocus from "@/lib/useRevalidateOnFocus";
import {
  card, eyebrow, errBanner, POSITION_LABEL, POSITION_ORDER, th, td, relTime,
  formatMonthDay, DEFAULT_ANNUAL_REVIEW_MONTH_DAY, skillConfidence, avgExamScore,
} from "@/features/learning/shared";
import { JourneyTable } from "@/features/learning/JourneyPage";
import ProgressBar from "@/features/learning/ProgressBar";
import { STATUS_META, STATUS_ORDER } from "@/features/ideas/constants";

const cardTitle = { fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 14, margin: "0 0 2px", color: "var(--ink)" };
const cardCaption = { fontSize: 12, color: "var(--muted)", margin: "0 0 14px" };

// Admin-only inline editor for the app-wide annual review date (an
// app_settings row — ANNUAL_REVIEW_DATE in features/admin/queries.js). Auto
// Schedule (features/learning/JourneyPage.jsx) reads this same value to
// default its "Complete by" field, so changing it here changes what every
// learner sees there. Stored as MM-DD (no year — it recurs every year); the
// native date input still needs SOME year to render, so edits are staged
// against a dummy leap year (2000, so Feb 29 is selectable too) and only the
// MM-DD slice ever leaves this component.
function AnnualReviewEditor({ value, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(`2000-${value}`);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const startEditing = () => { setDraft(`2000-${value}`); setErr(""); setEditing(true); };

  const save = async () => {
    setSaving(true);
    setErr("");
    try {
      await onSave(draft.slice(5)); // "MM-DD"
      setEditing(false);
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <button
        onClick={startEditing}
        title="Auto Schedule defaults its Complete-by date to this — click to change it"
        style={{
          display: "flex", alignItems: "center", gap: 6, border: "1px solid var(--line)", background: "var(--bg)",
          borderRadius: 999, padding: "5px 12px", fontSize: 11.5, fontWeight: 700, color: "var(--body)", cursor: "pointer",
        }}
      >
        🗓 Annual review: {formatMonthDay(value)} <span style={{ opacity: 0.6 }}>✎</span>
      </button>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <input
        type="date"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "5px 8px", fontSize: 12.5, color: "var(--ink)", background: "var(--card)" }}
      />
      <button onClick={save} disabled={saving} style={{ border: "none", background: "var(--blue)", color: "#fff", borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 700, cursor: saving ? "wait" : "pointer" }}>
        {saving ? "Saving…" : "Save"}
      </button>
      <button onClick={() => { setEditing(false); setErr(""); }} disabled={saving} style={{ border: "1px solid var(--line)", background: "var(--card)", borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 700, color: "var(--body)", cursor: "pointer" }}>
        Cancel
      </button>
      {err && <span style={{ fontSize: 11.5, color: "#c92a2a" }}>{err}</span>}
    </div>
  );
}

const trackLabel = (tracks) => (!tracks || tracks.length === 0 ? "—" : tracks.join(" + "));
const pctOf = (m) => (m.core_total ? Math.round((m.core_complete / m.core_total) * 100) : 0);

// "Intern → Junior" style label for the roster's Level column — same ladder
// (POSITION_ORDER, shared.js) the Learner Dashboard's own "Level" KPI walks
// (levelHint, LearnerDashboardPage.jsx), just rendered as one compact string
// here since this is a table cell, not a KPI tile.
function levelTarget(position) {
  if (!position) return "—";
  const label = POSITION_LABEL[position] || position;
  const idx = POSITION_ORDER.indexOf(position);
  if (idx === -1) return label;
  const next = POSITION_ORDER[idx + 1];
  return next ? `${label} → ${POSITION_LABEL[next] || next}` : `${label} · top`;
}

// Whether `dateVal` falls within the last `days` days — used for "Active
// this week". A plain rolling window, not weeklyStreak's own Mon–Sun
// boundary (shared.js) — there's no streak concept here, just "has this
// person touched anything recently."
function withinDays(dateVal, days) {
  if (!dateVal) return false;
  return Date.now() - new Date(dateVal).getTime() < days * 86400000;
}

// Top KPI row — same 4 tiles the mockup shows. `accent` gives the last tile
// the mockup's dark navy treatment, same shape as the Learner Dashboard's
// own KpiHolder (LearnerDashboardPage.jsx) — kept as its own copy here
// rather than a shared import, matching how this file already had its own
// StatCard before this pass.
function KpiTile({ label, value, hint, accent }) {
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

// Roster's Pace column — three real states, no fabricated ones:
//   - "Stalled" — server-computed (getTeamOverview): an in_progress course
//     untouched 28+ days. Takes priority over Behind below — going quiet
//     entirely is the more urgent signal than trailing the team average.
//   - "Behind" — this person's own % Complete (pctOf) is below the team's
//     average (the same average the "Team completion" KPI shows) — a real,
//     already-computed benchmark, not an invented fixed target.
//   - "On track" — neither of the above.
function paceFor(member, teamAvgPct) {
  if (member.stalled) return "stalled";
  return pctOf(member) < teamAvgPct ? "behind" : "on_track";
}

const PACE_META = {
  stalled: { label: "Stalled", bg: "#fff4e0", fg: "#a15c00" },
  behind: { label: "Behind", bg: "#fdeaea", fg: "#c92a2a" },
  on_track: { label: "On track", bg: "#e6f4ea", fg: "#1f7a3c" },
};
function PacePill({ pace }) {
  const meta = PACE_META[pace];
  return (
    <span style={{ fontSize: 10.5, fontWeight: 700, borderRadius: 999, padding: "3px 10px", whiteSpace: "nowrap", background: meta.bg, color: meta.fg }}>
      {meta.label}
    </span>
  );
}

function MemberRow({ member, teamAvgPct, ideasCount, onOpen }) {
  const pct = pctOf(member);
  const exam = avgExamScore(member.courses || []);
  return (
    <tr style={{ borderTop: "1px solid var(--line)", cursor: "pointer" }} onClick={() => onOpen(member)}>
      <td style={td}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Avatar person={member} size={28} />
          <span style={{ fontWeight: 700, color: "var(--ink)" }}>{member.name || member.username}</span>
        </div>
      </td>
      <td style={td}>{levelTarget(member.position)}</td>
      <td style={td}>{trackLabel(member.tracks)}</td>
      <td style={td}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <ProgressBar pct={pct} width={100} />
          <span>{pct}%</span>
        </div>
      </td>
      <td style={td}>{member.in_progress_count}</td>
      <td style={td}><PacePill pace={paceFor(member, teamAvgPct)} /></td>
      <td style={{ ...td, textAlign: "right" }}>{exam != null ? `${exam}%` : "—"}</td>
      <td style={td}>{relTime(member.last_activity)}</td>
      <td style={{ ...td, textAlign: "right" }}>{ideasCount}</td>
      <td style={{ ...td, textAlign: "right", color: "var(--muted)" }}>›</td>
    </tr>
  );
}

// "Needs support" — one row per stalled person (real signal: an in_progress
// course untouched 28+ days, computed server-side). A real "View roadmap"
// action (opens the same drill-down a roster row does), not the mockup's
// decorative "Book a 1:1 · pair with buddy" button — nothing in this app
// could actually do that.
function NeedsSupportRow({ member, onOpen }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 0", borderTop: "1px solid var(--line)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <Avatar person={member} size={28} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>{member.name || member.username}</div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            Last active {relTime(member.last_activity)} · {member.stalled_course ? `stuck on "${member.stalled_course}"` : "an in-progress course"}
          </div>
        </div>
      </div>
      <button
        onClick={() => onOpen(member)}
        style={{ border: "1px solid var(--line)", background: "var(--card)", borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 700, color: "var(--body)", cursor: "pointer", flexShrink: 0 }}
      >
        View roadmap
      </button>
    </div>
  );
}

function NeedsSupportCard({ members, onOpen }) {
  const stalled = members.filter((m) => m.stalled);
  return (
    <div style={{ ...card, marginBottom: 18 }}>
      <p style={eyebrow}>Needs support</p>
      <h2 style={cardTitle}>Where you can help this week</h2>
      {stalled.length === 0 ? (
        <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 4 }}>Nothing stalled — everyone's active.</div>
      ) : (
        <div>{stalled.map((m) => <NeedsSupportRow key={m.id} member={m} onOpen={onOpen} />)}</div>
      )}
    </div>
  );
}

// Bucket a 0-100 confidence % into the mockup's 4-step heat scale — None (no
// engaged courses for this skill yet, not a fabricated 0), Learning,
// Proficient, Strong. Colors step from --line (this app's own "empty" token
// — the individual Confidence meter's unfilled segments already use it) up
// to --blue, the same two tokens the rest of this feature's meters use — no
// new hues introduced for this one chart.
const HEAT_COLORS = ["var(--line)", "#CFE0FF", "#6D9BFF", "var(--blue)"];
const HEAT_LABELS = ["None", "Learning", "Proficient", "Strong"];
function heatBucket(pct) {
  if (pct == null) return 0;
  if (pct < 40) return 1;
  if (pct < 75) return 2;
  return 3;
}

// One row per skill (courses.skills, migration 028), one column per member —
// each cell colored by that member's own skillConfidence() (shared.js) for
// that skill, the exact same per-skill percentage the Learner Dashboard's
// own Retention card renders as a dot meter, bucketed here into 4 steps and
// laid out as a grid so gaps across the team are visible at a glance. Skills
// shown are whichever the team's own courses are actually tagged with (no
// hardcoded list), sorted by team-wide average confidence, strongest first.
function SkillHeatmap({ members }) {
  const byMember = new Map(members.map((m) => [m.id, skillConfidence(m.courses || [])]));
  const skillTotals = new Map(); // skill -> [pct, pct, ...] across members with any signal for it
  for (const rows of byMember.values()) {
    for (const r of rows) {
      if (!skillTotals.has(r.skill)) skillTotals.set(r.skill, []);
      skillTotals.get(r.skill).push(r.pct);
    }
  }
  const skills = [...skillTotals.entries()]
    .map(([skill, pcts]) => ({ skill, avg: pcts.reduce((a, b) => a + b, 0) / pcts.length }))
    .sort((a, b) => b.avg - a.avg)
    .map((s) => s.skill);

  if (skills.length === 0) {
    return <div style={{ fontSize: 12.5, color: "var(--muted)" }}>No one has started a tagged course yet.</div>;
  }

  const pctFor = (memberId, skill) => (byMember.get(memberId) || []).find((r) => r.skill === skill)?.pct ?? null;

  return (
    <>
      {/* table-layout: fixed + an explicit width only on the skill-name
          column lets the browser split whatever's left EQUALLY across the
          member columns, so cells stretch to fill the card instead of
          hugging the left edge at a fixed 30px regardless of how few
          members there are. overflowX still guards a roster large enough
          to squeeze columns uncomfortably narrow. */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", minWidth: 320 + members.length * 60, tableLayout: "fixed", borderCollapse: "separate", borderSpacing: 4 }}>
          <colgroup>
            <col style={{ width: 170 }} />
            {members.map((m) => <col key={m.id} />)}
          </colgroup>
          <thead>
            <tr>
              <th />
              {members.map((m) => (
                <th key={m.id} style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", padding: "0 0 6px", textAlign: "center", textTransform: "uppercase", letterSpacing: 0.4 }}>
                  {(m.name || m.username).split(" ")[0]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {skills.map((skill) => (
              <tr key={skill}>
                <td style={{ fontSize: 12, fontWeight: 600, color: "var(--navy)", padding: "0 10px 0 0", lineHeight: 1.3 }}>{skill}</td>
                {members.map((m) => {
                  const pct = pctFor(m.id, skill);
                  return (
                    <td key={m.id} style={{ padding: 0 }} title={`${m.name || m.username} · ${skill}: ${pct != null ? `${pct}%` : "no data yet"}`}>
                      <div style={{ width: "100%", height: 30, borderRadius: 6, background: HEAT_COLORS[heatBucket(pct)] }} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: "flex", gap: 14, marginTop: 12, fontSize: 11.5, color: "var(--muted)", flexWrap: "wrap" }}>
        {HEAT_LABELS.map((label, i) => (
          <span key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 14, height: 14, borderRadius: 4, background: HEAT_COLORS[i], display: "inline-block" }} />
            {label}
          </span>
        ))}
      </div>
    </>
  );
}

// Count of enrolled learners at each seniority level — plain group-by-count
// over the same POSITION_ORDER ladder every other gating rule in this
// feature uses, not a new taxonomy. Bar height is relative to the largest
// bucket, not a fixed scale, so this reads sensibly at any team size.
//
// Each column gets a full-width, full-height track (--line, same "empty"
// track ProgressBar itself uses) with the actual navy fill bottom-anchored
// inside it — not just a bare bar floating in a mostly-empty column — so
// every level shows a same-size shape across the card's full width, a
// 0-count level included, rather than a number with nothing under it. The
// track sits in a flex:1 slot (not a percentage height) so its own height
// is resolved by the flex layout first; the fill's percentage height then
// resolves safely against that, instead of the number/label/gap arithmetic
// the old fixed-percentage-of-120px version relied on.
function LevelDistribution({ members }) {
  const counts = POSITION_ORDER.map((p) => ({ position: p, count: members.filter((m) => m.position === p).length }));
  const max = Math.max(1, ...counts.map((c) => c.count));
  return (
    <div style={{ display: "flex", alignItems: "stretch", gap: 14, height: 120, marginTop: 8, paddingTop: 6 }}>
      {counts.map((c) => (
        <div key={c.position} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ fontFamily: "var(--font-sora)", fontWeight: 800, fontSize: 13, color: "var(--ink)", marginBottom: 6 }}>{c.count}</div>
          <div style={{ flex: 1, width: "100%", display: "flex", alignItems: "flex-end", background: "var(--line)", borderRadius: "8px 8px 0 0", overflow: "hidden" }}>
            <div style={{ width: "100%", height: `${Math.max(4, (c.count / max) * 100)}%`, background: "var(--navy)" }} />
          </div>
          <div style={{ fontSize: 11.5, color: "var(--muted)", fontWeight: 600, marginTop: 6 }}>{POSITION_LABEL[c.position] || c.position}</div>
        </div>
      ))}
    </div>
  );
}

// One stage of the Application card's funnel — a solid bar (no background
// track behind it, unlike a progress bar: an empty stage should show
// nothing, not a gray placeholder pill) sized relative to the largest
// stage, colored by that status's own STATUS_META (features/ideas/
// constants.js), same colors the Ideas Hub's own board uses. Same
// label/bar/count 3-column proportions as the design mockup's own funnel
// row.
function StatusFunnelRow({ status, count, max }) {
  const fg = (STATUS_META[status] || {}).fg || "var(--blue)";
  const pct = max ? Math.round((count / max) * 100) : 0;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "96px 1fr 30px", alignItems: "center", gap: 10, margin: "9px 0" }}>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--navy)" }}>{status}</span>
      <div style={{ height: 26, borderRadius: 8, width: `${pct}%`, background: fg }} />
      <span style={{ fontFamily: "var(--font-sora)", fontWeight: 800, fontSize: 14, textAlign: "right", color: "var(--ink)" }}>{count}</span>
    </div>
  );
}

// One contributor's line in the expanded "who's doing it" breakdown —
// submitted/shipped counts only (no link to their roadmap drill-down: that
// shows course progress, not their ideas, and there's no "this account's
// ideas" view to send it to instead).
function ContributorRow({ member, total, shipped }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "8px 0", borderTop: "1px solid var(--line)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <Avatar person={member} size={24} />
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{member.name || member.username}</span>
      </div>
      <span style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" }}>
        {total} submitted{shipped > 0 ? ` · ${shipped} shipped` : ""}
      </span>
    </div>
  );
}

// "From learning to impact" — real now: every idea initiated by a
// currently-enrolled learner (getTeamIdeas, features/learning/queries.js),
// bucketed into the Ideas Hub's own real lifecycle (STATUS_ORDER) rather
// than the mockup's Submitted/In progress/Shipped/Adopted labels (this app
// has no "Adopted" status). The mockup's own "62% of members who finished
// Applied have shipped..." conversion rate needed level+skill attribution
// this can't do; "% of learners who've submitted at least one idea" is the
// honest substitute — owner + status only, same as everything else here.
//
// Expandable: the funnel/contributor-% summary is the always-visible
// headline; toggling reveals the per-contributor breakdown ("who's doing
// it") — same collapsed-by-default chevron pattern JourneyTable's own row
// expansion uses (JourneyPage.jsx), rather than showing every contributor
// unconditionally, which would make this card grow without bound as the
// team submits more ideas.
function LearningImpactCard({ members, ideas }) {
  const [expanded, setExpanded] = useState(false);
  const counts = STATUS_ORDER.map((status) => ({ status, count: ideas.filter((i) => i.status === status).length }));
  const max = Math.max(1, ...counts.map((c) => c.count));

  const membersById = new Map(members.map((m) => [m.id, m]));
  const byContributor = new Map(); // account_id -> { total, shipped }
  for (const idea of ideas) {
    const row = byContributor.get(idea.initiator_account_id) || { total: 0, shipped: 0 };
    row.total += 1;
    if (idea.status === "Launched") row.shipped += 1;
    byContributor.set(idea.initiator_account_id, row);
  }
  const contributors = [...byContributor.entries()]
    .map(([accountId, stats]) => ({ member: membersById.get(accountId), ...stats }))
    .filter((c) => c.member) // an initiator who's since left every track wouldn't be on the roster
    .sort((a, b) => b.total - a.total || (a.member.name || a.member.username).localeCompare(b.member.name || b.member.username));
  const contributorPct = members.length ? Math.round((contributors.length / members.length) * 100) : 0;

  return (
    <div style={card}>
      <p style={eyebrow}>Application · AI Ideas Hub</p>
      <h2 style={cardTitle}>From learning to impact</h2>
      {ideas.length === 0 ? (
        <p style={{ fontSize: 12.5, color: "var(--muted)", margin: 0 }}>No enrolled learner has submitted an idea yet.</p>
      ) : (
        <>
          <p style={cardCaption}>Where enrolled learners' own Ideas Hub submissions stand today.</p>
          <div>{counts.map((c) => <StatusFunnelRow key={c.status} status={c.status} count={c.count} max={max} />)}</div>
          {/* Boxed info panel (var(--bg), the same canvas gray other small
              icon chips on this page already use) instead of a plain
              bordered text line — matches the mockup's own ".conv" callout
              treatment for this exact summary. Doubles as the expand
              toggle for the "who's doing it" breakdown below. */}
          <button
            onClick={() => setExpanded((v) => !v)}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, width: "100%",
              border: "none", background: "var(--bg)", borderRadius: 10, padding: "11px 13px", marginTop: 12,
              cursor: "pointer", textAlign: "left",
            }}
          >
            <span style={{ fontSize: 12.5, color: "var(--navy)" }}>
              <b>{contributors.length} of {members.length} learners</b> ({contributorPct}%) have submitted at least one idea.
            </span>
            <span style={{ fontSize: 11, color: "var(--blue)", fontWeight: 700, flexShrink: 0 }}>
              {expanded ? "Hide ︿" : "Who's doing it ﹀"}
            </span>
          </button>
          {expanded && (
            <div style={{ marginTop: 2 }}>
              {contributors.map((c) => <ContributorRow key={c.member.id} member={c.member} total={c.total} shipped={c.shipped} />)}
            </div>
          )}
        </>
      )}
    </div>
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
  const [ideas, setIdeas] = useState([]);
  const [err, setErr] = useState("");
  const [ready, setReady] = useState(false);
  const [trackFilter, setTrackFilter] = useState("all");
  const [sortBy, setSortBy] = useState("default");
  const [selected, setSelected] = useState(null);
  const [annualReviewDate, setAnnualReviewDate] = useState(DEFAULT_ANNUAL_REVIEW_MONTH_DAY);

  const load = useCallback(async () => {
    setErr("");
    try {
      const { members: m, ideas: i } = await api("/api/team");
      setMembers(m);
      setIdeas(i || []);
    } catch (e) { setErr(e.message); } finally { setReady(true); }
  }, []);

  useEffect(() => { if (me) load(); }, [me, load]);
  useRevalidateOnFocus(() => { if (me) load(); });

  // Same app_settings row Auto Schedule reads (features/learning/JourneyPage.jsx)
  // — fetched independently of load() above since it's a global setting, not
  // part of the team roster.
  useEffect(() => {
    if (!me) return;
    api("/api/settings").then(({ settings }) => setAnnualReviewDate(settings.annual_review_date))
      .catch(() => {});
  }, [me]);

  // PATCHes the shared setting, then updates local state from the server's
  // own echo — AnnualReviewEditor throws this back to its own try/catch on
  // failure, so a bad save shows inline rather than silently reverting.
  const saveAnnualReviewDate = async (monthDay) => {
    const { settings } = await api("/api/settings", { method: "PATCH", body: JSON.stringify({ annual_review_date: monthDay }) });
    setAnnualReviewDate(settings.annual_review_date);
  };

  const trackOptions = Array.from(new Set(members.flatMap((m) => m.tracks || []))).sort();

  let rows = trackFilter === "all" ? members : members.filter((m) => (m.tracks || []).includes(trackFilter));
  if (sortBy === "pct_desc") rows = [...rows].sort((a, b) => pctOf(b) - pctOf(a));
  else if (sortBy === "pct_asc") rows = [...rows].sort((a, b) => pctOf(a) - pctOf(b));
  else if (sortBy === "name") rows = [...rows].sort((a, b) => (a.name || a.username).localeCompare(b.name || b.username));

  // Track-combination breakdown ("3 on AI Track · 2 on AI Track + Core
  // Competency") — folded into the Team progress caption below rather than
  // its own KPI tile, so the KPI row can match the mockup's 4-tile set
  // exactly (Team completion/Active this week/Avg exam score/Ideas shipped).
  const comboCounts = new Map();
  members.forEach((m) => {
    const key = trackLabel((m.tracks || []).slice().sort());
    comboCounts.set(key, (comboCounts.get(key) || 0) + 1);
  });
  const comboSummary = [...comboCounts.entries()].map(([label, count]) => `${count} on ${label}`).join(" · ");

  // KPI: "Team completion" — a simple average of each member's own %
  // (pctOf, same function the roster rows and sort already use), so this
  // number is literally "add up the % column, divide by headcount" — every
  // learner counts equally regardless of how many core courses their own
  // level expects. (An earlier version pooled raw counts first — sum of
  // everyone's core_complete over sum of everyone's core_total — which
  // let whoever had the biggest course load dominate the result; that's
  // more representative of total work done, but didn't match what the
  // roster's own % column visibly adds up to, which is what people actually
  // compared it against.) Unfiltered by the roster's own track filter, same
  // as every KPI/card on this page. No "+X% MoM" trend, on purpose — same
  // reasoning as the Learner Dashboard's "Roadmap complete" KPI: no
  // snapshot history exists, and a fabricated delta would be worse than
  // none.
  const avgPct = members.length ? Math.round(members.reduce((s, m) => s + pctOf(m), 0) / members.length) : 0;

  // KPI: "Active this week" — plain 7-day activity window (withinDays,
  // above). A member who's never touched a course (last_activity null)
  // counts as inactive, not excluded.
  const activeCount = members.filter((m) => withinDays(m.last_activity, 7)).length;
  const inactiveCount = members.length - activeCount;

  // KPI: "Avg exam score" — avgExamScore (shared.js) over every member's
  // courses flattened into one list, so this is one team-wide average
  // rather than an average-of-per-member-averages (a member with more
  // quiz-graded completions naturally weighs more, same as if this were one
  // big list of completions to begin with rather than one list per person).
  const teamAvgExamScore = avgExamScore(members.flatMap((m) => m.courses || []));

  // KPI: "Ideas shipped" — count of enrolled-learner ideas that reached
  // Launched (getTeamIdeas, features/learning/queries.js — owner + status
  // only, see the file header comment).
  const shippedCount = ideas.filter((i) => i.status === "Launched").length;

  // Roster's "Ideas" column — how many Ideas Hub submissions each member
  // has initiated, any status. Built once here (not filtered per-row in
  // MemberRow) so it's one pass over `ideas` regardless of roster size.
  const ideasByAccount = new Map();
  for (const idea of ideas) {
    ideasByAccount.set(idea.initiator_account_id, (ideasByAccount.get(idea.initiator_account_id) || 0) + 1);
  }

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

            {members.length === 0 ? (
              <div style={card}>
                <div style={{ fontSize: 13, color: "var(--muted)" }}>No one enrolled in a track yet.</div>
              </div>
            ) : (
              <>
                {/* ── KPI row — all four wired to real data. ── */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 16 }}>
                  <KpiTile label="Team completion" value={`${avgPct}%`} hint={`avg across ${members.length} learner${members.length === 1 ? "" : "s"}`} />
                  <KpiTile label="Active this week" value={`${activeCount} / ${members.length}`} hint={inactiveCount === 0 ? "Everyone's active" : `${inactiveCount} inactive 7+ days`} />
                  <KpiTile label="Avg exam score" value={teamAvgExamScore != null ? `${teamAvgExamScore}%` : "—"} hint="First-try accuracy, quiz-graded completions" />
                  <KpiTile label="Ideas shipped" value={shippedCount} hint={`${ideas.length} submitted by learners`} accent />
                </div>

                <NeedsSupportCard members={members} onOpen={setSelected} />

                <section style={card}>
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
                    <div>
                      <h1 style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 18, color: "var(--ink)", margin: "0 0 4px" }}>Team progress</h1>
                      <p style={{ fontSize: 12.5, color: "var(--muted)", margin: 0 }}>
                        {comboSummary || "No one enrolled yet"} · click a row to open that person's roadmap.
                      </p>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <AnnualReviewEditor value={annualReviewDate} onSave={saveAnnualReviewDate} />
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
                    <div style={{ fontSize: 13, color: "var(--muted)" }}>No one enrolled in this track.</div>
                  ) : (
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                          <tr style={{ color: "var(--muted)" }}>
                            <th style={th}>Name</th>
                            <th style={th}>Level → target</th>
                            <th style={th}>Track</th>
                            <th style={th} title="Core courses complete, scoped to what's expected through this person's own level — not the whole roadmap">% Complete</th>
                            <th style={th}>In Progress</th>
                            <th style={th} title="Stalled: an in-progress course untouched 28+ days. Behind: % Complete below the team's own average.">Pace</th>
                            <th style={{ ...th, textAlign: "right" }} title="First-try accuracy across this person's completed, quiz-graded courses">Avg Exam</th>
                            <th style={th}>Last Activity</th>
                            <th style={{ ...th, textAlign: "right" }} title="Ideas Hub submissions this person has initiated, any status">Ideas</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((m) => <MemberRow key={m.id} member={m} teamAvgPct={avgPct} ideasCount={ideasByAccount.get(m.id) || 0} onOpen={setSelected} />)}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>

                {/* ── Coverage (left) + Application/Distribution stacked
                    (right) — the mockup's own two-column row: Skills
                    heatmap runs the full height of the row, and "From
                    learning to impact" sits above "Where the team sits" in
                    the narrower column, not as a separate full-width
                    section below both. ── */}
                <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 14, marginTop: 16 }}>
                  <div style={card}>
                    <p style={eyebrow}>Coverage</p>
                    <h2 style={cardTitle}>Skills across the team</h2>
                    <p style={cardCaption}>Spot gaps at a glance — darker means stronger.</p>
                    <SkillHeatmap members={members} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    <LearningImpactCard members={members} ideas={ideas} />
                    <div style={card}>
                      <p style={eyebrow}>Distribution</p>
                      <h2 style={cardTitle}>Where the team sits</h2>
                      <p style={cardCaption}>Learners per seniority level.</p>
                      <LevelDistribution members={members} />
                    </div>
                  </div>
                </div>

                {selected && <MemberDrilldown member={selected} onClose={() => setSelected(null)} />}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
