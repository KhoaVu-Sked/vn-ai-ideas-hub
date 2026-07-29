"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import { AVATAR_COLORS, defaultAvatarColor } from "@/lib/statusMeta";
import { AVATAR_ACCEPT_ATTR, validateAvatar } from "@/lib/upload";
import AppHeader from "../AppHeader";
import Loading from "../Loading";

async function api(path, init) {
  const res = await fetch(path, { ...init, headers: init?.body instanceof FormData ? undefined : { "Content-Type": "application/json", ...(init?.headers || {}) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

const card = { background: "var(--card)", border: "1px solid var(--line)", borderRadius: 14, padding: "20px 22px" };
const label = { fontSize: 11.5, fontWeight: 700, color: "var(--muted)", letterSpacing: 0.5, textTransform: "uppercase" };
const field = { width: "100%", margin: "6px 0 16px", padding: "9px 12px", border: "1px solid #d5dce6", borderRadius: 8, fontSize: 13.5, outline: "none", background: "#fff", color: "var(--body)" };
const btn = { border: "1px solid #d5dce6", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", background: "#fff", color: "#3a4a63" };

// Common APAC-first options; the field stays free text so nobody is boxed in.
const REGIONS = ["Vietnam", "Australia", "New Zealand", "Philippines", "India", "United Kingdom", "United States", "Other"];

export default function ProfilePage() {
  const [me, setMe] = useState(undefined);
  const [form, setForm] = useState(null);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [cacheBust, setCacheBust] = useState(0);
  const fileRef = useRef(null);

  // The browser knows every IANA zone; no need to ship a list.
  const zones = useMemo(() => {
    try { return Intl.supportedValuesOf("timeZone"); } catch { return []; }
  }, []);
  const localZone = useMemo(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return ""; }
  }, []);

  const load = useCallback(async () => {
    try {
      const { profile } = await api("/api/profile");
      setMe(profile);
      setAvatarUrl(profile.avatar_url || null);
      setForm({
        name: profile.name || profile.username || "",
        avatar_color: profile.avatar_color || "",
        region: profile.region || "",
        timezone: profile.timezone || "",
      });
    } catch (e) { setErr(e.message); } finally { setReady(true); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setSaved(false); };

  const save = async () => {
    setBusy(true); setErr(""); setSaved(false);
    try {
      const { profile } = await api("/api/profile", { method: "PATCH", body: JSON.stringify(form) });
      setMe(profile);
      setSaved(true);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const upload = async (file) => {
    if (!file) return;
    const bad = validateAvatar({ name: file.name, type: file.type, size: file.size });
    if (bad) { setErr(bad); return; }
    setBusy(true); setErr("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      await api("/api/profile/avatar", { method: "POST", body: fd });
      setAvatarUrl("set");
      setCacheBust((n) => n + 1);   // same URL, new image — force a refetch
    } catch (e) { setErr(e.message); } finally { setBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const removeAvatar = async () => {
    setBusy(true); setErr("");
    try {
      await api("/api/profile/avatar", { method: "DELETE" });
      setAvatarUrl(null);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const shownColor = form?.avatar_color || defaultAvatarColor(me?.username || "");
  const initials = (form?.name || me?.username || "?").slice(0, 2).toUpperCase();

  return (
    <div style={{ minHeight: "100vh", paddingBottom: 40 }}>
      <AppHeader crumb="My profile" />
      <main style={{ maxWidth: 640, margin: "0 auto", padding: "24px 22px 0" }}>
        {!ready ? (
          <Loading label="Loading profile" />
        ) : !me ? (
          <div style={{ ...card, color: "#c92a2a", background: "#fff4f4", borderColor: "#ffc9c9" }}>
            {err || "Could not load your profile."} <Link href="/" style={{ color: "#c92a2a", fontWeight: 700 }}>Back to board</Link>
          </div>
        ) : (
          <section style={card}>
            <h1 style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 20, color: "var(--ink)", margin: "0 0 4px" }}>My profile</h1>
            <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 18 }}>
              How you appear on ideas across the Hub. Your username and email are managed by an admin.
            </div>

            {/* Avatar */}
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 22 }}>
              {avatarUrl ? (
                <img
                  key={cacheBust}
                  src={`/api/avatars/${me.id}?v=${cacheBust}`} alt="" width={72} height={72}
                  style={{ width: 72, height: 72, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
                />
              ) : (
                <div style={{ width: 72, height: 72, borderRadius: "50%", background: shownColor, color: "#fff", fontSize: 26, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {initials}
                </div>
              )}
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button onClick={() => fileRef.current?.click()} disabled={busy} style={btn}>
                    {avatarUrl ? "Replace photo" : "Upload photo"}
                  </button>
                  {avatarUrl && <button onClick={removeAvatar} disabled={busy} style={{ ...btn, color: "#d53c30", borderColor: "#f5c9c9" }}>Remove</button>}
                </div>
                <div style={{ fontSize: 11.5, color: "var(--faint)", marginTop: 6 }}>PNG, JPG, GIF or WebP · max 2 MB</div>
                <input ref={fileRef} type="file" accept={AVATAR_ACCEPT_ATTR} onChange={(e) => upload(e.target.files?.[0])} style={{ display: "none" }} />
              </div>
            </div>

            {/* Colour — used whenever there's no photo */}
            <div style={label}>Avatar colour</div>
            <div style={{ fontSize: 11.5, color: "var(--faint)", margin: "4px 0 8px" }}>Shown when you have no photo. Stays the same everywhere.</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
              {AVATAR_COLORS.map((c) => {
                const on = (form.avatar_color || "").toLowerCase() === c.toLowerCase();
                return (
                  <button
                    key={c} onClick={() => set("avatar_color", c)} title={c}
                    style={{
                      width: 30, height: 30, borderRadius: "50%", background: c, cursor: "pointer",
                      border: on ? "3px solid var(--ink)" : "2px solid #fff",
                      boxShadow: on ? "none" : "0 0 0 1px var(--line)",
                    }}
                  />
                );
              })}
              {form.avatar_color && (
                <button onClick={() => set("avatar_color", "")} style={{ ...btn, padding: "6px 10px", fontSize: 12 }}>Use default</button>
              )}
            </div>

            <div style={label}>Display name</div>
            <input value={form.name} onChange={(e) => set("name", e.target.value)} style={field} />

            <div style={label}>Region</div>
            <input
              value={form.region} onChange={(e) => set("region", e.target.value)}
              list="profile-regions" placeholder="e.g. Vietnam" style={field}
            />
            <datalist id="profile-regions">{REGIONS.map((r) => <option key={r} value={r} />)}</datalist>

            <div style={label}>Timezone</div>
            <select value={form.timezone} onChange={(e) => set("timezone", e.target.value)} style={field}>
              <option value="">Not set</option>
              {localZone && !zones.includes(localZone) && <option value={localZone}>{localZone}</option>}
              {zones.map((z) => <option key={z} value={z}>{z}</option>)}
            </select>
            {localZone && form.timezone !== localZone && (
              <button onClick={() => set("timezone", localZone)} style={{ ...btn, marginTop: -8, marginBottom: 16, padding: "6px 10px", fontSize: 12 }}>
                Use my current zone ({localZone})
              </button>
            )}

            <div style={{ fontSize: 12, color: "var(--faint)", marginBottom: 16 }}>
              Username <b style={{ color: "var(--muted)" }}>{me.username}</b>
              {me.email ? <> · Email <b style={{ color: "var(--muted)" }}>{me.email}</b></> : null}
              {me.created ? <> · Joined {me.created}</> : null}
            </div>

            {err && <div style={{ background: "#fff4f4", border: "1px solid #ffc9c9", color: "#c92a2a", borderRadius: 8, padding: "8px 12px", fontSize: 12.5, marginBottom: 12 }}>{err}</div>}

            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button onClick={save} disabled={busy} style={{ ...btn, background: "var(--blue)", color: "#fff", border: "none", cursor: busy ? "wait" : "pointer" }}>
                {busy ? "Saving…" : "Save changes"}
              </button>
              {saved && <span style={{ fontSize: 12.5, color: "#2f9e44", fontWeight: 700 }}>Saved</span>}
              <Link href="/forgot" style={{ marginLeft: "auto", fontSize: 12.5, color: "var(--blue)", fontWeight: 700 }}>Change password</Link>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
