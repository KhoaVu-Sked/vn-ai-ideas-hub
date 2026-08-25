"use client";

// Shown once per release. Fetches on mount; if there is nothing new the request
// is one cheap row and nothing renders.
//
// Dismiss is optimistic on purpose: the panel closes immediately and the stamp
// is saved in the background. If that save fails the worst case is seeing the
// same note again next time, which is better than a modal that will not close.

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { api } from "@/lib/apiClient";

const AUTH_PATHS = new Set(["/login", "/register", "/forgot", "/skedadmin"]);

export default function WhatsNew() {
  const [news, setNews] = useState(null);
  const pathname = usePathname();

  useEffect(() => {
    // Nothing to announce to someone who has not signed in — and /api/whats-new
    // would 401, which apiClient turns into a redirect.
    if (AUTH_PATHS.has(pathname)) return undefined;
    let live = true;
    api("/api/whats-new")
      .then((d) => { if (live && d.show) setNews(d.news); })
      .catch(() => {});   // news is never worth an error message
    return () => { live = false; };
  }, [pathname]);

  if (!news) return null;

  const close = () => {
    setNews(null);
    api("/api/whats-new", { method: "POST" }).catch(() => {});
  };

  return (
    <div
      onClick={close}
      style={{ position: "fixed", inset: 0, background: "rgba(10,22,44,0.45)", display: "flex",
               alignItems: "center", justifyContent: "center", zIndex: 120, padding: 20 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: 14, width: 560, maxWidth: "100%",
                 maxHeight: "85vh", overflowY: "auto", padding: "24px 26px",
                 boxShadow: "0 24px 70px rgba(10,22,44,0.32)" }}
      >
        <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase",
                      color: "var(--blue)", marginBottom: 6 }}>What&apos;s new</div>
        <h2 style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 20,
                     color: "var(--ink)", margin: "0 0 18px" }}>{news.title}</h2>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {(news.items || []).map((it) => (
            <div key={it.heading}>
              <div style={{ fontWeight: 700, fontSize: 14, color: "var(--ink)", marginBottom: 3 }}>{it.heading}</div>
              <div style={{ fontSize: 13.5, color: "var(--body)", lineHeight: 1.55 }}>{it.body}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 22 }}>
          <button
            onClick={close}
            style={{ background: "var(--blue)", color: "#fff", border: "none", borderRadius: 9,
                     padding: "10px 20px", fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
