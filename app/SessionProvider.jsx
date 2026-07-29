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
const SessionCtx = createContext({ user: undefined, refresh: () => {} });

export function useSession() {
  return useContext(SessionCtx);
}

export default function SessionProvider({ children }) {
  const [user, setUser] = useState(undefined);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me");
      setUser(res.ok ? (await res.json()).user : null);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return <SessionCtx.Provider value={{ user, refresh }}>{children}</SessionCtx.Provider>;
}
