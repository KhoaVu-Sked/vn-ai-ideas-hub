"use client";

// One fetch helper for every page, so a dead session is handled in one place.
//
// A 401 is not retryable. The old behaviour surfaced it as an ordinary error,
// which gave you "Your session has ended. Please sign in again." next to a
// Try again button that re-sent the same request and failed identically.
// If the message says sign in again, the app should take you there.

// Identifies this browser tab, so the realtime layer can tell a change this tab
// caused from one somebody else caused. Per tab, not per user: two tabs open on
// the same account should still update each other.
export const CLIENT_ID =
  typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID()
  : String(Math.random()).slice(2);

let leaving = false;

export function endSession(reason = "ended") {
  if (leaving) return;              // parallel 401s must not each navigate
  leaving = true;
  // Not awaited: middleware also clears the cookie when it sees ?ended, so
  // there's nothing to wait for and waiting is what let the error card render.
  fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
  // replace(), not href: the dead page shouldn't come back on Back.
  window.location.replace(`/login?${reason}=1`);
}

export async function api(path, init) {
  const isForm = init?.body instanceof FormData;
  const res = await fetch(path, {
    ...init,
    headers: isForm
      ? { "X-Client-Id": CLIENT_ID, ...(init?.headers || {}) }
      : { "Content-Type": "application/json", "X-Client-Id": CLIENT_ID, ...(init?.headers || {}) },
  });

  if (res.status === 401) {
    endSession();
    // Deliberately never settles. Throwing here would run every caller's catch
    // and paint an error with a Retry button on a page we are already leaving;
    // resolving would feed them empty data. Hanging leaves the loading state up
    // for the moment it takes the browser to navigate, which is the truth.
    return new Promise(() => {});
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}
