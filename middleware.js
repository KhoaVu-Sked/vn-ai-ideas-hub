import { NextResponse } from "next/server";
import { COOKIE_NAME, verifySessionToken } from "@/lib/session";

// Gate page routes: unauthenticated visitors are redirected to /login.
// API routes are NOT matched here — they enforce auth themselves (returning
// JSON 401s) so fetches never get an HTML redirect.
export async function middleware(request) {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  const user = await verifySessionToken(token);
  if (user) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except /login, /api/*, Next internals, and the favicon.
  matcher: ["/((?!login|api|_next/static|_next/image|favicon.ico).*)"],
};
