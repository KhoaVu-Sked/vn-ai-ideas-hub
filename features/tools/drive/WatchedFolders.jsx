"use client";

// Folders the scheduled watcher keeps an eye on.
//
// This page only edits the settings. The watching itself is Google Apps Script
// running on a Google timer as the user — it cannot live here, because hosting
// it would mean storing a refresh token. So this writes a file into the user's
// own Drive and the watcher reads it on its next run.

import { useCallback, useEffect, useState } from "react";
import { readSettings, writeSettings, lookupFolder, folderIdFrom } from "@/features/tools/drive/settings";

const card = { background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, padding: 18 };
const label = { fontSize: 11, fontWeight: 700, color: "var(--muted)", letterSpacing: ".05em", textTransform: "uppercase" };

export default function WatchedFolders({ token, canEdit, onNeedScope }) {
  const [settings, setSettings] = useState(null);
  const [names, setNames] = useState({});   // id -> name, resolved for display only
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    if (!token || !canEdit) return;
    try {
      const { settings: s } = await readSettings(token);
      setSettings(s);
      for (const id of s.watchlist) {
        lookupFolder(token, id).then((f) => f && setNames((n) => ({ ...n, [id]: f.name })));
      }
    } catch (e) {
      setMsg(e.message);
    }
  }, [token, canEdit]);

  useEffect(() => { load(); }, [load]);

  const save = async (next) => {
    setBusy(true); setMsg("");
    try {
      await writeSettings(token, next);
      setSettings(next);
      setMsg("Saved. The watcher picks this up on its next run.");
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    const id = folderIdFrom(input);
    if (!id) { setMsg("That does not look like a Drive folder link or id."); return; }
    if (settings.watchlist.includes(id)) { setMsg("That folder is already watched."); return; }
    setBusy(true); setMsg("");
    const folder = await lookupFolder(token, id);
    setBusy(false);
    if (!folder) { setMsg("No folder found with that link or id, or it is not a folder."); return; }
    setNames((n) => ({ ...n, [id]: folder.name }));
    setInput("");
    await save({ ...settings, watchlist: [...settings.watchlist, id] });
  };

  if (!canEdit) {
    return (
      <div style={{ ...card, marginTop: 16 }}>
        <p style={{ ...label, margin: "0 0 8px" }}>Watched folders</p>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>
          Watching folders writes a small settings file into your Drive, which needs the same
          access as changing sharing does.
        </p>
        <button onClick={onNeedScope}
          style={{ background: "#fff", border: "1px solid var(--line)", color: "var(--blue)", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          Grant access to manage watched folders
        </button>
      </div>
    );
  }

  if (!settings) return null;

  return (
    <div style={{ ...card, marginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
        <p style={{ ...label, margin: 0 }}>Watched folders</p>
        <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "var(--muted)", cursor: "pointer" }}>
          <input type="checkbox" checked={settings.paused} disabled={busy}
            onChange={(e) => save({ ...settings, paused: e.target.checked })} />
          Pause the watcher
        </label>
      </div>

      {settings.watchlist.length === 0 ? (
        <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>
          Nothing watched yet. Add a folder and the watcher will email you when its sharing changes —
          including folders other people own.
        </p>
      ) : (
        <div style={{ marginBottom: 12 }}>
          {settings.watchlist.map((id) => (
            <div key={id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "8px 0", borderTop: "1px solid var(--line)" }}>
              <span style={{ fontSize: 13, color: "var(--ink)", wordBreak: "break-all" }}>
                {names[id] || id}
              </span>
              <button disabled={busy}
                onClick={() => save({ ...settings, watchlist: settings.watchlist.filter((x) => x !== id) })}
                style={{ border: "1px solid var(--line)", background: "#fff", color: "var(--muted)", borderRadius: 7, padding: "4px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <input value={input} onChange={(e) => setInput(e.target.value)} disabled={busy}
          placeholder="Paste a Drive folder link"
          style={{ flex: 1, border: "1px solid var(--line)", borderRadius: 8, padding: "8px 11px", fontSize: 13 }} />
        <button onClick={add} disabled={busy || !input.trim()}
          style={{ background: "var(--blue)", border: "none", color: "#fff", borderRadius: 8, padding: "8px 15px", fontSize: 13, fontWeight: 700, cursor: busy ? "wait" : "pointer" }}>
          Add
        </button>
      </div>

      {msg && <p style={{ margin: "11px 0 0", fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5 }}>{msg}</p>}

      <p style={{ margin: "14px 0 0", fontSize: 11.5, color: "var(--faint)", lineHeight: 1.6, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
        The watcher itself is a Google Apps Script you install once, under your own account. It runs on
        Google&rsquo;s timer, not on this app&rsquo;s server, which is why no password or token of yours is
        stored anywhere. The script is in <code>apps-script/Code.gs</code>.
      </p>
    </div>
  );
}
