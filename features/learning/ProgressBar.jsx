// A small blue progress bar, reused by ProfileStrip and Team view's roster —
// the same track+fill markup was being hand-copied at both call sites.
export default function ProgressBar({ pct, width = "100%" }) {
  return (
    <div style={{ width, height: 6, borderRadius: 999, background: "var(--bg)", overflow: "hidden", flexShrink: 0 }}>
      <div style={{ height: "100%", width: `${pct}%`, background: "var(--blue)", borderRadius: 999 }} />
    </div>
  );
}
