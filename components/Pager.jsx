"use client";

import { useState, useEffect, useMemo } from "react";

// Paging for the admin lists. The rows are already in memory — every one of
// these screens fetches its whole table in one go — so this slices rather than
// refetches. If any of them outgrows a single fetch, this is the seam to move
// server-side: the component's shape wouldn't change.

export const PAGE_SIZES = [10, 25, 50];

export function usePaging(total, initial = 25) {
  const [size, setSize] = useState(initial);
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(total / size));

  // Deleting the last row of the last page, or narrowing a filter, must not
  // strand you on a page that no longer exists.
  useEffect(() => { if (page > pages) setPage(pages); }, [page, pages]);

  const from = (page - 1) * size;
  return useMemo(() => ({
    size, page, pages, from,
    setSize: (n) => { setSize(n); setPage(1); },   // a new size invalidates the offset
    setPage,
    slice: (rows) => rows.slice(from, from + size),
  }), [size, page, pages, from]);
}

const btn = (disabled) => ({
  border: "1px solid #d5dce6", background: "#fff",
  color: disabled ? "#b6bfcc" : "#44536b",
  borderRadius: 7, padding: "5px 11px", fontSize: 12, fontWeight: 700,
  cursor: disabled ? "default" : "pointer",
});

export default function Pager({ p, total, noun = "item" }) {
  // One page of a short list needs no controls, but the size selector still
  // earns its place once a list is long enough to want narrowing.
  if (total <= PAGE_SIZES[0]) return null;
  const first = total === 0 ? 0 : p.from + 1;
  const last = Math.min(p.from + p.size, total);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
      <span style={{ fontSize: 12, color: "var(--muted)" }}>
        {first}–{last} of {total} {noun}{total === 1 ? "" : "s"}
      </span>
      <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
        <label style={{ fontSize: 12, color: "var(--muted)" }}>
          Show{" "}
          <select
            value={p.size}
            onChange={(e) => p.setSize(Number(e.target.value))}
            style={{ border: "1px solid #d5dce6", borderRadius: 6, padding: "3px 6px", fontSize: 12, color: "#44536b", background: "#fff" }}
          >
            {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <button onClick={() => p.setPage(p.page - 1)} disabled={p.page <= 1} style={btn(p.page <= 1)}>Prev</button>
        <span style={{ fontSize: 12, color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>{p.page} / {p.pages}</span>
        <button onClick={() => p.setPage(p.page + 1)} disabled={p.page >= p.pages} style={btn(p.page >= p.pages)}>Next</button>
      </span>
    </div>
  );
}
