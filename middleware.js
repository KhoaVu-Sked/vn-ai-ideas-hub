import { NextResponse } from "next/server";
import { COOKIE_NAME, verifySessionToken } from "@/lib/session";
import { PASSWORD_LOGIN } from "@/lib/authMode";

// Pages you're meant to reach WITHOUT a session. Landing on a sign-in form
// while already signed in just reads as broken, so these bounce to the board.
const AUTH_PAGES = new Set(["/login", "/register", "/forgot"]);

// With Google as the only way in, these two have nothing to do — registration
// happens on first sign-in and there's no password to reset. Send them to
// /login rather than 404, since old bookmarks and emailed links point here.
const PASSWORD_PAGES = new Set(["/register", "/forgot"]);

// Middleware runs on the Edge and only checks the cookie's SIGNATURE — it has
// no database, so it can't know the session was retired (signed in elsewhere,
// password changed, or a cookie predating single-session).
//
// getUser() does know, and returns 401. Without the flags below the two
// disagree forever: the browser is sent to /login, middleware still reads the
// cookie as valid and sends it back — an endless redirect loop that also aborts
// any in-flight fetch. So when the browser says the session ended, believe it:
// bin the cookie and show the page.
const ENDED_FLAGS = ["ended", "changed", "reset"];

export async function middleware(request) {
  const { pathname, searchParams } = request.nextUrl;
  const user = await verifySessionToken(request.cookies.get(COOKIE_NAME)?.value);
  const isAuthPage = AUTH_PAGES.has(pathname);

  if (!PASSWORD_LOGIN && PASSWORD_PAGES.has(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = user ? "/" : "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (user && isAuthPage && ENDED_FLAGS.some((f) => searchParams.has(f))) {
    const res = NextResponse.next();
    res.cookies.set(COOKIE_NAME, "", { path: "/", maxAge: 0 });   // match how /api/auth/logout clears it
    return res;
  }

  // Signed in and not on an auth page, or signed out and on one → let it through.
  if (user ? !isAuthPage : isAuthPage) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = user ? "/" : "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except /api/*, Next internals and the app icon. The auth pages
  // ARE matched, so a signed-in visitor to /login gets redirected away.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
