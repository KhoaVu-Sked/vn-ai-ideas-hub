// Route-handler auth guard. Reads the session cookie and verifies it.
// Node runtime (route handlers) — uses next/headers, so not for middleware.

import { cookies } from "next/headers";
import { COOKIE_NAME, verifySessionToken } from "@/lib/session";
import { getSessionId } from "@/lib/db";

// Returns { uid, username, role, sid } or null.
//
// A valid signature isn't enough: the token's session id must still be the one
// stored on the account. Only the newest sign-in matches, so signing in
// elsewhere — or changing a password — retires every other session. This lives
// in getUser rather than requireUser so /api/auth/me sees it too; that 401 is
// what tells the browser to go back to the sign-in page.
export async function getUser() {
  const store = await cookies();
  const user = await verifySessionToken(store.get(COOKIE_NAME)?.value);
  if (!user?.uid || !user.sid) return null;
  try {
    return (await getSessionId(user.uid)) === user.sid ? user : null;
  } catch {
    // Fail closed. If the lookup itself fails — migration not yet run, database
    // unreachable — treat it as signed out rather than 500ing every route.
    return null;
  }
}

// Returns the user, or throws a 401 error for jsonError() to surface.
export async function requireUser() {
  const user = await getUser();
  if (!user) {
    const e = new Error("Your session has ended. Please sign in again.");
    e.status = 401;
    throw e;
  }
  return user;
}

// Returns the user if they're an admin, else throws 401/403.
export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "admin") {
    const e = new Error("Admins only.");
    e.status = 403;
    throw e;
  }
  return user;
}
