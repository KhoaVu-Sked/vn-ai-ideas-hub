import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { authUrl, googleConfigured } from "@/features/auth/google";

const STATE_COOKIE = "g_state";

// GET /api/auth/google → send the browser to Google's consent screen.
export async function GET(request) {
  const origin = new URL(request.url).origin;
  if (!googleConfigured()) {
    return NextResponse.redirect(`${origin}/login?sso=unconfigured`);
  }

  // CSRF: a random value in a short-lived httpOnly cookie, compared on return.
  // Without it, an attacker could feed us a code from their own Google account.
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(authUrl({ origin, state }));
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",   // must survive the cross-site redirect back from Google
    path: "/",
    maxAge: 600,
  });
  return res;
}
