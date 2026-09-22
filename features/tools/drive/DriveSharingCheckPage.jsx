"use client";

import { useEffect, useState } from "react";
import AppHeader from "@/components/AppHeader";
import useDriveAuth from "@/features/tools/drive/useDriveAuth";
import { scanDrive, fetchAccountEmail } from "@/features/tools/drive/scan";
import { planOperations, applyPlan, remindMailto } from "@/features/tools/drive/fix";
import { canWrite } from "@/features/tools/drive/scopes";
import { SCOPE_WRITE } from "@/features/tools/drive/constants";
import AccessDialog from "@/features/tools/drive/AccessDialog";
import WatchedFolders from "@/features/tools/drive/WatchedFolders";
import { pageOf, pageForNewSize, PER_PAGE_OPTIONS, DEFAULT_PER_PAGE } from "@/features/tools/drive/paginate";

const card = { background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, padding: 18 };

const LEVEL = {
  Critical: { bg: "#ffe3e3", fg: "#c92a2a" },
  Warning:  { bg: "#fdf1dd", fg: "#b7791f" },
  Info:     { bg: "#e8f0ff", fg: "#2f5fd0" },
  OK:       { bg: "#e6f4ea", fg: "#1f7a3c" },
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
  const [scanErr, setScanErr] = useState("");
  const [perPage, setPerPage] = useState(DEFAULT_PER_PAGE);
  const [page, setPage] = useState(1);

  const run = async () => {
    setBusy(true); setScanErr(""); setResult(null); setPage(1);
    setProgress({ stage: "link", found: 0 });
    try {
      setResult(await scanDrive(token, setProgress));
    } catch (e) {
      setScanErr(e.status === 403
        ? "Google refused the request. The account may not have granted Drive access."
        : e.message || "The scan could not finish.");
    } finally {
      setBusy(false); setProgress(null);
    }
  };

  const openChange = (f) => {
    setNote("");
    // Ask for write access here rather than at connect time. Someone who only
    // wants to look never grants it.
    if (!canWrite(grantedScope)) { authorise(SCOPE_WRITE); return; }
    setEditing(f);
  };

  const applyChange = async (target) => {
    setApplying(true); setNote("");
    try {
      const { ops, summary } = planOperations(editing, target, me);
      if (ops.length) await applyPlan(editing.id, ops, token);
      setNote(`${editing.name} — ${summary}`);
      setEditing(null);
      await run();                      // re-scan, so the list reflects Drive rather than hope
    } catch (e) {
      setNote(e.message || "The change could not be applied.");
    } finally {
      setApplying(false);
    }
  };

  const rows = result ? [...result.findings].sort(
    (a, b) => (ORDER[a.level] - ORDER[b.level]) || a.name.localeCompare(b.name),
  ) : [];

  // pageOf clamps, so the page number never has to be corrected here — a second
  // scan returning fewer findings lands on the last real page by itself.
  const shown = pageOf(rows, page, perPage);
  const resize = (next) => { setPage(pageForNewSize(shown.page, perPage, next)); setPerPage(next); };

  return (
    <>
      <AppHeader />
      <main style={{ maxWidth: 980, margin: "0 auto", padding: "30px 20px 44px" }}>
        <h1 style={{ fontFamily: "var(--font-sora)", fontWeight: 800, fontSize: 23, color: "var(--ink)", margin: 0 }}>
          Drive Sharing Check
        </h1>
        <p style={{ fontSize: 13.5, color: "var(--muted)", margin: "8px 0 20px", lineHeight: 1.6, maxWidth: 680 }}>
          Finds files in your Drive shared by link or with the whole organisation. It reads names and
          sharing settings only, never file contents, and nothing it finds leaves your browser.
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
              Connect your Google account to scan your Drive. This is separate from signing in to TS Hub,
              and it asks for read-only access.
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
                <button onClick={run} disabled={busy}
                  style={{ background: "var(--blue)", color: "#fff", border: "none", borderRadius: 8, padding: "8px 15px", fontSize: 13, fontWeight: 700, cursor: busy ? "wait" : "pointer" }}>
                  {busy ? "Scanning…" : result ? "Scan again" : "Scan my Drive"}
                </button>
                <button onClick={signOut} disabled={busy}
                  style={{ background: "#fff", color: "var(--muted)", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 13px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  Disconnect
                </button>
              </span>
            </div>

            {note && (
              <div style={{ ...card, fontSize: 13, marginBottom: 14, color: "var(--body)" }}>{note}</div>
            )}

            {scanErr && (
              <div style={{ ...card, background: "#fff4f4", borderColor: "#ffc9c9", color: "#c92a2a", fontSize: 13.5, marginBottom: 14 }}>{scanErr}</div>
            )}

            {result?.truncated && (
              <div style={{ ...card, background: "#fdf1dd", borderColor: "#f5d9a8", color: "#b7791f", fontSize: 13, marginBottom: 14, lineHeight: 1.6 }}>
                This Drive is large enough that the scan stopped early. What is listed is real; it is not everything.
              </div>
            )}

            {result && result.findings.length === 0 && !busy && (
              <div style={{ ...card, textAlign: "center", color: "var(--muted)", fontSize: 13.5 }}>
                Nothing shared by link or organisation-wide. Nothing to do.
              </div>
            )}

            {rows.length > 0 && (
              <div style={{ ...card, padding: 0, overflow: "hidden" }}>
                <Pager shown={shown} perPage={perPage} onPage={setPage} onResize={resize} edge="top" />
                {shown.items.map((f, i) => (
                  <div key={f.id} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 15px", borderTop: i ? "1px solid var(--line)" : "none" }}>
                    <span style={{ fontSize: 10.5, fontWeight: 700, borderRadius: 999, padding: "3px 9px", whiteSpace: "nowrap", ...{ background: LEVEL[f.level].bg, color: LEVEL[f.level].fg } }}>
                      {f.level}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <a href={f.link} target="_blank" rel="noreferrer"
                        style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ink)", textDecoration: "none", wordBreak: "break-word" }}>
                        {f.name}
                      </a>
                      <span style={{ display: "block", fontSize: 12, color: "var(--muted)", marginTop: 3 }}>{f.label}</span>
                      {!f.fixable && (
                        <span style={{ display: "block", fontSize: 11.5, color: "var(--faint)", marginTop: 3 }}>
                          Owned by {f.owner || "someone else"} — listed only, not yours to change
                        </span>
                      )}
                    </span>
                    {f.fixable ? (
                      <button onClick={() => openChange(f)}
                        style={{ border: "1px solid var(--line)", background: "#fff", color: "var(--blue)", borderRadius: 7, padding: "5px 11px", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                        Change
                      </button>
                    ) : (
                      remindMailto(f, me) && (
                        <a href={remindMailto(f, me)}
                          style={{ border: "1px solid var(--line)", background: "#fff", color: "var(--muted)", borderRadius: 7, padding: "5px 11px", fontSize: 12, fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap" }}>
                          Remind owner
                        </a>
                      )
                    )}
                  </div>
                ))}
                <Pager shown={shown} perPage={perPage} onPage={setPage} onResize={resize} edge="bottom" />
              </div>
            )}
            <WatchedFolders
              token={token}
              canEdit={canWrite(grantedScope)}
              onNeedScope={() => authorise(SCOPE_WRITE)}
            />
          </>
        )}

        {editing && (
          <AccessDialog
            file={editing}
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
