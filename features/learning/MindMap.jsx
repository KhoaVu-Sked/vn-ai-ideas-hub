"use client";

// The roadmap Mind map — a real mind map (centre topic, branches, leaves)
// rather than the tier-columns-and-arrows board it used to be. Lives on the
// Learner Dashboard (features/learning/LearnerDashboardPage.jsx).
//
// Shape: the track sits in the middle, each seniority tier branches off it
// (earlier tiers on the left, so the ladder reads the way it runs), and the
// map opens one level at a time —
//
//     Intern  ->  what you can do after  ->  the course that gets you there
//
// Both steps expand the same way: click a tier to fan out its capabilities,
// click a capability to reveal the course behind it. One tier and one
// capability open at a time, so the map never has to show every course in a
// tier at once — which is also what keeps the three-deep chain inside the
// stage. A course with no outcome written skips the middle level rather than
// inventing one; its own node takes that place, already linked.
//
// Nothing here truncates. A node is as tall as its text needs, and rows are
// measured from that text rather than sharing one fixed row height — vertical
// space is the one thing this layout has plenty of, so spending it to keep
// every capability readable is the right trade.
//
// Two independent encodings, deliberately kept apart: the branch COLOUR is
// the tier (a fixed hue per rung of the ladder), and the dot is that course's
// own STATUS (shared.js's STATUS_META, the same vocabulary the List view and
// every status pill in this feature already use). Mixing the two into one
// colour would make neither readable. The dot sits on the capability, where
// it answers "can I do this yet?" rather than just labelling a row.
//
// Laid out in fixed pixels inside a horizontally scrollable stage rather than
// scaling with the container: the node text is text, and text that scales with
// a viewBox stops being legible on a narrow screen.
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
const CENTER_R = 59;        // centre disc radius — branches start at its edge
const HUB_DX = 158;         // centre -> tier hub
const OUT_DX = 146;         // tier hub -> capability
const OUT_W = 196;
const COURSE_W = 160;
const COURSE_DX = OUT_W + 18; // capability -> the course behind it
// The open branch needs HUB_DX + OUT_DX + OUT_W + gap + COURSE_W on its own
// side, which is more than half the stage. Sliding the centre away from the
// open side buys exactly that, and costs the closed side only what its
// single-level hubs actually use.
const SHIFT = 190;
const MIN_H = 330;
const PAD_Y = 30;
const ROW_GAP = 12;
const MIN_ROW = 40;
// How many capabilities a tier shows before offering "Show N more" — a tier
// can hold 30+ courses (Core Competency's own tiers do), and a stage tall
// enough for all of them by default would bury the rest of the map.
const COLLAPSED_LEAVES = 6;

// Rough text metrics, used only to reserve each row enough vertical space for
// its own wrapped text. Deliberately a shade generous: a row with a few pixels
// spare just breathes, whereas one a few pixels short overlaps its neighbour.
// (Measuring for real would mean a render pass before the layout is known, for
// an accuracy this doesn't need.)
const CHAR_W = 6;
const OUT_LINE_H = 15;
const OUT_TEXT_W = OUT_W - 24 - 21 - 14;   // padding, status dot + gap, caret
const COURSE_TEXT_W = COURSE_W - 22 - 14;  // padding, the ↗
const linesIn = (text, boxW) => {
  const perLine = Math.max(8, Math.floor(boxW / CHAR_W));
  return Math.max(1, Math.ceil((text || "").length / perLine));
};
const outcomeHeight = (text) => linesIn(text, OUT_TEXT_W) * OUT_LINE_H + 16;
const courseHeight = (text, boxW) => linesIn(text, boxW) * 14 + 14;

// Flat tangents at both ends, so a branch leaves the centre and arrives at its
// node horizontally — that's what makes a drawn mind map read as branching
// rather than as a wire diagram.
const sCurve = (x1, y1, x2, y2) => {
  const dx = (x2 - x1) * 0.5;
  return `M ${x1} ${y1} C ${x1 + dx} ${y1} ${x2 - dx} ${y2} ${x2} ${y2}`;
};

// Long words (a URL-ish course code, say) break rather than pushing a node
// wider than its column.
const wrapText = { overflowWrap: "anywhere", lineHeight: 1.3 };

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
  position: "absolute", display: "inline-flex", alignItems: "flex-start", gap: 6,
  padding: "6px 11px", borderRadius: 12, border: "1px solid var(--line)",
  background: "var(--bg)", textAlign: "left", textDecoration: "none",
  fontFamily: "inherit", fontSize: 11, fontWeight: 600, color: "var(--body)",
};

