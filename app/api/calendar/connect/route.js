import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { requireUser } from "@/features/auth/guard";
import { connectUrl, calendarConfigured, resolveReturnPath } from "@/features/learning/googleCalendar";

const STATE_COOKIE = "gc_state";
const RETURN_COOKIE = "gc_return";

// GET /api/calendar/connect?returnTo=/learning-hub|/learning-hub/journey →
// send the (already signed-in) browser to Google's consent screen for
// Calendar scopes. Not a login flow — unlike /api/auth/google, this never
// creates a session; requireUser() must already pass, or there's nothing to
// attach a calendar connection to. returnTo (validated by resolveReturnPath,
// stored for the callback below to read back) is what lets each of this
// flow's three entry points land somewhere sensible instead of one
// hardcoded page.
export async function GET(request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const returnTo = resolveReturnPath(url.searchParams.get("returnTo"));

  try {
    await requireUser();
  } catch {
    return NextResponse.redirect(`${origin}/login`);
  }

  if (!calendarConfigured()) {
    return NextResponse.redirect(`${origin}${returnTo}?calendar=unconfigured`);
  }

  // CSRF: same pattern as /api/auth/google — a random value in a short-lived
  // httpOnly cookie, compared on return. returnTo rides along the same way
  // (a cookie, not just trusting Google to echo back a query param).
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(connectUrl({ origin, state }));
  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  };
  res.cookies.set(STATE_COOKIE, state, cookieOpts);
  res.cookies.set(RETURN_COOKIE, returnTo, cookieOpts);
  return res;
}
