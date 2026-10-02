"use client";

// Every What's New note, one at a time.
//
// The first version stacked them all on one page. With two releases and
// sixteen items between them that was a wall of text nobody would read to the
// end of — so the list picks one and only that one renders. Anchor links would
// have jumped around the same wall rather than shortening it.
//
// Reading this does NOT mark the current note as seen. The modal's own "Got
// it" stays the thing that dismisses it, so browsing the archive cannot
// silently swallow an update someone has not actually read.

import { useState } from "react";
import AppHeader from "@/components/AppHeader";
import { RELEASES, RELEASE } from "@/features/announcements/release";

export default function UpdatesPage() {
  const [openKey, setOpenKey] = useState(RELEASES[0]?.key);
  const shown = RELEASES.find((r) => r.key === openKey) || RELEASES[0];

  return (
    <>
      <AppHeader />
      <main style={{ maxWidth: 1000, margin: "0 auto", padding: "30px 20px 48px" }}>
        <h1 style={{ fontFamily: "var(--font-sora)", fontWeight: 800, fontSize: 24, color: "var(--ink)", margin: 0 }}>
          Updates
        </h1>
        <p style={{ fontSize: 13.5, color: "var(--muted)", margin: "8px 0 22px", lineHeight: 1.6 }}>
          Everything that has changed in TS Hub. If you dismissed a note before reading it, it is still here.
        </p>

        <div className="updates-layout">
          <nav className="updates-list" aria-label="All updates">
            {RELEASES.map((r) => {
              const active = r.key === shown?.key;
              return (
                <button key={r.key} onClick={() => setOpenKey(r.key)}
                  aria-current={active ? "true" : undefined}
                  className={`updates-list__item${active ? " is-active" : ""}`}>
                  <span style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
                    <span style={{ fontSize: 11.5, color: "var(--faint)" }}>{r.date}</span>
                    {r.key === RELEASE && (
                      <span style={{ fontSize: 9.5, fontWeight: 700, borderRadius: 999, padding: "1px 7px", background: "#e8f0ff", color: "var(--blue)" }}>
                        Latest
                      </span>
                    )}
                  </span>
                  <span style={{ display: "block", fontSize: 13, fontWeight: 700, lineHeight: 1.4 }}>
                    {/* The "What's New: " prefix is the same on every row, so it
                        tells you nothing when they are side by side. */}
                    {r.title.replace(/^What's New:\s*/, "")}
                  </span>
                  <span style={{ display: "block", fontSize: 11.5, color: "var(--faint)", marginTop: 3 }}>
                    {(r.items || []).length} {((r.items || []).length === 1) ? "change" : "changes"}
                  </span>
                </button>
              );
            })}
          </nav>

          <article className="updates-body">
            {shown && (
              <>
                <h2 style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 19, color: "var(--ink)", margin: 0, lineHeight: 1.3 }}>
                  {shown.title}
                </h2>
                <div style={{ fontSize: 12, color: "var(--faint)", marginTop: 5 }}>{shown.date}</div>
                {shown.intro && (
                  <p style={{ fontSize: 13.5, color: "var(--muted)", lineHeight: 1.65, margin: "14px 0 0" }}>{shown.intro}</p>
                )}
                <div style={{ marginTop: 6 }}>
                  {(shown.items || []).map((it) => (
                    <div key={it.heading} style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ink)", marginBottom: 6 }}>{it.heading}</div>
                      <p style={{ fontSize: 13, color: "var(--body)", lineHeight: 1.7, margin: 0 }}>{it.body}</p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </article>
        </div>
      </main>
    </>
  );
}
