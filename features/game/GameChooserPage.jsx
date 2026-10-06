"use client";

import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import { GAMES } from "@/features/game/registry";

export default function GameChooserPage() {
  return (
    <>
      <AppHeader />
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "34px 20px 40px" }}>
        <h1 style={{ fontFamily: "var(--font-sora)", fontWeight: 800, fontSize: 24, color: "var(--ink)", margin: 0 }}>
          Games
        </h1>
        <p style={{ fontSize: 13.5, color: "var(--muted)", margin: "8px 0 24px", lineHeight: 1.6 }}>
          Play coins only, worth nothing and exchangeable for nothing. Everyone sits at the same table.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
          {GAMES.map((g) => (
            <Link key={g.slug} href={`/game/${g.slug}`} className="hub-card" style={{ minHeight: 0, padding: "20px" }}>
              <span style={{ fontSize: 26, lineHeight: 1 }} aria-hidden="true">{g.glyph}</span>
              <span style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 17, color: "var(--ink)", marginTop: 11 }}>
                {g.name}
              </span>
              <span style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6, marginTop: 7, flex: 1 }}>{g.line}</span>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--blue)", marginTop: 13 }}>Sit down &rarr;</span>
            </Link>
          ))}
        </div>
      </main>
    </>
  );
}
