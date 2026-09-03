"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import { AVATAR_COLORS, avatarSrc, defaultAvatarColor, initialsOf } from "@/features/accounts/avatar";
import { AVATAR_ACCEPT_ATTR, validateAvatar } from "@/lib/upload";
import AppHeader from "@/components/AppHeader";
import Loading from "@/components/Loading";
import { useSession } from "@/features/auth/SessionProvider";
import { api } from "@/lib/apiClient";
import { PASSWORD_LOGIN, ADMIN_PASSWORD_LOGIN } from "@/features/auth/authMode";


const card = { background: "var(--card)", border: "1px solid var(--line)", borderRadius: 14, padding: "20px 22px" };
const label = { fontSize: 11.5, fontWeight: 700, color: "var(--muted)", letterSpacing: 0.5, textTransform: "uppercase" };
const field = { width: "100%", margin: "6px 0 16px", padding: "9px 12px", border: "1px solid #d5dce6", borderRadius: 8, fontSize: 13.5, outline: "none", background: "#fff", color: "var(--body)" };
const btn = { border: "1px solid #d5dce6", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", background: "#fff", color: "#3a4a63" };

// A closed list — free text produced "VN", "Vietnam" and "vietnam" as three
// different regions, which makes the field useless for grouping.
const REGIONS = [["VN", "VN — Vietnam"], ["AU", "AU — Australia"], ["UK", "UK — United Kingdom"], ["US", "US — United States"]];

export default function ProfilePage() {
  const [me, setMe] = useState(undefined);
  const [form, setForm] = useState(null);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const { user: sessionUser, refresh: refreshSession } = useSession();
  // Only admins can still sign in with a password, so only they have one to change.
  const canChangePassword = PASSWORD_LOGIN || (ADMIN_PASSWORD_LOGIN && sessionUser?.role === "admin");
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [pwErr, setPwErr] = useState("");
  const [pwDone, setPwDone] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);

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
      refreshSession();          // header name/colour update without a reload
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
      // Reload so we pick up the new blob URL — that's what busts the cache.
      await Promise.all([load(), refreshSession()]);
    } catch (e) { setErr(e.message); } finally { setBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const removeAvatar = async () => {
    setBusy(true); setErr("");
    try {
      await api("/api/profile/avatar", { method: "DELETE" });
      await Promise.all([load(), refreshSession()]);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const setPwField = (k, v) => { setPw((f) => ({ ...f, [k]: v })); setPwErr(""); setPwDone(false); };
  const changePassword = async (e) => {
    e?.preventDefault();
    if (pw.next !== pw.confirm) { setPwErr("The two new passwords don't match."); return; }
    setPwBusy(true); setPwErr(""); setPwDone(false);
    try {
      await api("/api/profile/password", { method: "PATCH", body: JSON.stringify({ current: pw.current, next: pw.next }) });
      setPw({ current: "", next: "", confirm: "" });
      setPwDone(true);
      // The new password retires this session too — full load so nothing
      // client-side keeps using the dead cookie.
      setTimeout(() => { window.location.href = "/login?changed=1"; }, 1200);
    } catch (e) { setPwErr(e.message); setPwBusy(false); }
  };

  const photo = avatarSrc(me);
  const shownColor = form?.avatar_color || defaultAvatarColor(me?.username || "");
  const initials = initialsOf(form?.name || me?.username || "?");

  return (
    <div style={{ minHeight: "100vh", paddingBottom: 40 }}>
      <AppHeader crumb="My profile" />
      <main style={{ maxWidth: 640, margin: "0 auto", padding: "24px 22px 0" }}>
        {!ready ? (
          <Loading label="Loading profile" />
        ) : !me ? (
          <div style={{ ...card, color: "#c92a2a", background: "#fff4f4", borderColor: "#ffc9c9" }}>
            {err || "Could not load your profile."} <Link href="/ideas" style={{ color: "#c92a2a", fontWeight: 700 }}>Back to board</Link>
          </div>
        ) : (
          <>
          <section style={card}>
            <h1 style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 20, color: "var(--ink)", margin: "0 0 4px" }}>My profile</h1>
            <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 18 }}>
              How you appear on ideas across the Hub. Your username and email are managed by an admin.
            </div>

            {/* Avatar */}
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 22 }}>
              {photo ? (
                <img
                  src={photo} alt="" width={72} height={72}
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
                    {photo ? "Replace photo" : "Upload photo"}
                  </button>
                  {photo && <button onClick={removeAvatar} disabled={busy} style={{ ...btn, color: "#d53c30", borderColor: "#f5c9c9" }}>Remove</button>}
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
            <select value={form.region} onChange={(e) => set("region", e.target.value)} style={field}>
              <option value="">Not set</option>
              {/* Keep whatever an older free-text entry held, so saving the form
                  doesn't silently wipe it. */}
              {form.region && !REGIONS.some(([code]) => code === form.region) && (
                <option value={form.region}>{form.region}</option>
              )}
              {REGIONS.map(([code, text]) => <option key={code} value={code}>{text}</option>)}
            </select>

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
            </div>
          </section>

          {/* Change password — your own account, no email step. Asking for an
              address here would let someone type a colleague's by mistake. */}
          {canChangePassword && (
            <form onSubmit={changePassword} style={{ ...card, marginTop: 16 }}>
              <h2 style={{ fontFamily: "var(--font-sora)", fontWeight: 700, fontSize: 16, color: "var(--ink)", margin: "0 0 4px" }}>Change password</h2>
              <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 16 }}>
                Changing it for <b style={{ color: "var(--ink)" }}>{me.username}</b>. You&apos;ll be signed out and asked to sign in again.
              </div>

              <div style={label}>Current password</div>
              <input type="password" value={pw.current} onChange={(e) => setPwField("current", e.target.value)} autoComplete="current-password" style={field} />

              <div style={label}>New password</div>
              <input type="password" value={pw.next} onChange={(e) => setPwField("next", e.target.value)} autoComplete="new-password" placeholder="at least 6 characters" style={field} />

              <div style={label}>Confirm new password</div>
              <input type="password" value={pw.confirm} onChange={(e) => setPwField("confirm", e.target.value)} autoComplete="new-password" style={field} />

              {pwErr && <div style={{ background: "#fff4f4", border: "1px solid #ffc9c9", color: "#c92a2a", borderRadius: 8, padding: "8px 12px", fontSize: 12.5, marginBottom: 12 }}>{pwErr}</div>}

              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button type="submit" disabled={pwBusy || !pw.current || !pw.next} style={{ ...btn, background: "var(--blue)", color: "#fff", border: "none", cursor: pwBusy ? "wait" : "pointer" }}>
                  {pwBusy ? "Changing…" : "Change password"}
                </button>
                {pwDone && <span style={{ fontSize: 12.5, color: "#2f9e44", fontWeight: 700 }}>Password changed — signing you out…</span>}
              </div>
            </form>
          )}
          </>
        )}
      </main>
    </div>
  );
}
