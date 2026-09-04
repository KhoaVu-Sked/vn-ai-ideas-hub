"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { MANAGE_SECTIONS } from "@/features/admin/sections";
import SkeduloMark from "@/components/SkeduloMark";
import { APP_NAME } from "@/lib/brand";
import { avatarColor, initialsOf } from "@/features/accounts/avatar";
import Avatar from "@/components/Avatar";
import { useSession } from "@/features/auth/SessionProvider";


// App top bar, modelled on the Skedulo product header.
//   crumb     — optional text after the app name (e.g. an idea's title)
//   onNewIdea — opens the submit modal in place; otherwise "+" routes to the board
//   search / onSearch — controlled search box (board passes its own state)
//
// Which hub's navigation shows is read from the URL rather than passed in.
// Thirteen components render this header; a `hub` prop would mean thirteen
// edits and a fourteenth page that silently gets the wrong nav by forgetting
// it. The shared admin pages (/tasks, /activity, /manage, /profile) count as
// ideas pages, which is what lets the pathname be a sufficient answer.
export default function AppHeader({ crumb, onNewIdea, search, onSearch }) {
  const router = useRouter();
  const pathname = usePathname() || "/";
  // "/" is the chooser: brand and avatar only. Offering hub links there would
  // pre-answer the question that page exists to ask.
  const hub = pathname === "/" ? null : pathname.startsWith("/learning") ? "learning" : "ideas";
  const { user: me } = useSession();
  const [openMenu, setOpenMenu] = useState(null); // 'manage' | 'avatar'
  const [term, setTerm] = useState(search ?? "");
  const avatarRef = useRef(null);

  useEffect(() => { if (search !== undefined) setTerm(search); }, [search]);
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
    if (!onSearch) router.push(term.trim() ? `/ideas?q=${encodeURIComponent(term.trim())}` : "/ideas");
  };

  return (
    <header className="app-header">
      <Link href="/" className="app-header__brand">
        <span className="app-header__mark"><SkeduloMark size={20} /></span>
        <span className="app-header__name">{APP_NAME}</span>
      </Link>
      {crumb && <span className="app-header__crumb">› {crumb}</span>}

      <nav style={{ display: "flex", alignItems: "center", gap: 2, marginLeft: 8 }}>
        {hub === "ideas" && <Link href="/ideas" className="hdr-nav">Board</Link>}
        {hub === "ideas" && admin && <Link href="/dashboard" className="hdr-nav">Dashboard</Link>}
        {/* Pre-onboarding (no enrolled track yet — me.onboarded, from
            /api/auth/me), Learning Hub itself IS the "get started" gateway,
            and My Dashboard has nothing to show yet, so it stays hidden
            rather than opening to an empty state. */}
        {hub === "learning" && <Link href={me?.onboarded ? "/learning/journey" : "/learning"} className="hdr-nav">Learning Hub</Link>}
        {hub === "learning" && me?.onboarded && <Link href="/learning/dashboard" className="hdr-nav">My Dashboard</Link>}
        {hub === "learning" && admin && <Link href="/learning/team" className="hdr-nav">Team</Link>}
        {hub && admin && <Link href="/tasks" className="hdr-nav">Tasks</Link>}
        {hub && admin && <Link href="/activity" className="hdr-nav">Activity</Link>}
        {hub && admin && (
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

      {hub === "learning" && (
        <Link href="/ideas" className="hdr-cross hdr-cross--hot">💡 Go to the Ideas Hub</Link>
      )}

      {hub === "ideas" && (
      <form className="hdr-search" onSubmit={submitSearch}>
        <span className="hdr-search__icon" aria-hidden="true">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
          </svg>
        </span>
        <input value={term} onChange={(e) => runSearch(e.target.value)} placeholder="Search ideas" aria-label="Search ideas" />
        {term && <button type="button" className="hdr-search__clear" onClick={() => runSearch("")} aria-label="Clear search">✕</button>}
      </form>
      )}

      {/* Sits between the search box and "+", so the two ideas-only controls
          stay adjacent and the way out of the hub reads as part of the row. */}
      {hub === "ideas" && (
        <Link href="/learning" className="hdr-cross">🎓 Learning Hub</Link>
      )}

      {hub === "ideas" && (
        <button
          className="hdr-plus"
          title="Submit a new idea"
          aria-label="Submit a new idea"
          onClick={() => (onNewIdea ? onNewIdea() : router.push("/ideas?submit=1"))}
        >+</button>
      )}

      <div ref={avatarRef} style={{ position: "relative" }}>
        <button
          className="hdr-avatar" title={me?.name || me?.username || "Account"}
          style={me?.avatar_url ? { padding: 0, overflow: "hidden" } : me ? { background: avatarColor(me) } : undefined}
          onClick={() => setOpenMenu((m) => (m === "avatar" ? null : "avatar"))}
        >
          {me?.avatar_url ? <Avatar person={me} size={34} /> : me ? initialsOf(me.name || me.username) : ""}
        </button>
        {openMenu === "avatar" && (
          <div className="hdr-menu hdr-menu--right">
            <div style={{ padding: "6px 10px 8px", fontSize: 12, color: "var(--muted)", borderBottom: "1px solid var(--line)", marginBottom: 4 }}>
              {me ? <>Signed in as <b style={{ color: "var(--ink)" }}>{me.username}</b>{admin ? " · admin" : ""}</> : "Loading…"}
            </div>
            <Link href="/profile" onClick={() => setOpenMenu(null)}>My profile</Link>
            <a href="#" className="hdr-menu__danger" onClick={(e) => { e.preventDefault(); signOut(); }}>Sign out</a>
          </div>
        )}
      </div>
    </header>
  );
}
