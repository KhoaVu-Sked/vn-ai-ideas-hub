"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import AppHeader from "@/components/AppHeader";
import useDriveAuth from "@/features/tools/drive/useDriveAuth";
import { scanDrive, fetchAccountEmail, countOwnedFiles } from "@/features/tools/drive/scan";
import { planOperations, applyPlan, remindMailto } from "@/features/tools/drive/fix";
import { canWrite } from "@/features/tools/drive/scopes";
import { SCOPE_WRITE } from "@/features/tools/drive/constants";
import AccessDialog from "@/features/tools/drive/AccessDialog";
import PlanFixTime from "@/features/tools/drive/PlanFixTime";
import WatchedFolders from "@/features/tools/drive/WatchedFolders";
import SeveritySummary from "@/features/tools/drive/SeveritySummary";
import { toggleId, selectAll, clearWithin, resolveSelection, pruneSelection } from "@/features/tools/drive/select";
import { resolveTrails, folderLink } from "@/features/tools/drive/paths";
import { summarise, toggleLevel, filterByLevel } from "@/features/tools/drive/summary";
import { formatDate, ownerLabel } from "@/features/tools/drive/format";
import { pageOf, pageForNewSize, PER_PAGE_OPTIONS, DEFAULT_PER_PAGE } from "@/features/tools/drive/paginate";

const card = { background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, padding: 18 };

const LEVEL = {
  Critical: { bg: "#ffe3e3", fg: "#c92a2a", rail: "#e03131" },
  Warning:  { bg: "#fdf1dd", fg: "#b7791f", rail: "#f0a020" },
  Info:     { bg: "#e8f0ff", fg: "#2f5fd0", rail: "#4c7ef3" },
  OK:       { bg: "#e6f4ea", fg: "#1f7a3c", rail: "#37b24d" },
};
const ORDER = { Critical: 0, Warning: 1, Info: 2, OK: 3 };

/* The list is long — that is the whole reason it is paged — so the controls sit
   at both ends. With 50 rows on screen, a pager only at the top means scrolling
   back up to leave the page you just finished reading. */
function Pager({ shown, perPage, onPage, onResize, edge }) {
  if (shown.total <= PER_PAGE_OPTIONS[0]) return null;
  const step = { border: "1px solid var(--line)", background: "#fff", borderRadius: 7, padding: "4px 10px", fontSize: 12.5, fontWeight: 700 };
  const back = shown.page <= 1;
  const next = shown.page >= shown.pages;
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
      flexWrap: "wrap", padding: "10px 15px",
      [edge === "top" ? "borderBottom" : "borderTop"]: "1px solid var(--line)",
    }}>
      <span style={{ fontSize: 12.5, color: "var(--muted)" }}>
        Showing {shown.from}–{shown.to} of {shown.total}
      </span>
      <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <label style={{ fontSize: 12.5, color: "var(--muted)", display: "flex", alignItems: "center", gap: 6 }}>
          Per page
          <select value={perPage} onChange={(e) => onResize(Number(e.target.value))}
            style={{ fontSize: 12.5, padding: "4px 6px", borderRadius: 7, border: "1px solid var(--line)", background: "#fff", color: "var(--ink)" }}>
            {PER_PAGE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button onClick={() => onPage(shown.page - 1)} disabled={back} aria-label="Previous page"
            style={{ ...step, color: back ? "var(--faint)" : "var(--blue)", cursor: back ? "default" : "pointer" }}>
            Back
          </button>
          <span style={{ fontSize: 12.5, color: "var(--muted)", whiteSpace: "nowrap" }}>
            {shown.page} / {shown.pages}
          </span>
          <button onClick={() => onPage(shown.page + 1)} disabled={next} aria-label="Next page"
            style={{ ...step, color: next ? "var(--faint)" : "var(--blue)", cursor: next ? "default" : "pointer" }}>
            Next
          </button>
        </span>
      </span>
    </div>
  );
}

const MY_DRIVE = "https://drive.google.com/drive/my-drive";

/* Where the file sits, each folder its own link.

   Three states, not two. An empty trail means one of two different things, and
   showing both as "My Drive" would put a file that lives in a folder this
   account cannot read at the root of your own Drive — a wrong answer that looks
   like a confident one. `resolved` separates "still working" from "gave up",
   which a bare empty Map cannot: `.get()` returns undefined for both. */
