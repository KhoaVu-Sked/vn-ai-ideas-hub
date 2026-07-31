"use client";

// One fetch helper for every page, so a dead session is handled in one place.
//
// A 401 is not a retryable error. Surfacing it like one gives you a "Try again"
// button that re-sends the same request, gets the same 401, and looks broken.
// Instead we end the session properly and go to the sign-in page.

let leaving = false;

// Clear the cookie first: middleware only reads the cookie's signature, so a
// retired-but-well-formed cookie would send us straight back here.
export async function endSession(reason = "ended") {
  if (leaving) return;              // parallel 401s must not each navigate
  leaving = true;
  // Never let a slow logout strand someone on a dead error screen — navigate
  // within a second and a half whatever happens.
  await Promise.race([
    fetch("/api/auth/logout", { method: "POST" }).catch(() => {}),
    new Promise((done) => setTimeout(done, 1500)),
  ]);
  window.location.href = `/login?${reason}=1`;
}

export async function api(path, init) {
  const isForm = init?.body instanceof FormData;
  const res = await fetch(path, {
    ...init,
    headers: isForm ? init?.headers : { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));

  if (res.status === 401) {
    endSession();
    // Still throw, so the caller stops — but the navigation is already underway.
    throw new Error(body.error || "Your session has ended. Please sign in again.");
  }
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}
