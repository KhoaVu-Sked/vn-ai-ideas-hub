"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import SkeduloMark from "./SkeduloMark";

const MANAGE_SECTIONS = [
  ["tags", "Tags"], ["fields", "Form fields"], ["users", "User accounts"],
  ["feedback", "Feedback"], ["deletions", "Delete requests"],
];

const initialsOf = (s = "") => {
  const parts = s.trim().split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (s.slice(0, 2) || "?").toUpperCase();
};

// App top bar, modelled on the Skedulo product header.
//   crumb     — optional text after the app name (e.g. an idea's title)
//   onNewIdea — opens the submit modal in place; otherwise "+" routes to the board
//   search / onSearch — controlled search box (board passes its own state)
export default function AppHeader({ crumb, onNewIdea, search, onSearch }) {
  const router = useRouter();
  const [me, setMe] = useState(null);
  const [openMenu, setOpenMenu] = useState(null); // 'manage' | 'avatar'
  const [term, setTerm] = useState(search ?? "");
  const avatarRef = useRef(null);

  useEffect(() => { if (search !== undefined) setTerm(search); }, [search]);
  useEffect(() => {
    fetch("/api/auth/me").then((r) => (r.ok ? r.json() : null)).then((d) => d && setMe(d.user)).catch(() => {});
  }, []);
  // Close the avatar menu on an outside click.
  useEffect(() => {
    const onDoc = (e) => { if (avatarRef.current && !avatarRef.current.contains(e.target)) setOpenMenu((m) => (m === "avatar" ? null : m)); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const admin = me?.role === "admin";
  const signOut = async () => { try { await fetch("/api/auth/logout", { method: "POST" }); } finally { window.location.href = "/login"; } };

  const runSearch = (v) => {
    setTerm(v);
    if (onSearch) onSearch(v);                      // board filters in place
    else if (v.trim()) router.push(`/?q=${encodeURIComponent(v.trim())}`);
  };
  const submitSearch = (e) => {
    e.preventDefault();
    if (!onSearch) router.push(term.trim() ? `/?q=${encodeURIComponent(term.trim())}` : "/");
  };

  return (
    <header className="app-header">
      <Link href="/" className="app-header__brand">
        <span className="app-header__mark"><SkeduloMark size={20} /></span>
        <span className="app-header__name">AI Ideas Hub</span>
      </Link>
      {crumb && <span className="app-header__crumb">› {crumb}</span>}

      <nav style={{ display: "flex", alignItems: "center", gap: 2, marginLeft: 8 }}>
        <Link href="/" className="hdr-nav">Board</Link>
        {admin && <Link href="/dashboard" className="hdr-nav">Dashboard</Link>}
        {admin && <Link href="/tasks" className="hdr-nav">Tasks</Link>}
        {admin && (
          <div style={{ position: "relative" }} onMouseEnter={() => setOpenMenu("manage")} onMouseLeave={() => setOpenMenu((m) => (m === "manage" ? null : m))}>
            <Link href="/manage" className="hdr-nav">Manage <span className="hdr-nav__caret">▼</span></Link>
            {openMenu === "manage" && (
              <div className="hdr-menu">
                {MANAGE_SECTIONS.map(([v, l]) => <Link key={v} href={`/manage?section=${v}`}>{l}</Link>)}
              </div>
            )}
          </div>
        )}
      </nav>

      <span className="app-header__spacer" />

      <form className="hdr-search" onSubmit={submitSearch}>
        <span className="hdr-search__icon" aria-hidden="true">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
          </svg>
        </span>
        <input value={term} onChange={(e) => runSearch(e.target.value)} placeholder="Search ideas" aria-label="Search ideas" />
        {term && <button type="button" className="hdr-search__clear" onClick={() => runSearch("")} aria-label="Clear search">✕</button>}
      </form>

      <button
        className="hdr-plus"
        title="Submit a new idea"
        aria-label="Submit a new idea"
        onClick={() => (onNewIdea ? onNewIdea() : router.push("/?submit=1"))}
      >+</button>

      <div ref={avatarRef} style={{ position: "relative" }}>
        <button className="hdr-avatar" title={me?.username || "Account"} onClick={() => setOpenMenu((m) => (m === "avatar" ? null : "avatar"))}>
          {initialsOf(me?.username || "")}
        </button>
        {openMenu === "avatar" && (
          <div className="hdr-menu hdr-menu--right">
            <div style={{ padding: "6px 10px 8px", fontSize: 12, color: "var(--muted)", borderBottom: "1px solid var(--line)", marginBottom: 4 }}>
              Signed in as <b style={{ color: "var(--ink)" }}>{me?.username}</b>{admin ? " · admin" : ""}
            </div>
            <a href="#" className="hdr-menu__danger" onClick={(e) => { e.preventDefault(); signOut(); }}>Sign out</a>
          </div>
        )}
      </div>
    </header>
  );
}
