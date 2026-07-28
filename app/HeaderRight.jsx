"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const MANAGE_SECTIONS = [
  ["tags", "Tags"], ["fields", "Form fields"], ["users", "User accounts"],
  ["feedback", "Feedback"], ["deletions", "Delete requests"],
];

// Shared right-side header nav. `onNewIdea` (optional) opens the submit modal
// in-place; without it, the New Idea button routes to the board to open it.
export default function HeaderRight({ onNewIdea }) {
  const [me, setMe] = useState(null);
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me").then((r) => (r.ok ? r.json() : null)).then((d) => d && setMe(d.user)).catch(() => {});
  }, []);

  const admin = me?.role === "admin";
  const signOut = async () => { try { await fetch("/api/auth/logout", { method: "POST" }); } finally { window.location.href = "/login"; } };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <Link href="/" className="hdr-btn">Home</Link>
      {admin && <Link href="/dashboard" className="hdr-btn">Dashboard</Link>}
      {admin && <Link href="/tasks" className="hdr-btn">Tasks</Link>}
      {admin && (
        <div style={{ position: "relative" }} onMouseEnter={() => setMenu(true)} onMouseLeave={() => setMenu(false)}>
          <Link href="/manage" className="hdr-btn">Manage ▾</Link>
          {menu && (
            <div className="hdr-menu">
              {MANAGE_SECTIONS.map(([v, l]) => <Link key={v} href={`/manage?section=${v}`}>{l}</Link>)}
            </div>
          )}
        </div>
      )}
      {onNewIdea
        ? <button onClick={onNewIdea} className="hdr-cta">+ Submit New Idea</button>
        : <Link href="/?submit=1" className="hdr-cta">+ Submit New Idea</Link>}
      <button onClick={signOut} className="hdr-btn hdr-btn--danger">Sign out</button>
    </div>
  );
}
