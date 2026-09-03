import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { requireUser } from "@/features/auth/guard";
import { connectUrl, calendarConfigured } from "@/features/learning/googleCalendar";

const STATE_COOKIE = "gc_state";

// GET /api/calendar/connect → send the (already signed-in) browser to
// Google's consent screen for Calendar scopes. Not a login flow — unlike
// /api/auth/google, this never creates a session; requireUser() must already
// pass, or there's nothing to attach a calendar connection to.
export async function GET(request) {
  const origin = new URL(request.url).origin;

  try {
    await requireUser();
  } catch {
    return NextResponse.redirect(`${origin}/login`);
  }

  if (!calendarConfigured()) {
    return NextResponse.redirect(`${origin}/learning/journey?calendar=unconfigured`);
  }

  // CSRF: same pattern as /api/auth/google — a random value in a short-lived
  // httpOnly cookie, compared on return.
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(connectUrl({ origin, state }));
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
