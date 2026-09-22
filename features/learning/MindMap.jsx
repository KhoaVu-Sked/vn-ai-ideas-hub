"use client";

// The roadmap Mind map — a real mind map now (centre topic, branches, leaves)
// rather than the tier-columns-and-arrows board it used to be. Lives on the
// Learner Dashboard (features/learning/LearnerDashboardPage.jsx).
//
// Shape: the track sits in the middle, each seniority tier branches off it
// (earlier tiers on the left, so the ladder reads the way it runs), and
// opening a tier fans out three levels deep —
//
//     Intern  ->  what you can do after  ->  the course that gets you there
//
// The middle level is the course's own `outcome` copy, which is the reason
// to take it; the course itself is the endpoint, and links out to the real
// thing. A course with no outcome written skips the middle level rather than
// inventing one — its own node takes that place instead.
//
// One tier open at a time — the rest dim rather than disappear, so the whole
// roadmap stays readable while one part of it is in focus. The centre slides
// away from whichever side is open, which is what buys the three-deep chain
// enough room to fit without the stage having to scroll.
//
// Two independent encodings, deliberately kept apart: the branch COLOUR is
// the tier (a fixed hue per rung of the ladder), and the dot is that course's
// own STATUS (shared.js's STATUS_META, the same vocabulary the List view and
// every status pill in this feature already use). Mixing the two into one
// colour would make neither readable. The dot sits on the outcome node, where
// it answers "can I do this yet?" rather than just labelling a row.
//
// Laid out in fixed pixels inside a horizontally scrollable stage rather than
// scaling with the container: the node pills are text, and text that scales
// with a viewBox stops being legible on a narrow screen. Same reason the
// previous version scrolled sideways too.
//
// No tier locking, same as before: a tier's courses are always workable
// regardless of the tiers below it, which are assumed already fulfilled.

import { useState } from "react";
import { POSITION_LABEL, POSITION_ORDER, STATUS_META } from "@/features/learning/shared";

// One hue per rung, walking blue -> violet -> magenta -> rose -> amber. Starts
// on the app's own --blue so the ladder is anchored to the brand accent rather
// than an unrelated scale, and ends warm so "top of the ladder" reads as the
// far end of a progression instead of just another colour.
const TIER_COLOR = {
  intern: "#0055ff",
  junior: "#6a4ce0",
  middle: "#a63fc4",
  senior: "#d94a86",
  principal: "#d98829",
};
const OTHER_COLOR = "#5e687a";

const STAGE_W = 1000;
const CENTER_R = 59;       // centre disc radius — branches start at its edge
const HUB_DX = 158;        // centre -> tier hub
const OUT_DX = 150;        // tier hub -> "what you can do after"
const COURSE_DX = 190;     // outcome -> the course itself
const OUT_W = 172;
const COURSE_W = 148;
const ROW_H = 56;
const MIN_H = 330;
const PAD_Y = 30;
// The open branch needs HUB_DX + OUT_DX + COURSE_DX + COURSE_W of room on its
// own side, which is more than half the stage. Sliding the centre away from
// the open side buys exactly that, and costs the closed side only what its
// (single-level) hubs actually use.
const SHIFT = 168;
// How many outcomes a tier shows before offering "Show N more" — a tier can
// hold 30+ courses (Core Competency's own tiers do), and a stage tall enough
// for all of them by default would bury the rest of the map.
const COLLAPSED_LEAVES = 6;

// Flat tangents at both ends, so a branch leaves the centre and arrives at its
// node horizontally — that's what makes a drawn mind map read as branching
// rather than as a wire diagram.
const sCurve = (x1, y1, x2, y2) => {
  const dx = (x2 - x1) * 0.5;
  return `M ${x1} ${y1} C ${x1 + dx} ${y1} ${x2 - dx} ${y2} ${x2} ${y2}`;
};

