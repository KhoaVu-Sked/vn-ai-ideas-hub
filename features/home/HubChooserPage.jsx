"use client";

// The landing page: pick a hub.
//
// This is the only page with no navigation of its own — offering "Board" and
// "Learning Hub" in the header here would make the two big choices below
// redundant, and quietly answer the question the page exists to ask. AppHeader
// therefore renders a third, nav-less state on "/" (see components/AppHeader).

import Link from "next/link";
import AppHeader from "@/components/AppHeader";

const HUBS = [
  {
    href: "/ideas",
    name: "Ideas Hub",
    line: "Raise an AI idea, follow one through review, or see what the team is already building.",
    cta: "Open the Ideas Hub",
    glyph: "💡",
  },
  {
    href: "/learning",
    name: "Learning Hub",
    line: "Work through a training track at your own pace, and see how your progress is going.",
    cta: "Open the Learning Hub",
    glyph: "🎓",
  },
];

export default function HubChooserPage() {
  return (
    <>
      <AppHeader />
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "56px 20px 40px" }}>
        <div style={{ textAlign: "center", marginBottom: 34 }}>
          <h1 style={{ fontFamily: "var(--font-sora)", fontWeight: 800, fontSize: 30, color: "var(--ink)", margin: 0, lineHeight: 1.2 }}>
            Where are you headed?
          </h1>
          <p style={{ fontSize: 14.5, color: "var(--muted)", margin: "10px 0 0", lineHeight: 1.6 }}>
            Two halves of one place. You can switch between them at any time from the header.
          </p>
        </div>

        {/* auto-fit rather than a media query: the cards drop to one column
            when there isn't room for two, without picking a breakpoint. */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 18 }}>
          {HUBS.map((h) => (
            <Link key={h.href} href={h.href} className="hub-card">
              <span style={{ fontSize: 32, lineHeight: 1 }} aria-hidden="true">{h.glyph}</span>
              <span style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 20, color: "var(--ink)", marginTop: 14 }}>
                {h.name}
              </span>
              <span style={{ fontSize: 13.5, color: "var(--muted)", lineHeight: 1.6, marginTop: 8, flex: 1 }}>
                {h.line}
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--blue)", marginTop: 16 }}>
                {h.cta} &rarr;
              </span>
            </Link>
          ))}
        </div>
      </main>
    </>
  );
}
