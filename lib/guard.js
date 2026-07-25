// Route-handler auth guard. Reads the session cookie and verifies it.
// Node runtime (route handlers) — uses next/headers, so not for middleware.

import { cookies } from "next/headers";
import { COOKIE_NAME, verifySessionToken } from "@/lib/session";

// Returns { uid, username, role } or null.
export async function getUser() {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  return verifySessionToken(token);
}

// Returns the user, or throws a 401 error for jsonError() to surface.
export async function requireUser() {
  const user = await getUser();
  if (!user) {
    const e = new Error("You must be signed in.");
    e.status = 401;
    throw e;
  }
  return user;
}
