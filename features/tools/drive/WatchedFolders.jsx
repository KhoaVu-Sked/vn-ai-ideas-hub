"use client";

// Folders the scheduled watcher keeps an eye on.
//
// This page only edits the settings. The watching itself is Google Apps Script
// running on a Google timer as the user — it cannot live here, because hosting
// it would mean storing a refresh token. So this writes a file into the user's
// own Drive and the watcher reads it on its next run.
//
// Which is also why the schedule and the notification address belong here. They
// were readable by the watcher from the start but had no control anywhere, so
// the only way to change either was to edit Code.gs — while this panel promised
// "the watcher will email you" without saying when, or to what address.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  readSettings, writeSettings, lookupFolder, folderIdFrom, looksLikeDriveUrl,
  normaliseSchedule, notifyEmailProblem, describeSchedule, SCHEDULE_PLACEHOLDER,
  FREQUENCIES, DAYS, usesHour, usesDay,
} from "@/features/tools/drive/settings";
import { searchFolders } from "@/features/tools/drive/search";

const card = { background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, padding: 18 };
const label = { fontSize: 11, fontWeight: 700, color: "var(--muted)", letterSpacing: ".05em", textTransform: "uppercase" };
const field = { border: "1px solid var(--line)", borderRadius: 8, padding: "8px 11px", fontSize: 13, background: "#fff", color: "var(--ink)" };

// Long enough that typing a folder name does not fire a request per keystroke,
// short enough that the list does not feel like it is lagging behind.
const DEBOUNCE_MS = 220;

