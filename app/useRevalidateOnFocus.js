"use client";

import { useEffect, useRef } from "react";

// Re-fetch when the tab regains focus. We don't have live updates, so this is
// the cheap way to pick up other people's changes: come back to the tab (or
// switch back from another window) and the view quietly refreshes itself —
// no full page reload, no polling.
//
// `enabled` lets a caller pause it (e.g. while a form is being edited, so a
// refresh can't wipe what someone is typing).
export default function useRevalidateOnFocus(fn, { enabled = true, minIntervalMs = 4000 } = {}) {
  const last = useRef(0);
  const cb = useRef(fn);
  const on = useRef(enabled);
  cb.current = fn;
  on.current = enabled;

  useEffect(() => {
    const run = () => {
      if (!on.current) return;
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - last.current < minIntervalMs) return;   // don't stampede
      last.current = now;
      cb.current?.();
    };
    window.addEventListener("focus", run);
    document.addEventListener("visibilitychange", run);
    return () => {
      window.removeEventListener("focus", run);
      document.removeEventListener("visibilitychange", run);
    };
  }, [minIntervalMs]);
}
