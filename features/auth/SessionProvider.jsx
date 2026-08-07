"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { endSession } from "@/lib/apiClient";

// The signed-in user, fetched once for the whole app instead of per page.
//
//   user === undefined → still loading
//   user === null      → not signed in (or the fetch failed)
//   user               → { id, username, role, name, avatar_color, avatar_url }
//
// Call refresh() after changing your own profile so the header avatar and
// display name update without a page reload.
const AUTH_PATHS = new Set(["/login", "/register", "/forgot", "/skedadmin"]);

const SessionCtx = createContext({ user: undefined, refresh: () => {} });

export function useSession() {
  return useContext(SessionCtx);
}

export default function SessionProvider({ children }) {
  const [user, setUser] = useState(undefined);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (res.ok) { setUser((await res.json()).user); return; }
      setUser(null);
      // 401 here means the session was retired — signed in elsewhere, or the
      // password changed. Same handling as any other 401.
      if (res.status === 401 && !AUTH_PATHS.has(window.location.pathname)) endSession();
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return <SessionCtx.Provider value={{ user, refresh }}>{children}</SessionCtx.Provider>;
}
