"use client";

// Google authorisation for the Drive tool, in the browser.
//
// This is separate from signing in to the hub on purpose. Asking for Drive
// access at sign-in would mean everyone opening the ideas board is prompted for
// their Drive, which teaches people to click through consent screens. The
// prompt belongs at the moment someone opens this tool.
//
// The token lives in React state and nowhere else. Not localStorage, not a
// cookie, not this app's server. It dies with the tab, which is the intent.

import { useCallback, useEffect, useRef, useState } from "react";
import { SCOPE_READ } from "./constants";
import { pickScope, mergeScopes, scopesInclude } from "./scopes";

const GIS_SRC = "https://accounts.google.com/gsi/client";

function loadGis() {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GIS_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Google's sign-in library did not load")));
      return;
    }
    const el = document.createElement("script");
    el.src = GIS_SRC;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error("Google's sign-in library did not load"));
    document.head.appendChild(el);
  });
}

export default function useDriveAuth(scope = SCOPE_READ) {
  const [token, setToken] = useState(null);
  const [grantedScope, setGrantedScope] = useState("");
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState("");
  const clientRef = useRef(null);
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID || "";

  useEffect(() => {
    let cancelled = false;
    if (!clientId) { setErr("not-configured"); return undefined; }
    loadGis()
      .then(() => { if (!cancelled) setReady(true); })
      .catch((e) => { if (!cancelled) setErr(e.message); });
    return () => { cancelled = true; };
  }, [clientId]);

  const authorise = useCallback((wantScope) => {
    setErr("");
    if (!ready || !window.google?.accounts?.oauth2) return;
    // A new client per scope: Google caches the scope on the token client, so
    // reusing one silently re-requests the scope it was built with.
    // Everything already granted is re-requested alongside whatever is being
    // added. Google replaces the grant rather than extending it, so asking for
    // the calendar scope on its own would hand back a token that cannot read
    // Drive — Change and Watched folders would go dead with no error.
    const asking = mergeScopes(grantedScope, pickScope(wantScope, scope));
    if (!clientRef.current || clientRef.current.__scope !== asking) {
      clientRef.current = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: asking,
        callback: (res) => {
          if (res.error) {
            // Google refuses an unregistered origin with the same shape as a
            // blocked popup. Say which, because the tool it was ported from
            // lost hours to exactly this ambiguity.
            setErr(res.error === "popup_closed_by_user"
              ? "The Google window was closed before access was granted."
              : "Google refused the request. If this persists, this site's address is probably not registered on the OAuth client.");
            return;
          }
          const granted = res.scope || "";
          setToken(res.access_token || null);
          setGrantedScope(granted);

          // Consent is per-scope, and Google will happily return a token
          // carrying less than was asked for. Without this the tool sits in a
          // state where the gate says no and the prompt never reappears,
          // because the token itself arrived fine.
          const missing = asking.split(/\s+/).filter(Boolean).filter((w) => !scopesInclude(granted, w));
          if (missing.length) {
            setErr("Google granted only part of what was asked for. Try again and leave every box ticked.");
          }
        },
        // Without this, declining the prompt or having the popup blocked does
        // nothing at all on screen — the callback above never fires for either.
        error_callback: (e) => {
          setErr(e?.type === "popup_closed"
            ? "The Google window was closed before access was granted."
            : e?.type === "popup_failed_to_open"
            ? "The browser blocked Google's window. Allow popups for this site and try again."
            : "Google did not grant access.");
        },
      });
      clientRef.current.__scope = asking;
    }
    clientRef.current.requestAccessToken();
  }, [ready, clientId, scope, grantedScope]);

  // Hand the token back to Google and drop it here. Closing the tab does the
  // same thing; this just makes it deliberate.
  const signOut = useCallback(() => {
    if (token && window.google?.accounts?.oauth2) {
      try { window.google.accounts.oauth2.revoke(token, () => {}); } catch { /* best effort */ }
    }
    setToken(null);
    setGrantedScope("");
  }, [token]);

  return { token, grantedScope, ready, err, configured: Boolean(clientId), authorise, signOut };
}
