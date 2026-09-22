"use client";

// The roadmap Mind map — a real mind map now (centre topic, branches, leaves)
// rather than the tier-columns-and-arrows board it used to be. Lives on the
// Learner Dashboard (features/learning/LearnerDashboardPage.jsx).
//
// Shape: the track sits in the middle, each seniority tier branches off it
// (right side first, then left, so the two halves balance), and opening a
// tier fans that tier's own courses out beside it. One tier open at a time —
// the rest dim rather than disappear, so the whole roadmap stays readable
// while one part of it is in focus.
//
// Two independent encodings, deliberately kept apart: the branch COLOUR is
// the tier (a fixed hue per rung of the ladder), and the dot on each leaf is
// that course's own STATUS (shared.js's STATUS_META, the same vocabulary the
// List view and every status pill in this feature already use). Mixing the
// two into one colour would make neither readable.
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
const HUB_DX = 172;        // centre -> tier hub
const LEAF_DX = 132;       // tier hub -> its course leaves
const LEAF_W = 190;
const ROW_H = 40;
const MIN_H = 330;
const PAD_Y = 30;
// How many leaves a tier shows before offering "+N more" — a tier can hold 30+
// courses (Core Competency's own tiers do), and a stage tall enough for all of
// them by default would bury the rest of the map.
const COLLAPSED_LEAVES = 8;

// Flat tangents at both ends, so a branch leaves the centre and arrives at its
// node horizontally — that's what makes a drawn mind map read as branching
// rather than as a wire diagram.
const sCurve = (x1, y1, x2, y2) => {
  const dx = (x2 - x1) * 0.5;
  return `M ${x1} ${y1} C ${x1 + dx} ${y1} ${x2 - dx} ${y2} ${x2} ${y2}`;
};

const leafBase = {
  position: "absolute", display: "inline-flex", alignItems: "flex-start", gap: 8,
  width: LEAF_W, padding: "6px 12px", borderRadius: 999, border: "1px solid var(--line)",
  background: "var(--card)", textAlign: "left", textDecoration: "none",
  fontFamily: "inherit", fontSize: 11.5, fontWeight: 600, color: "var(--ink)",
  boxShadow: "0 2px 8px rgba(10,22,44,.07)",
};

// Vertical space one tier's block needs: its own hub row, or the fanned-out
// leaves once it's open. Everything else in the layout follows from this.
function blockHeight(rows) {
  return Math.max(54, rows * ROW_H + 20);
}

// Splits the tiers into a right and a left column (right takes the first half,
// so the ladder still reads top-to-bottom down one side and then the other),
// centres each column vertically, and returns where every hub lands plus how
// tall the stage has to be to hold them.
function layout(groups, openKey, visibleRows) {
  const half = Math.ceil(groups.length / 2);
  const sides = { right: groups.slice(0, half), left: groups.slice(half) };
  const rowsFor = (g) => (g.key === openKey ? visibleRows : 0);
  const sideHeight = (s) => sides[s].reduce((sum, g) => sum + blockHeight(rowsFor(g)), 0);
  const height = Math.max(MIN_H, Math.max(sideHeight("right"), sideHeight("left")) + PAD_Y * 2);

  const place = {};
  ["right", "left"].forEach((s) => {
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
  const cx = STAGE_W / 2;
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

    const lx = hx + dir * LEAF_DX;
    const rowY = (j) => Math.round(y - ((visibleRows - 1) / 2) * ROW_H + j * ROW_H);

    shown.forEach((c, j) => {
      const ly = rowY(j);
      const meta = STATUS_META[c.status] || STATUS_META.not_started;
      paths.push(
        <path
          key={`twig-${c.id}`}
          d={sCurve(hx + dir * 4, y, lx, ly)}
          fill="none" stroke={g.color} strokeWidth={1.5} opacity={0.42}
        />
      );
      const inner = (
        <>
          <StatusDot status={c.status} />
          <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", lineHeight: 1.3 }}>
            {c.title}
          </span>
        </>
      );
      const style = { ...leafBase, left: lx, top: ly, transform: anchor };
      nodes.push(c.link ? (
        <a
          key={`leaf-${c.id}`}
          href={c.link}
          target="_blank"
          rel="noopener noreferrer"
          title={`${c.title} — ${meta.label}`}
          style={style}
        >
          {inner}
        </a>
      ) : (
        <div key={`leaf-${c.id}`} title={`${c.title} — ${meta.label}`} style={style}>
          {inner}
        </div>
      ));
    });

    if (hidden > 0) {
      const ly = rowY(shown.length);
      paths.push(
        <path
          key={`twig-more-${g.key}`}
          d={sCurve(hx + dir * 4, y, lx, ly)}
          fill="none" stroke={g.color} strokeWidth={1.5} opacity={0.42}
        />
      );
      nodes.push(
        <button
          key={`more-${g.key}`}
          type="button"
          onClick={() => setShowAll(true)}
          style={{
            ...leafBase, left: lx, top: ly, transform: anchor, cursor: "pointer",
            borderStyle: "dashed", background: "var(--bg)", color: "var(--muted)", fontWeight: 700,
            justifyContent: "center",
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
