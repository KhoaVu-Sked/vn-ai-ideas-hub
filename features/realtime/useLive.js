"use client";

// Live updates for one scope — an idea id, or "board".
//
// The `enabled` flag is the same guard useRevalidateOnFocus takes, and it
// matters more here: pings arrive whenever someone else acts, not only when you
// change tabs. A refresh landing while a modal is open would wipe what the user
// is typing. So a ping arriving during an edit is remembered, not dropped, and
// applied the moment editing finishes.

import { useEffect, useRef } from "react";
import { subscribe } from "./client";

export default function useLive(scope, fn, { enabled = true } = {}) {
  const cb = useRef(fn);
  const on = useRef(enabled);
  const pending = useRef(false);
  cb.current = fn;

  useEffect(() => {
    const wasBlocked = !on.current;
    on.current = enabled;
    if (enabled && wasBlocked && pending.current) {
      pending.current = false;
      cb.current?.();
    }
  }, [enabled]);

  useEffect(() => {
    if (!scope) return undefined;
    return subscribe(scope, () => {
      if (!on.current) { pending.current = true; return; }
      cb.current?.();
    });
  }, [scope]);
}
