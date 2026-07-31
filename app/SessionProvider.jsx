"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";

// The signed-in user, fetched once for the whole app instead of per page.
//
//   user === undefined → still loading
//   user === null      → not signed in (or the fetch failed)
//   user               → { id, username, role, name, avatar_color, avatar_url }
//
// Call refresh() after changing your own profile so the header avatar and
// display name update without a page reload.
const AUTH_PATHS = new Set(["/login", "/register", "/forgot"]);

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
      // 401 on a page that requires a session means the session was retired —
      // signing in elsewhere, or changing the password. Send them to sign in
      // rather than leaving a shell that 401s on every action.
      if (res.status === 401 && !AUTH_PATHS.has(window.location.pathname)) {
        window.location.href = "/login?ended=1";
      }
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return <SessionCtx.Provider value={{ user, refresh }}>{children}</SessionCtx.Provider>;
}
