"use client";

// The first thing someone sees before Google has handed over a token.
//
// It used to be two steps — Connect Google Drive, then Scan my Drive on the
// next screen — for what everyone wanted as one. The button now does both: it
// asks Google for the token and the page starts the scan when it arrives.
//
// Its own component so render-check.mjs can draw the real thing without
// standing up the whole page.

const card = { background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, padding: 18 };

export default function ConnectCard({ ready, pending, err, onScan }) {
  const label = !ready ? "Loading…" : pending ? "Waiting for Google…" : "Scan my Drive";
  return (
    <div style={card}>
      <p style={{ margin: "0 0 14px", fontSize: 13.5, color: "var(--body)", lineHeight: 1.6 }}>
        Uses your Google account, read-only. Google asks you to allow it the first time; after that
        it is one click, and the token is gone when you close the tab.
      </p>
      <button onClick={onScan} disabled={!ready || pending}
        style={{
          background: "var(--blue)", color: "#fff", border: "none", borderRadius: 8,
          padding: "9px 16px", fontSize: 13.5, fontWeight: 700,
          cursor: !ready || pending ? "wait" : "pointer",
          opacity: !ready || pending ? 0.65 : 1,
        }}>
        {label}
      </button>
      {err && err !== "not-configured" && (
        <p style={{ marginTop: 12, marginBottom: 0, fontSize: 12.5, color: "#c92a2a", lineHeight: 1.6 }}>{err}</p>
      )}
    </div>
  );
}
