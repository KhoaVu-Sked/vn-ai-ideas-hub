"use client";

// What the scan found, before the list of what it found.
//
// The counts were already being computed and thrown away; a list of 60 rows
// paged 20 at a time gave no way to see that four of them were Critical without
// reading all three pages. The bar is proportional so the shape of the problem
// is readable before any number is, and each band filters the list, because
// seeing "4 Critical" and then hunting for those four was the next thing
// everyone did anyway.

import { LEVELS, segments } from "@/features/tools/drive/summary";
import { formatCount } from "@/features/tools/drive/format";

const COLOR = {
  Critical: { fg: "#c92a2a", bar: "#e03131" },
  Warning: { fg: "#b7791f", bar: "#f0a020" },
  Info: { fg: "#2f5fd0", bar: "#4c7ef3" },
  OK: { fg: "#1f7a3c", bar: "#37b24d" },
};

export default function SeveritySummary({ summary, active, onToggle }) {
  const bars = segments(summary);
  if (!summary || !summary.flagged) return null;

  return (
    <div style={{
      background: "var(--card)", border: "1px solid var(--line)",
      borderRadius: 12, padding: "16px 18px 14px", marginBottom: 14,
    }}>
      {/* No role="img" here. It made the whole bar one presentational image and
          took the filter buttons inside it out of the accessibility tree, so
          their aria-pressed and aria-label announced nothing. The counts are in
          the chips below as text anyway, and each band labels itself. */}
      <div style={{ display: "flex", height: 8, borderRadius: 999, overflow: "hidden", background: "var(--bg)" }}>
        {bars.map((b) => (
          <button
            key={b.level}
            className="drive-band"
            onClick={() => onToggle(b.level)}
            aria-pressed={active === b.level}
            aria-label={`${b.count} ${b.level}. Show only these.`}
            title={`${b.count} ${b.level} — click to ${active === b.level ? "clear the filter" : "show only these"}`}
            style={{
              width: `${b.percent}%`,
              background: COLOR[b.level].bar,
              opacity: active && active !== b.level ? 0.28 : 1,
            }}
          />
        ))}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 13, alignItems: "center" }}>
        {LEVELS.filter((level) => summary[level] > 0).map((level) => (
          <button
            key={level}
            className="drive-chip"
            onClick={() => onToggle(level)}
            aria-pressed={active === level}
            style={{ color: COLOR[level].fg }}
          >
            <b>{formatCount(summary[level])}</b>
            <span style={{ color: active === level ? COLOR[level].fg : "var(--muted)" }}>{level}</span>
          </button>
        ))}

        {/* Not a filter: there is no list of correctly-shared files to show. */}
        <span style={{
          display: "inline-flex", alignItems: "baseline", gap: 6,
          padding: "5px 2px 5px 6px", fontSize: 12.5, color: "var(--muted)",
        }}>
          <b style={{ fontSize: 15, fontWeight: 800, color: COLOR.OK.fg }}>
            {summary.approximate && summary.OK !== null ? `${formatCount(summary.OK)}+` : formatCount(summary.OK)}
          </b>
          <span>OK</span>
        </span>

        {active && (
          <button
            onClick={() => onToggle(active)}
            style={{
              marginLeft: "auto", border: "none", background: "none",
              color: "var(--blue)", fontSize: 12.5, fontWeight: 700, cursor: "pointer", padding: "5px 2px",
            }}
          >
            Show all {formatCount(summary.flagged)}
          </button>
        )}
      </div>

      {(summary.approximate || summary.partial) && (
        <p style={{ margin: "10px 0 0", fontSize: 11.5, color: "var(--faint)", lineHeight: 1.5 }}>
          {summary.partial
            ? "This Drive is large enough that the scan stopped early, so the counts above are a floor and how much is fine cannot be worked out from them."
            : "This Drive is large enough that counting stopped early, so the OK figure is a floor rather than a total. The flagged counts are complete."}
        </p>
      )}
    </div>
  );
}
