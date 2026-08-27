// A small blue progress bar, reused by ProfileStrip, Team view's roster,
// and the Learner Dashboard's Roadmap progress — the same track+fill
// markup was being hand-copied at each call site.
//
// Track uses --line (not --bg): --bg (#f3f5f9) sits almost flush against
// --card's white, so the "remaining" portion of the bar was nearly
// invisible on any card. --line is the same neutral already used for
// borders/dividers everywhere else in this app, so it reads as a clear,
// intentional "unfilled" track rather than a new color being introduced.
export default function ProgressBar({ pct, width = "100%" }) {
  return (
    <div style={{ width, height: 6, borderRadius: 999, background: "var(--line)", overflow: "hidden", flexShrink: 0 }}>
      <div style={{ height: "100%", width: `${pct}%`, background: "var(--blue)", borderRadius: 999 }} />
    </div>
  );
}
