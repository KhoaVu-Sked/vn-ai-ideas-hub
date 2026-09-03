import { NextResponse, after } from "next/server";
import { requireUser } from "@/features/auth/guard";
import { exchangeCodeForTokens, calendarConfigured } from "@/features/learning/googleCalendar";
import { saveCalendarConnection } from "@/features/learning/queries";
import { encrypt } from "@/lib/crypto";
import { audit } from "@/features/notifications/notify";

const STATE_COOKIE = "gc_state";

// GET /api/calendar/connect/callback?code=…&state=…
//
// Stores an encrypted refresh token against the CALLER's account — the
// caller must already be signed in (this never creates or touches a session,
// unlike /api/auth/google/callback). Redirects back to Up next either way,
// with ?calendar=<outcome> for the page to react to.
export async function GET(request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const fail = (reason) => {
    const res = NextResponse.redirect(`${origin}/learning/journey?calendar=${reason}`);
    res.cookies.set(STATE_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  };

  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.redirect(`${origin}/login`);
  }

  try {
    if (!calendarConfigured()) return fail("unconfigured");
    if (url.searchParams.get("error")) return fail("cancelled");

    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const expected = request.cookies.get(STATE_COOKIE)?.value;
    if (!code || !state || !expected || state !== expected) return fail("state");

    const tokens = await exchangeCodeForTokens({ code, origin });
    await saveCalendarConnection(user.uid, {
      refreshToken: encrypt(tokens.refresh_token),
      scope: tokens.scope || "",
    });

    after(() => audit({
      actorId: user.uid, actor: user.name || user.username,
      action: "connected Google Calendar",
      entity: "account", entityId: user.uid,
    }));

    const res = NextResponse.redirect(`${origin}/learning/journey?calendar=connected`);
    res.cookies.set(STATE_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  } catch (e) {
    console.error("calendar connect callback failed", e);
    // A schema error here means migration 027 hasn't been run on this
    // database — worth its own message, same reasoning as the sign-in
    // callback: the symptom otherwise points nowhere near the cause.
    if (["42703", "42P01", "23502"].includes(e?.code)
        || /column .* does not exist|relation .* does not exist/i.test(e.message || "")) {
      return fail("db");
    }
    return fail("failed");
  }
}
