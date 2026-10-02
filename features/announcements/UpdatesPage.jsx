"use client";

// Every What's New note, newest first.
//
// Reading this does NOT mark the current note as seen. The modal's own "Got
// it" stays the thing that dismisses it, so browsing the archive cannot
// silently swallow an update someone has not actually read.

import AppHeader from "@/components/AppHeader";
import { RELEASES, RELEASE } from "@/features/announcements/release";

const card = { background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, padding: "22px 24px" };

export default function UpdatesPage() {
  return (
    <>
      <AppHeader />
      <main style={{ maxWidth: 760, margin: "0 auto", padding: "34px 20px 48px" }}>
        <h1 style={{ fontFamily: "var(--font-sora)", fontWeight: 800, fontSize: 24, color: "var(--ink)", margin: 0 }}>
          Updates
        </h1>
        <p style={{ fontSize: 13.5, color: "var(--muted)", margin: "8px 0 24px", lineHeight: 1.6 }}>
          Everything that has changed in TS Hub, newest first. If you dismissed a note before reading
          it, it is still here.
        </p>

        {RELEASES.map((r) => (
          <article key={r.key} style={{ ...card, marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <h2 style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 17, color: "var(--ink)", margin: 0, lineHeight: 1.3 }}>
                {r.title}
              </h2>
              <span style={{ display: "flex", alignItems: "center", gap: 8, flex: "none" }}>
                {r.key === RELEASE && (
                  <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 999, padding: "2px 8px", background: "#e8f0ff", color: "var(--blue)" }}>
                    Latest
                  </span>
                )}
                <span style={{ fontSize: 12, color: "var(--faint)" }}>{r.date}</span>
              </span>
            </div>

            {r.intro && (
              <p style={{ fontSize: 13.5, color: "var(--muted)", lineHeight: 1.6, margin: "10px 0 0" }}>{r.intro}</p>
            )}

            <div style={{ marginTop: 16 }}>
              {(r.items || []).map((it) => (
                <div key={it.heading} style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ink)", marginBottom: 5 }}>{it.heading}</div>
                  <p style={{ fontSize: 13, color: "var(--body)", lineHeight: 1.65, margin: 0 }}>{it.body}</p>
                </div>
              ))}
            </div>
          </article>
        ))}
      </main>
    </>
  );
}