function Trail({ trail, resolved, hasParent }) {
  if (!resolved) {
    return <span className="drive-trail"><span>Finding location…</span></span>;
  }
  if (!trail?.length) {
    return (
      <span className="drive-trail">
        {hasParent
          ? <span>Location unavailable</span>
          : <a href={MY_DRIVE} target="_blank" rel="noreferrer">My Drive</a>}
      </span>
    );
  }
  return (
    <span className="drive-trail">
      {trail.map((folder, i) => (
        <span key={folder.id} style={{ display: "contents" }}>
          {i > 0 && <span aria-hidden="true">›</span>}
          <a href={folderLink(folder.id)} target="_blank" rel="noreferrer">{folder.name}</a>
        </span>
      ))}
    </span>
  );
}

export default function DriveSharingCheckPage() {
  const { token, grantedScope, ready, err, configured, authorise, signOut } = useDriveAuth();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null);   // the file whose dialog is open
  const [applying, setApplying] = useState(false);
  const [note, setNote] = useState("");
  const [me, setMe] = useState("");

  // Resolved once per connection, not stored.
  useEffect(() => {
    if (!token) { setMe(""); return; }
    let cancelled = false;
    fetchAccountEmail(token).then((e) => { if (!cancelled) setMe(e); });
    return () => { cancelled = true; };
  }, [token]);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [trails, setTrails] = useState(null);
  const [owned, setOwned] = useState(null);   // total files owned, for the OK figure
  const [enriching, setEnriching] = useState(false);
  // Locations and the OK count arrive after the scan that asked for them. A
  // second scan started meanwhile must not have the first one's answers land on
  // top of its results, so every run carries a token and stale ones are dropped.
  const runId = useRef(0);
  const [scanErr, setScanErr] = useState("");
  const [planning, setPlanning] = useState(false);
  const [level, setLevel] = useState(null);       // the severity band being filtered to
  const [selected, setSelected] = useState(() => new Set());
  const [perPage, setPerPage] = useState(DEFAULT_PER_PAGE);
  const [page, setPage] = useState(1);

  const run = async () => {
    const id = ++runId.current;
    setBusy(true); setEnriching(false); setScanErr("");
    setResult(null); setTrails(null); setOwned(null); setPage(1); setLevel(null);
    setProgress({ stage: "link", found: 0 });
    let scan = null;
    try {
      scan = await scanDrive(token, setProgress);
      if (id !== runId.current) return;
      setResult(scan);
    } catch (e) {
      if (id !== runId.current) return;
      setScanErr(e.status === 403
        ? "Google refused the request. The account may not have granted Drive access."
        : e.message || "The scan could not finish.");
    } finally {
      if (id === runId.current) { setBusy(false); setProgress(null); }
    }

    // Locations and the OK figure both resolve after the findings are on
    // screen. Each is another walk of the Drive, and making the whole list wait
    // for them would hold back the part people actually came for.
    if (!scan?.findings?.length) return;
    setEnriching(true);
    try {
      const resolved = await resolveTrails(token, scan.findings);
      if (id === runId.current) setTrails(resolved);
    } catch {
      // An empty Map still counts as resolved: rows fall back to what is known
      // about their location rather than waiting for an answer already given up
      // on. Leaving trails null would strand every row on "Finding location…".
      if (id === runId.current) setTrails(new Map());
    }
    try {
      const count = await countOwnedFiles(token);
      if (id === runId.current) setOwned(count);
    } catch {
      if (id === runId.current) setOwned(null);   // OK stays unknown, never wrong
    } finally {
      if (id === runId.current) setEnriching(false);
    }
  };

  const openChange = (target) => {
    setNote("");
    const files = Array.isArray(target) ? target : [target];
    if (!files.length) return;
    // Ask for write access here rather than at connect time. Someone who only
    // wants to look never grants it.
    if (!canWrite(grantedScope)) { authorise(SCOPE_WRITE); return; }
    setEditing(files);
  };

  const applyChange = async (target) => {
    setApplying(true); setNote("");
    try {
      const done = [];
      const failed = [];
      // One at a time on purpose: each file gets its own plan, and one refusal
      // must not abandon the rest. Drive has no bulk permissions call anyway.
      for (const file of editing) {
        try {
          const { ops, summary } = planOperations(file, target, me);
          if (ops.length) await applyPlan(file.id, ops, token);
          done.push({ name: file.name, summary });
        } catch (e) {
          failed.push(`${file.name}: ${e.message || "refused"}`);
        }
      }
      setNote(
        editing.length === 1 && !failed.length
          ? `${done[0].name} — ${done[0].summary}`
          : [`${done.length} of ${editing.length} changed.`, ...failed].join(" "),
      );
      setEditing(null);
      setSelected(new Set());
      await run();                      // re-scan, so the list reflects Drive rather than hope
    } catch (e) {
      setNote(e.message || "The change could not be applied.");
    } finally {
      setApplying(false);
    }
  };

  const all = useMemo(() => (result ? [...result.findings].sort(
    (a, b) => (ORDER[a.level] - ORDER[b.level]) || a.name.localeCompare(b.name),
  ) : []), [result]);

  const summary = useMemo(
    () => summarise(all, {
      scanned: owned?.total,
      truncated: owned?.truncated,
      findingsTruncated: result?.truncated,
    }),
    [all, owned, result],
  );

  const rows = useMemo(() => filterByLevel(all, level), [all, level]);
  // Counted against everything, not the filtered view: a tick made under one
  // filter is still a tick after you change the filter, and a bar that said
  // "0 selected" while holding five would be lying about what Change will do.
  const picked = useMemo(() => resolveSelection(selected, all), [selected, all]);
  // Scoped to what is in front of you, for the select-all box only.
  const inView = useMemo(() => resolveSelection(selected, rows), [selected, rows]);

  // A scan rebuilds the findings; ticks for files that are gone must go with
  // them, or the bar counts files the list no longer has.
  useEffect(() => { setSelected((cur) => pruneSelection(cur, all)); }, [all]);

  // pageOf clamps, so the page number never has to be corrected here — a second
  // scan returning fewer findings lands on the last real page by itself, and so
  // does switching to a filter with fewer rows than the page you were on.
  const shown = pageOf(rows, page, perPage);
  const resize = (next) => { setPage(pageForNewSize(shown.page, perPage, next)); setPerPage(next); };
  const filter = (band) => { setLevel(toggleLevel(level, band)); setPage(1); };
  const tick = (id) => setSelected((cur) => toggleId(cur, id));
  const tickAll = () => setSelected((cur) =>
    inView.allSelected ? clearWithin(cur, rows) : selectAll(cur, rows));

  return (
    <>
      <AppHeader />
      <main style={{ maxWidth: 980, margin: "0 auto", padding: "30px 20px 44px" }}>
        <h1 style={{ fontFamily: "var(--font-sora)", fontWeight: 800, fontSize: 23, color: "var(--ink)", margin: 0 }}>
          Drive Sharing Check
        </h1>
        <p style={{ fontSize: 13.5, color: "var(--muted)", margin: "8px 0 20px", lineHeight: 1.6, maxWidth: 680 }}>
          Finds files shared by link or with the whole organisation. Reads names and sharing
          settings only — never contents, and nothing leaves your browser.
        </p>

        {!configured && (
          <div style={{ ...card, background: "#fff4f4", borderColor: "#ffc9c9", color: "#c92a2a", fontSize: 13.5, lineHeight: 1.6 }}>
            This tool is not configured yet. <b>NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID</b> needs to be set,
            and this site&rsquo;s address registered on that Google OAuth client, before anyone can sign in.
          </div>
        )}

        {configured && !token && (
          <div style={card}>
            <p style={{ margin: "0 0 14px", fontSize: 13.5, color: "var(--body)", lineHeight: 1.6 }}>
              Connect your Google account to scan. Separate from your TS Hub sign-in, and read-only.
            </p>
            <button onClick={() => authorise()} disabled={!ready}
              style={{ background: "var(--blue)", color: "#fff", border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 13.5, fontWeight: 700, cursor: ready ? "pointer" : "wait" }}>
              {ready ? "Connect Google Drive" : "Loading…"}
            </button>
            {err && err !== "not-configured" && (
              <p style={{ marginTop: 12, marginBottom: 0, fontSize: 12.5, color: "#c92a2a", lineHeight: 1.6 }}>{err}</p>
            )}
          </div>
        )}

        {token && (
          <>
            <div style={{ ...card, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
              <span style={{ fontSize: 13.5, color: "var(--body)" }}>
                {busy
                  ? `Scanning… ${progress?.found ?? 0} found so far`
                  : result ? `${result.counts.total} file${result.counts.total === 1 ? "" : "s"} shared more widely than named people`
                  : "Connected. Ready to scan."}
              </span>
              <span style={{ display: "flex", gap: 8 }}>
                {/* Only Critical and Warning go into the event, so the button
                    appears only when there is something worth booking time for. */}
                {summary.Critical + summary.Warning > 0 && !busy && (
                  <button onClick={() => setPlanning(true)}
                    style={{ background: "#fff", color: "var(--blue)", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 15px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                    Plan fix time
                  </button>
                )}
                <button onClick={run} disabled={busy || enriching}
                  style={{ background: "var(--blue)", color: "#fff", border: "none", borderRadius: 8, padding: "8px 15px", fontSize: 13, fontWeight: 700, cursor: busy || enriching ? "wait" : "pointer" }}>
                  {busy ? "Scanning…" : enriching ? "Finishing…" : result ? "Scan again" : "Scan my Drive"}
                </button>
                <button onClick={signOut} disabled={busy || enriching}
                  style={{ background: "#fff", color: "var(--muted)", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 13px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  Disconnect
                </button>
              </span>
            </div>

            {note && (
              <div style={{ ...card, fontSize: 13, marginBottom: 14, color: "var(--body)" }}>{note}</div>
            )}

            {/* Errors from a scope request made mid-session. The sign-in card
                renders `err`, but it is gone by then — a refused calendar or
                write prompt reported itself to nobody. */}
            {err && err !== "not-configured" && (
              <div style={{ ...card, background: "#fff4f4", borderColor: "#ffc9c9", color: "#c92a2a", fontSize: 13.5, marginBottom: 14 }}>{err}</div>
            )}

            {scanErr && (
              <div style={{ ...card, background: "#fff4f4", borderColor: "#ffc9c9", color: "#c92a2a", fontSize: 13.5, marginBottom: 14 }}>{scanErr}</div>
            )}

            {result?.truncated && (
              <div style={{ ...card, background: "#fdf1dd", borderColor: "#f5d9a8", color: "#b7791f", fontSize: 13, marginBottom: 14, lineHeight: 1.6 }}>
                This Drive is large enough that the scan stopped early. What is listed is real; it is not everything.
              </div>
            )}

            <SeveritySummary summary={summary} active={level} onToggle={filter} />

            {result && result.findings.length === 0 && !busy && (
              <div style={{ ...card, textAlign: "center", color: "var(--muted)", fontSize: 13.5 }}>
                Nothing shared by link or organisation-wide. Nothing to do.
              </div>
            )}

            {rows.length > 0 && (
              <div style={{ ...card, padding: 0, overflow: "hidden" }}>
                {(inView.selectable > 0 || picked.count > 0) && (
                  <div className="drive-bulk">
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--muted)", cursor: "pointer" }}>
                      <input type="checkbox" checked={inView.allSelected} onChange={tickAll}
                        aria-label={inView.allSelected ? "Clear what is shown" : "Select all changeable files shown"} />
                      {picked.count
                        ? `${picked.count} selected${
                            picked.count > inView.count ? ` · ${picked.count - inView.count} outside this filter` : ""
                          }`
                        : `Select all ${inView.selectable} you can change`}
                    </label>
                    {picked.count > 0 && (
                      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <button onClick={() => setSelected(new Set())}
                          style={{ border: "1px solid var(--line)", background: "#fff", color: "var(--muted)", borderRadius: 7, padding: "5px 11px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                          Clear
                        </button>
                        <button onClick={() => openChange(picked.files)}
                          style={{ border: "none", background: "var(--blue)", color: "#fff", borderRadius: 7, padding: "5px 12px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                          Change {picked.count} file{picked.count === 1 ? "" : "s"}
                        </button>
                      </span>
                    )}
                  </div>
                )}
                <Pager shown={shown} perPage={perPage} onPage={setPage} onResize={resize} edge="top" />

                {shown.items.map((f) => (
                  <div key={f.id} className="drive-row">
                    <span className="drive-rail" style={{ background: LEVEL[f.level].rail }} />

                    {/* A fixed column, so the content column still takes what is
                        left and the row needs no breakpoint. Files that are not
                        ours hold the space rather than shifting the row. */}
                    <span className="drive-tick">
                      {f.fixable && (
                        <input type="checkbox" checked={selected.has(f.id)}
                          onChange={() => tick(f.id)}
                          aria-label={`Select ${f.name}`} />
                      )}
                    </span>

                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                        <a href={f.link} target="_blank" rel="noreferrer"
                          style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ink)", textDecoration: "none", wordBreak: "break-word" }}>
                          {f.name}
                        </a>
                        <span style={{ fontSize: 10.5, fontWeight: 700, borderRadius: 999, padding: "2px 8px", whiteSpace: "nowrap", background: LEVEL[f.level].bg, color: LEVEL[f.level].fg }}>
                          {f.level}
                        </span>
                      </span>
                      <Trail trail={trails?.get(f.id)} resolved={trails !== null} hasParent={(f.parents?.length ?? 0) > 0} />
                      <span style={{ display: "block", fontSize: 12, color: "var(--muted)", marginTop: 4 }}>{f.label}</span>
                      <span className="drive-meta">
                        <span><i>Owner</i><b>{ownerLabel(f.owner, me)}</b></span>
                        <span><i>Created</i><b>{formatDate(f.createdTime)}</b></span>
                      </span>
                      {!f.fixable && (
                        <span style={{ display: "block", fontSize: 11.5, color: "var(--faint)", marginTop: 4 }}>
                          {/* Owning a file and being allowed to reshare it are
                              different permissions. Saying "ask the owner" on a
                              row that also says you own it reads as a bug. */}
                          {f.ownedByMe
                            ? "Yours, but this account cannot change its sharing"
                            : "Not yours to change — ask the owner"}
                        </span>
                      )}
                    </span>

                    {f.fixable ? (
                      <button onClick={() => openChange(f)}
                        style={{ border: "1px solid var(--line)", background: "#fff", color: "var(--blue)", borderRadius: 7, padding: "5px 11px", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                        Change
                      </button>
                    ) : (
                      remindMailto(f, me) ? (
                        <a href={remindMailto(f, me)}
                          style={{ border: "1px solid var(--line)", background: "#fff", color: "var(--muted)", borderRadius: 7, padding: "5px 11px", fontSize: 12, fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap" }}>
                          Remind owner
                        </a>
                      ) : <span />
                    )}
                  </div>
                ))}

                <Pager shown={shown} perPage={perPage} onPage={setPage} onResize={resize} edge="bottom" />
              </div>
            )}

            {/* A filter can empty the list while the scan itself found plenty. */}
            {all.length > 0 && rows.length === 0 && (
              <div style={{ ...card, textAlign: "center", color: "var(--muted)", fontSize: 13.5 }}>
                No {level} findings.{" "}
                <button onClick={() => filter(level)}
                  style={{ border: "none", background: "none", color: "var(--blue)", fontSize: 13.5, fontWeight: 700, cursor: "pointer", padding: 0 }}>
                  Show all {all.length}
                </button>
              </div>
            )}

            <WatchedFolders
              token={token}
              canEdit={canWrite(grantedScope)}
              onNeedScope={() => authorise(SCOPE_WRITE)}
            />
          </>
        )}

        {planning && (
          <PlanFixTime
            findings={all}
            token={token}
            grantedScope={grantedScope}
            onNeedScope={(want) => authorise(want)}
            onClose={() => setPlanning(false)}
          />
        )}

        {editing && (
          <AccessDialog
            files={editing}
            me={me}
            busy={applying}
            onCancel={() => setEditing(null)}
            onApply={applyChange}
          />
        )}
      </main>
    </>
  );
}
