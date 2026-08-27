"use client";

// How many cards fit on screen without scrolling.
//
// A fixed page size is wrong on every screen but one: nine cards leaves a
// laptop half empty and still overflows a small window. So measure instead —
// how much room is left below the grid, and how tall one card actually is.
//
// Measured rather than calculated from constants, because the card's height
// depends on its content (a two-line title, a tag that wraps) and on the
// browser's font settings. Anything derived from hard-coded pixel values would
// drift the moment the card design changed.

import { useEffect, useState } from "react";

// Cards get shorter as the grid narrows, so a floor stops a small window from
// paginating down to one or two.
const MIN = 4;
const MAX = 60;
const FALLBACK = 9;   // before the first measurement, and if the DOM isn't there

export default function useFittedPageSize(gridRef, { deps = [], bottomGap = 96 } = {}) {
  const [size, setSize] = useState(FALLBACK);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid || typeof window === "undefined") return undefined;

    const measure = () => {
      const card = grid.firstElementChild;
      if (!card) return;

      const cardRect = card.getBoundingClientRect();
      const gridRect = grid.getBoundingClientRect();
      if (cardRect.height < 1 || cardRect.width < 1) return;   // not laid out yet

      const styles = getComputedStyle(grid);
      const rowGap = parseFloat(styles.rowGap) || 0;
      const colGap = parseFloat(styles.columnGap) || 0;

      // Columns from real geometry, not a media query — the grid uses auto-fill,
      // so only the browser knows how many it settled on.
      const columns = Math.max(1, Math.round(
        (gridRect.width + colGap) / (cardRect.width + colGap),
      ));

      // Room between the top of the grid and the bottom of the window, less
      // whatever the pager needs underneath.
      const available = window.innerHeight - gridRect.top - bottomGap;
      const rows = Math.max(1, Math.floor(
        (available + rowGap) / (cardRect.height + rowGap),
      ));

      const next = Math.min(MAX, Math.max(MIN, rows * columns));
      setSize((prev) => (prev === next ? prev : next));
    };

    measure();
    // Re-measure on resize, and when the grid itself changes shape — a filter
    // that shortens the cards should let another row in.
    const ro = new ResizeObserver(measure);
    ro.observe(grid);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridRef, bottomGap, ...deps]);

  return size;
}
