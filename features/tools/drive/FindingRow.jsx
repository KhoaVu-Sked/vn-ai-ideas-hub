"use client";

// One file in a band.
//
// The band heading already says who can open these and what they can do with
// them, so the row does not repeat it: no severity chip, no coloured rail, no
// second copy of "Everyone at skedulo.com can edit". What is left is only what
// differs between one row and the next — which file, where it lives, whose it
// is, and how to close it.
//
// The exception is the verb. Inside "Anyone with the link" some files can be
// read and some can be edited, and that difference decides which to open first.

import Trail from "@/features/tools/drive/Trail";
import { verbFor } from "@/features/tools/drive/classify";
import { remindMailto } from "@/features/tools/drive/fix";
import { formatDate, ownerLabel } from "@/features/tools/drive/format";

const action = {
  borderRadius: 7, padding: "5px 11px", fontSize: 12, fontWeight: 700,
  whiteSpace: "nowrap", textDecoration: "none", cursor: "pointer",
};

export default function FindingRow({ f, me, trail, trailsResolved, checked, onTick, onChange, urgent }) {
  return (
    <div className="drive-row">
      <span className="drive-tick">
        {f.fixable && (
          <input type="checkbox" checked={checked} onChange={() => onTick(f.id)}
            aria-label={`Select ${f.name}`} />
        )}
      </span>

      <span style={{ minWidth: 0 }}>
        <span style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <a href={f.link} target="_blank" rel="noreferrer"
            style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ink)", textDecoration: "none", wordBreak: "break-word" }}>
            {f.name}
          </a>
          <span style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" }}>
            can {verbFor(f.permRole)}
          </span>
        </span>
        <Trail trail={trail} resolved={trailsResolved} hasParent={(f.parents?.length ?? 0) > 0} />
        <span className="drive-meta">
          <span><i>Owner</i><b>{ownerLabel(f.owner, me)}</b></span>
          <span><i>Created</i><b>{formatDate(f.createdTime)}</b></span>
        </span>
        {!f.fixable && (
          <span style={{ display: "block", fontSize: 11.5, color: "var(--faint)", marginTop: 4 }}>
            {/* Owning a file and being allowed to reshare it are different
                permissions. Saying "ask the owner" on a row that also says you
                own it reads as a bug. */}
            {f.ownedByMe
              ? "Yours, but this account cannot change its sharing"
              : "Not yours to change — ask the owner"}
          </span>
        )}
      </span>

      {f.fixable ? (
        // Filled only in the band that has a deadline. Everywhere else a filled
        // button on every row would make none of them look urgent.
        <button onClick={() => onChange(f)}
          style={urgent
            ? { ...action, border: "1px solid var(--blue)", background: "var(--blue)", color: "#fff" }
            : { ...action, border: "1px solid var(--line)", background: "#fff", color: "var(--blue)" }}>
          Change
        </button>
      ) : (
        remindMailto(f, me)
          ? <a href={remindMailto(f, me)}
              style={{ ...action, border: "1px solid var(--line)", background: "#fff", color: "var(--muted)" }}>
              Remind owner
            </a>
          : <span />
      )}
    </div>
  );
}
