"use client";

import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import { TOOLS } from "@/features/tools/registry";

export default function ToolsHubPage() {
  return (
    <>
      <AppHeader />
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "34px 20px 40px" }}>
        <h1 style={{ fontFamily: "var(--font-sora)", fontWeight: 800, fontSize: 24, color: "var(--ink)", margin: 0 }}>
          Tools
        </h1>
        <p style={{ fontSize: 13.5, color: "var(--muted)", margin: "8px 0 24px", lineHeight: 1.6 }}>
          Small utilities for the team. Each one runs on your own account and touches only your own data.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
          {TOOLS.map((t) => (
            <Link key={t.slug} href={`/tools/${t.slug}`} className="hub-card" style={{ minHeight: 0, padding: "20px 20px 18px" }}>
              <span style={{ fontSize: 24, lineHeight: 1 }} aria-hidden="true">{t.glyph}</span>
              <span style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 11 }}>
                <span style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 16, color: "var(--ink)" }}>
                  {t.name}
                </span>
                {t.status === "beta" && (
                  <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 999, padding: "2px 8px", background: "#fdf1dd", color: "#b7791f" }}>
                    Beta
                  </span>
                )}
              </span>
              <span style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6, marginTop: 7, flex: 1 }}>
                {t.line}
              </span>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--blue)", marginTop: 13 }}>
                Open &rarr;
              </span>
            </Link>
          ))}
        </div>
      </main>
    </>
  );
}
