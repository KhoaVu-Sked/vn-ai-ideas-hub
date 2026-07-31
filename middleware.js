import { NextResponse } from "next/server";
import { COOKIE_NAME, verifySessionToken } from "@/lib/session";

// Pages you're meant to reach WITHOUT a session. Landing on a sign-in form
// while already signed in just reads as broken, so these bounce to the board.
const AUTH_PAGES = new Set(["/login", "/register", "/forgot"]);

// Gate page routes. API routes are NOT matched here — they enforce auth
// themselves (returning JSON 401s) so fetches never get an HTML redirect.
export async function middleware(request) {
  const { pathname } = request.nextUrl;
  const user = await verifySessionToken(request.cookies.get(COOKIE_NAME)?.value);
  const isAuthPage = AUTH_PAGES.has(pathname);

  // Signed in and not on an auth page, or signed out and on one → let it through.
  if (user ? !isAuthPage : isAuthPage) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = user ? "/" : "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except /api/*, Next internals and the app icon. The auth pages
  // ARE matched now, so a signed-in visitor to /login gets redirected away.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