// Two lines of node text, then an ellipsis — enough for an outcome sentence or
// a long course title without letting one node set the row height for all of them.
const clamp2 = { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", lineHeight: 1.3 };

// The capability — the reason to take the course. Carries the status dot and a
// slab of its branch's colour on the edge facing the hub it came from.
const outcomeBase = {
  position: "absolute", display: "inline-flex", alignItems: "flex-start", gap: 8,
  width: OUT_W, padding: "7px 12px", borderRadius: 12, border: "1px solid var(--line)",
  background: "var(--card)", textAlign: "left", textDecoration: "none",
  fontFamily: "inherit", fontSize: 11.5, fontWeight: 600, color: "var(--ink)",
  boxShadow: "0 2px 8px rgba(10,22,44,.07)",
};

// The course itself — quieter than the capability it delivers, since it's the
// means rather than the point.
const courseBase = {
  position: "absolute", display: "inline-flex", alignItems: "center", gap: 6,
  width: COURSE_W, padding: "6px 11px", borderRadius: 999, border: "1px solid var(--line)",
  background: "var(--bg)", textAlign: "left", textDecoration: "none",
  fontFamily: "inherit", fontSize: 11, fontWeight: 600, color: "var(--body)",
};

// Vertical space one tier's block needs: its own hub row, or the fanned-out
// leaves once it's open. Everything else in the layout follows from this.
function blockHeight(rows) {
  return Math.max(54, rows * ROW_H + 20);
}

// Splits the tiers into a left and a right column. The LEFT column takes the
// earlier half of the ladder, so the whole thing reads the way the ladder runs
// — Intern at the top left, Principal at the bottom right — rather than
// starting the sequence on the far side of the centre and working backwards.
// Each column is centred vertically; returns where every hub lands plus how
// tall the stage has to be to hold them.
function layout(groups, openKey, visibleRows) {
  const half = Math.ceil(groups.length / 2);
  const sides = { left: groups.slice(0, half), right: groups.slice(half) };
  const rowsFor = (g) => (g.key === openKey ? visibleRows : 0);
  const sideHeight = (s) => sides[s].reduce((sum, g) => sum + blockHeight(rowsFor(g)), 0);
  const height = Math.max(MIN_H, Math.max(sideHeight("left"), sideHeight("right")) + PAD_Y * 2);

  const place = {};
  ["left", "right"].forEach((s) => {
    let y = (height - sideHeight(s)) / 2;
    sides[s].forEach((g) => {
      const h = blockHeight(rowsFor(g));
      place[g.key] = { side: s, y: Math.round(y + h / 2) };
      y += h;
    });
  });
  return { height, place };
}

function StatusDot({ status }) {
  const meta = STATUS_META[status] || STATUS_META.not_started;
  return (
    <span
      aria-hidden="true"
      style={{
        width: 13, height: 13, borderRadius: "50%", flexShrink: 0, marginTop: 1,
        background: meta.color, color: "#fff", fontSize: 8, fontWeight: 800,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
      }}
    >
      {status === "complete" ? "✓" : ""}
    </span>
  );
}

export function JourneyMindMap({ courses }) {
  // One tier open at a time; showAll lifts that tier's own COLLAPSED_LEAVES cap.
  const [open, setOpen] = useState(null);
  const [showAll, setShowAll] = useState(false);

  const groups = POSITION_ORDER
    .map((pos) => ({ key: pos, label: POSITION_LABEL[pos] || pos, color: TIER_COLOR[pos], courses: courses.filter((c) => c.expected_by_position === pos) }))
    .filter((g) => g.courses.length > 0);
  const other = courses.filter((c) => !POSITION_ORDER.includes(c.expected_by_position));
  if (other.length) groups.push({ key: "other", label: "Other", color: OTHER_COLOR, courses: other });

  const openGroup = groups.find((g) => g.key === open) || null;
  const shown = openGroup ? (showAll ? openGroup.courses : openGroup.courses.slice(0, COLLAPSED_LEAVES)) : [];
  const hidden = openGroup ? openGroup.courses.length - shown.length : 0;
  const visibleRows = shown.length + (hidden > 0 ? 1 : 0);

  const { height, place } = layout(groups, open, visibleRows);
  // Slide the centre away from whichever side is open, so the open branch gets
  // the room its three levels need (see SHIFT).
  const openSide = openGroup ? place[openGroup.key].side : null;
  const cx = Math.round(STAGE_W / 2 + (openSide === "left" ? SHIFT : openSide === "right" ? -SHIFT : 0));
  const cy = Math.round(height / 2);

  const toggle = (key) => {
    setOpen((cur) => (cur === key ? null : key));
    setShowAll(false);
  };

  const paths = [];
  const nodes = [];

  groups.forEach((g) => {
    const { side, y } = place[g.key];
    const dir = side === "right" ? 1 : -1;
    const hx = cx + dir * HUB_DX;
    const isOpen = open === g.key;
    const faded = open && !isOpen ? 0.32 : 1;
    // Pills anchor on their inner edge so they always grow away from the
    // centre, which is what keeps the widest labels inside the stage.
    const anchor = dir > 0 ? "translate(0, -50%)" : "translate(-100%, -50%)";
    const done = g.courses.filter((c) => c.status === "complete").length;

    paths.push(
      <path
        key={`branch-${g.key}`}
        d={sCurve(cx + dir * CENTER_R, cy, hx, y)}
        fill="none" stroke={g.color} strokeWidth={3.5} strokeLinecap="round"
        opacity={0.5 * faded}
      />
    );

    nodes.push(
      <button
        key={`hub-${g.key}`}
        type="button"
        onClick={() => toggle(g.key)}
        aria-expanded={isOpen}
        style={{
          position: "absolute", left: hx, top: y, transform: anchor, opacity: faded,
          display: "inline-flex", alignItems: "center", gap: 7, whiteSpace: "nowrap",
          padding: "8px 14px", border: "none", borderRadius: 999, cursor: "pointer",
          background: g.color, color: "#fff", fontFamily: "var(--font-sora)",
          fontWeight: 800, fontSize: 13, letterSpacing: -0.1,
          boxShadow: "0 4px 13px rgba(10,22,44,.18)",
        }}
      >
        {dir < 0 && <span aria-hidden="true" style={{ fontSize: 8.5, opacity: 0.85 }}>{isOpen ? "▾" : "◂"}</span>}
        {g.label}
        <span style={{ fontFamily: "inherit", fontSize: 10, fontWeight: 700, opacity: 0.82 }}>
          {done}/{g.courses.length}
        </span>
        {dir > 0 && <span aria-hidden="true" style={{ fontSize: 8.5, opacity: 0.85 }}>{isOpen ? "▾" : "▸"}</span>}
      </button>
    );

    if (!isOpen) return;

    const ox = hx + dir * OUT_DX;        // "what you can do after"
    const kx = ox + dir * COURSE_DX;     // the course that gets you there
    const rowY = (j) => Math.round(y - ((visibleRows - 1) / 2) * ROW_H + j * ROW_H);

    shown.forEach((c, j) => {
      const ly = rowY(j);
      const meta = STATUS_META[c.status] || STATUS_META.not_started;
      const hasOutcome = Boolean(c.outcome);

      paths.push(
        <path
          key={`twig-${c.id}`}
          d={sCurve(hx + dir * 4, y, ox, ly)}
          fill="none" stroke={g.color} strokeWidth={1.5} opacity={0.42}
        />
      );

      // The course node — clickable whenever the catalog has a link for it.
      const courseNode = (x, withDot) => {
        const inner = (
          <>
            {withDot && <StatusDot status={c.status} />}
            <span style={clamp2}>{c.title}</span>
            {c.link && <span aria-hidden="true" style={{ marginLeft: "auto", opacity: 0.55 }}>↗</span>}
          </>
        );
        const style = { ...courseBase, left: x, top: ly, transform: anchor, alignItems: withDot ? "flex-start" : "center" };
        return c.link ? (
          <a key={`course-${c.id}`} href={c.link} target="_blank" rel="noopener noreferrer" title={`${c.title} — ${meta.label}`} style={style}>
            {inner}
          </a>
        ) : (
          <div key={`course-${c.id}`} title={`${c.title} — ${meta.label}`} style={style}>
            {inner}
          </div>
        );
      };

      // No outcome written for this course: its own node takes the middle
      // level rather than showing an empty capability.
      if (!hasOutcome) {
        nodes.push(courseNode(ox, true));
        return;
      }

      nodes.push(
        <div
          key={`outcome-${c.id}`}
          title={`${c.outcome} — ${meta.label}`}
          style={{
            ...outcomeBase, left: ox, top: ly, transform: anchor,
            [dir > 0 ? "borderLeft" : "borderRight"]: `3px solid ${g.color}`,
          }}
        >
          <StatusDot status={c.status} />
          <span style={clamp2}>{c.outcome}</span>
        </div>
      );
      paths.push(
        <path
          key={`stem-${c.id}`}
          d={sCurve(ox + dir * OUT_W, ly, kx, ly)}
          fill="none" stroke={g.color} strokeWidth={1.5} opacity={0.3}
        />
      );
      nodes.push(courseNode(kx, false));
    });

    if (hidden > 0) {
      const ly = rowY(shown.length);
      paths.push(
        <path
          key={`twig-more-${g.key}`}
          d={sCurve(hx + dir * 4, y, ox, ly)}
          fill="none" stroke={g.color} strokeWidth={1.5} opacity={0.42}
        />
      );
      nodes.push(
        <button
          key={`more-${g.key}`}
          type="button"
          onClick={() => setShowAll(true)}
          style={{
            ...outcomeBase, left: ox, top: ly, transform: anchor, cursor: "pointer",
            alignItems: "center", justifyContent: "center",
            borderStyle: "dashed", background: "var(--bg)", color: "var(--muted)", fontWeight: 700,
          }}
        >
          Show {hidden} more
        </button>
      );
    }
  });

  return (
    <div>
      <div style={{ overflowX: "auto", overflowY: "hidden" }}>
        <div style={{ position: "relative", width: STAGE_W, height, margin: "0 auto" }}>
          <svg width={STAGE_W} height={height} viewBox={`0 0 ${STAGE_W} ${height}`} style={{ position: "absolute", inset: 0 }}>
            {paths}
          </svg>
          <div
            style={{
              position: "absolute", left: cx, top: cy, transform: "translate(-50%, -50%)",
              width: CENTER_R * 2, height: CENTER_R * 2, borderRadius: 999, padding: 10,
              background: "var(--navy)", color: "#fff", textAlign: "center",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3,
              boxShadow: "0 10px 26px rgba(0,39,85,.26)",
            }}
          >
            <b style={{ fontFamily: "var(--font-sora)", fontSize: 13.5, fontWeight: 800, lineHeight: 1.15, letterSpacing: -0.2 }}>
              {courses[0]?.track_name || "This track"}
            </b>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,.62)" }}>{courses.length} courses</span>
          </div>
          {nodes}
        </div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 8, fontSize: 11.5, color: "var(--muted)" }}>
        {Object.entries(STATUS_META).map(([key, meta]) => (
          <span key={key} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <i aria-hidden="true" style={{ width: 9, height: 9, borderRadius: "50%", background: meta.color }} />
            {meta.label}
          </span>
        ))}
      </div>
    </div>
  );
}