export default function WatchedFolders({ token, canEdit, onNeedScope }) {
  const [settings, setSettings] = useState(null);
  const [names, setNames] = useState({});   // id -> name, resolved for display only
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const [hits, setHits] = useState([]);
  const [searching, setSearching] = useState(false);
  const [active, setActive] = useState(-1);
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  // The address field edits a draft, never `settings` itself. Writing straight
  // into settings meant an address that failed validation still reached Drive
  // the moment anything else saved — changing the schedule, pausing, adding a
  // folder — because those all spread the current settings object.
  const [emailDraft, setEmailDraft] = useState("");

  const load = useCallback(async () => {
    if (!token || !canEdit) return;
    try {
      const { settings: s } = await readSettings(token);
      setSettings(s);
      setEmailDraft(s.notifyEmail);
      for (const id of s.watchlist) {
        lookupFolder(token, id).then((f) => f && setNames((n) => ({ ...n, [id]: f.name })));
      }
    } catch (e) {
      setMsg(e.message);
    }
  }, [token, canEdit]);

  useEffect(() => { load(); }, [load]);

  // A pasted link is a folder id, not a name to search for. Searching for it
  // returns nothing and the suggestion list would sit there empty over a
  // perfectly valid paste.
  useEffect(() => {
    if (!token || !canEdit) return undefined;
    const term = input.trim();
    // Only a pasted URL skips the search. A bare id would too if this asked
    // folderIdFrom, and an id is just 15+ id-shaped characters — which plenty
    // of real folder names are, leaving them unsearchable.
    if (!term || looksLikeDriveUrl(term)) { setHits([]); setSearching(false); return undefined; }

    const controller = new AbortController();
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const found = await searchFolders(token, term, { signal: controller.signal });
        if (cancelled) return;
        setHits(found);
        setActive(-1);
        setOpen(true);
      } catch (e) {
        if (!cancelled && e.name !== "AbortError") setHits([]);
      } finally {
        // Only the live search may clear the indicator. An aborted one settling
        // late would hide it while its replacement was still in flight.
        if (!cancelled) setSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => { cancelled = true; clearTimeout(timer); controller.abort(); };
  }, [input, token, canEdit]);

  // Clicking away closes the suggestions without choosing one.
  useEffect(() => {
    const away = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, []);

  const save = async (next) => {
    setBusy(true); setMsg("");
    try {
      await writeSettings(token, next);
      setSettings(next);
      setEmailDraft(next.notifyEmail);
      setMsg("Saved. The watcher picks this up on its next run.");
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  };

  const watch = async (folder) => {
    if (settings.watchlist.includes(folder.id)) { setMsg("That folder is already watched."); return; }
    setNames((n) => ({ ...n, [folder.id]: folder.name }));
    setInput(""); setHits([]); setOpen(false);
    await save({ ...settings, watchlist: [...settings.watchlist, folder.id] });
  };

  const add = async () => {
    // Only a suggestion picked with the arrow keys counts. Hover deliberately
    // does not set `active`: it did, and then pressing Add — or Enter — watched
    // whichever folder the pointer happened to be resting over instead of what
    // was typed. Hover styling is CSS's job, in .drive-suggest button:hover.
    if (open && active >= 0 && hits[active]) return watch(hits[active]);

    // Typed text with results waiting is a name, even when it happens to be
    // id-shaped — plenty of folder names are. Treating it as an id here sent
    // ProjectDocuments2026 to lookupFolder and failed with "no folder found"
    // while the folder itself sat in the list underneath.
    if (!looksLikeDriveUrl(input) && hits.length) {
      if (hits.length === 1) return watch(hits[0]);
      setMsg("Pick a folder from the list.");
      return;
    }

    const id = folderIdFrom(input);
    if (!id) {
      setMsg("That does not look like a Drive folder link or id.");
      return;
    }
    if (settings.watchlist.includes(id)) { setMsg("That folder is already watched."); return; }
    setBusy(true); setMsg("");
    const folder = await lookupFolder(token, id);
    setBusy(false);
    if (!folder) { setMsg("No folder found with that link or id, or it is not a folder."); return; }
    await watch(folder);
  };

  const onKey = (e) => {
    if (!open || !hits.length) {
      if (e.key === "Enter") { e.preventDefault(); add(); }
      return;
    }
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => (i + 1) % hits.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => (i <= 0 ? hits.length : i) - 1); }
    else if (e.key === "Enter") { e.preventDefault(); add(); }
    else if (e.key === "Escape") { setOpen(false); setActive(-1); }
  };

  // Choosing anything here is what turns "unset" into a schedule, so the patch
  // is applied over the placeholder rather than over null.
  const setSchedule = (patch) => {
    const base = settings.schedule || SCHEDULE_PLACEHOLDER;
    save({ ...settings, schedule: normaliseSchedule({ ...base, ...patch }) });
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

  const chosen = normaliseSchedule(settings.schedule);
  const schedule = chosen || SCHEDULE_PLACEHOLDER;
  const emailProblem = notifyEmailProblem(emailDraft);

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

      <div ref={boxRef} style={{ position: "relative", display: "flex", gap: 8 }}>
        <input
          value={input}
          onChange={(e) => { setInput(e.target.value); setMsg(""); }}
          onKeyDown={onKey}
          onFocus={() => hits.length && setOpen(true)}
          disabled={busy}
          placeholder="Search your folders by name, or paste a link"
          role="combobox"
          aria-expanded={open && hits.length > 0}
          aria-controls="drive-folder-suggestions"
          aria-autocomplete="list"
          style={{ ...field, flex: 1 }}
        />
        <button onClick={add} disabled={busy || !input.trim()}
          style={{ background: "var(--blue)", border: "none", color: "#fff", borderRadius: 8, padding: "8px 15px", fontSize: 13, fontWeight: 700, cursor: busy ? "wait" : "pointer" }}>
          Add
        </button>

        {open && hits.length > 0 && (
          <div className="drive-suggest" id="drive-folder-suggestions" role="listbox">
            {hits.map((f, i) => {
              const already = settings.watchlist.includes(f.id);
              return (
                <button
                  key={f.id}
                  role="option"
                  aria-selected={i === active}
                  data-active={i === active}
                  onClick={() => (already ? setMsg("That folder is already watched.") : watch(f))}
                  style={{ opacity: already ? 0.55 : 1 }}
                >
                  <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>
                    {f.name}
                  </span>
                  <span style={{ display: "block", fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>
                    {already ? "Already watched" : f.ownedByMe ? "Yours" : `Owned by ${f.owner || "someone else"}`}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {searching && (
        <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--faint)" }}>Searching your folders…</p>
      )}

      {msg && <p style={{ margin: "11px 0 0", fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5 }}>{msg}</p>}

      <div style={{ borderTop: "1px solid var(--line)", marginTop: 16, paddingTop: 14 }}>
        <p style={{ ...label, margin: "0 0 10px" }}>When it checks, and who it tells</p>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <select
            value={chosen ? schedule.frequency : ""}
            disabled={busy}
            onChange={(e) => setSchedule({ frequency: e.target.value })}
            aria-label="How often the watcher checks"
            style={field}
          >
            {/* Until someone picks, the file holds no schedule and the script's
                own setting stands. Showing a frequency here before that would
                claim a cadence this panel has not set. */}
            {!chosen && <option value="">Leave as the script has it</option>}
            {FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>

          {chosen && usesDay(schedule.frequency) && (
            <select value={schedule.dayOfWeek} disabled={busy}
              onChange={(e) => setSchedule({ dayOfWeek: e.target.value })}
              aria-label="Which day" style={field}>
              {DAYS.map((d) => (
                <option key={d} value={d}>{d.charAt(0) + d.slice(1).toLowerCase()}</option>
              ))}
            </select>
          )}

          {chosen && usesHour(schedule.frequency) && (
            <select value={schedule.hour} disabled={busy}
              onChange={(e) => setSchedule({ hour: Number(e.target.value) })}
              aria-label="What time" style={field}>
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>
              ))}
            </select>
          )}
        </div>

        <label style={{ display: "block", marginTop: 12 }}>
          <span style={{ display: "block", fontSize: 12.5, color: "var(--muted)", marginBottom: 5 }}>
            Send the email to
          </span>
          <input
            value={emailDraft}
            disabled={busy}
            onChange={(e) => setEmailDraft(e.target.value)}
            onBlur={() => {
              const next = emailDraft.trim();
              if (next === settings.notifyEmail || notifyEmailProblem(next)) return;
              save({ ...settings, notifyEmail: next });
            }}
            placeholder="Your own Google address"
            style={{ ...field, width: "100%", maxWidth: 380 }}
          />
        </label>
        {emailProblem && (
          <p style={{ margin: "6px 0 0", fontSize: 12, color: "#c92a2a" }}>{emailProblem}</p>
        )}

        <p style={{ margin: "12px 0 0", fontSize: 12.5, color: "var(--muted)", lineHeight: 1.6 }}>
          {describeSchedule(settings.schedule)}, in the timezone set on the Apps Script project rather
          than yours. Email goes out only when something has actually changed since the last check,
          so a quiet week is silent rather than reassuring.
        </p>
      </div>

      <p style={{ margin: "14px 0 0", fontSize: 11.5, color: "var(--faint)", lineHeight: 1.6, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
        The watcher itself is a Google Apps Script you install once, under your own account. It runs on
        Google&rsquo;s timer, not on this app&rsquo;s server, which is why no password or token of yours is
        stored anywhere. Changing the schedule here takes effect on its next run. The script is in{" "}
        <code>apps-script/Code.gs</code>.
      </p>
    </div>
  );
}