// Splits the tiers into a left and a right column. The LEFT column takes the
// earlier half of the ladder, so the whole thing reads the way the ladder runs
// — Intern at the top left, Principal at the bottom right — rather than
// starting the sequence on the far side of the centre and working backwards.
// Each column is centred vertically; returns where every hub lands plus how
// tall the stage has to be to hold them.
function layout(groups, openKey, openBlockH) {
  const half = Math.ceil(groups.length / 2);
  const sides = { left: groups.slice(0, half), right: groups.slice(half) };
  const blockH = (g) => (g.key === openKey ? Math.max(54, openBlockH) : 54);
  const sideHeight = (s) => sides[s].reduce((sum, g) => sum + blockH(g), 0);
  const height = Math.max(MIN_H, Math.max(sideHeight("left"), sideHeight("right")) + PAD_Y * 2);

  const place = {};
  ["left", "right"].forEach((s) => {
    let y = (height - sideHeight(s)) / 2;
    sides[s].forEach((g) => {
      const h = blockH(g);
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
  // One tier open at a time, and within it one capability — same rule at both
  // levels, so the map only ever elaborates one path.
  const [open, setOpen] = useState(null);
  const [openOutcome, setOpenOutcome] = useState(null);
  const [showAll, setShowAll] = useState(false);

  const groups = POSITION_ORDER
    .map((pos) => ({ key: pos, label: POSITION_LABEL[pos] || pos, color: TIER_COLOR[pos], courses: courses.filter((c) => c.expected_by_position === pos) }))
    .filter((g) => g.courses.length > 0);
  const other = courses.filter((c) => !POSITION_ORDER.includes(c.expected_by_position));
  if (other.length) groups.push({ key: "other", label: "Other", color: OTHER_COLOR, courses: other });

  const openGroup = groups.find((g) => g.key === open) || null;
  const shown = openGroup ? (showAll ? openGroup.courses : openGroup.courses.slice(0, COLLAPSED_LEAVES)) : [];
  const hidden = openGroup ? openGroup.courses.length - shown.length : 0;

  // Each row is as tall as whichever of its nodes needs the most room.
  const rows = shown.map((c) => {
    const hasOutcome = Boolean(c.outcome);
    const expanded = hasOutcome && openOutcome === c.id;
    const midH = hasOutcome ? outcomeHeight(c.outcome) : courseHeight(c.title, OUT_TEXT_W);
    const sideH = expanded ? courseHeight(c.title, COURSE_TEXT_W) : 0;
    return { course: c, hasOutcome, expanded, h: Math.max(MIN_ROW, midH, sideH) + ROW_GAP };
  });
  if (hidden > 0) rows.push({ more: true, h: MIN_ROW + ROW_GAP });
  const rowsTotal = rows.reduce((sum, r) => sum + r.h, 0);

  const { height, place } = layout(groups, open, rowsTotal + 20);
  // Slide the centre away from whichever side is open, so the open branch gets
  // the room its three levels need (see SHIFT).
  const openSide = openGroup ? place[openGroup.key].side : null;
  const cx = Math.round(STAGE_W / 2 + (openSide === "left" ? SHIFT : openSide === "right" ? -SHIFT : 0));
  const cy = Math.round(height / 2);

  const toggleTier = (key) => {
    setOpen((cur) => (cur === key ? null : key));
    setOpenOutcome(null);
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
    // Nodes anchor on their inner edge so they always grow away from the
    // centre, which is what keeps the widest text inside the stage.
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
        onClick={() => toggleTier(g.key)}
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

    const ox = hx + dir * OUT_DX;        // what you can do after
    const kx = ox + dir * COURSE_DX;     // the course that gets you there

    // The course node, wherever it lands — linked whenever the catalog has a
    // link for it.
    const courseNode = (c, x, width, ly, withDot) => {
      const meta = STATUS_META[c.status] || STATUS_META.not_started;
      const inner = (
        <>
          {withDot && <StatusDot status={c.status} />}
          <span style={wrapText}>{c.title}</span>
          {c.link && <span aria-hidden="true" style={{ opacity: 0.55, marginLeft: "auto", paddingLeft: 2 }}>↗</span>}
        </>
      );
      const style = { ...courseBase, width, left: x, top: ly, transform: anchor };
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

    let cursor = y - rowsTotal / 2;
    rows.forEach((r) => {
      const ly = Math.round(cursor + r.h / 2);
      cursor += r.h;

      paths.push(
        <path
          key={r.more ? `twig-more-${g.key}` : `twig-${r.course.id}`}
          d={sCurve(hx + dir * 4, y, ox, ly)}
          fill="none" stroke={g.color} strokeWidth={1.5} opacity={0.42}
        />
      );

      if (r.more) {
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
        return;
      }

      const c = r.course;
      const meta = STATUS_META[c.status] || STATUS_META.not_started;

      // No outcome written for this course: its own node takes the middle
      // level rather than showing an empty capability.
      if (!r.hasOutcome) {
        nodes.push(courseNode(c, ox, OUT_W, ly, true));
        return;
      }

      const caret = <span aria-hidden="true" style={{ fontSize: 8.5, color: "var(--muted)", marginTop: 3, flexShrink: 0 }}>{r.expanded ? "▾" : dir > 0 ? "▸" : "◂"}</span>;
      nodes.push(
        <button
          key={`outcome-${c.id}`}
          type="button"
          onClick={() => setOpenOutcome((cur) => (cur === c.id ? null : c.id))}
          aria-expanded={r.expanded}
          title={`${c.outcome} — ${meta.label}`}
          style={{
            ...outcomeBase, left: ox, top: ly, transform: anchor, cursor: "pointer",
            [dir > 0 ? "borderLeft" : "borderRight"]: `3px solid ${g.color}`,
          }}
        >
          {dir < 0 && caret}
          <StatusDot status={c.status} />
          <span style={wrapText}>{c.outcome}</span>
          {dir > 0 && caret}
        </button>
      );

      if (!r.expanded) return;
      paths.push(
        <path
          key={`stem-${c.id}`}
          d={sCurve(ox + dir * OUT_W, ly, kx, ly)}
          fill="none" stroke={g.color} strokeWidth={1.5} opacity={0.3}
        />
      );
      nodes.push(courseNode(c, kx, COURSE_W, ly, false));
    });
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
