import { NextResponse, after } from "next/server";
import { identityFromCode, googleConfigured } from "@/features/auth/google";
import { findOrCreateSsoAccount, rotateSessionId } from "@/features/auth/queries";
import { signSession, COOKIE_NAME, cookieOptions } from "@/features/auth/session";
import { audit } from "@/features/notifications/notify";

const STATE_COOKIE = "g_state";

// GET /api/auth/google/callback?code=…&state=…
//
// Ends with the same session cookie the password flow issues, so single-session,
// the idle timeout and requireUser() all behave identically afterwards.
export async function GET(request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const fail = (reason) => {
    const res = NextResponse.redirect(`${origin}/login?sso=${reason}`);
    res.cookies.set(STATE_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  };

  try {
    if (!googleConfigured()) return fail("unconfigured");
    if (url.searchParams.get("error")) return fail("cancelled");

    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const expected = request.cookies.get(STATE_COOKIE)?.value;
    if (!code || !state || !expected || state !== expected) return fail("state");

    const { email, name } = await identityFromCode({ code, origin });
    const acct = await findOrCreateSsoAccount({ email, name });

    // Rotating first is what retires any other live session for this account.
    const sid = await rotateSessionId(acct.id);
    const token = await signSession({
      uid: acct.id, username: acct.username,
      name: acct.name || acct.username, role: acct.role, sid,
    });

    after(() => audit({
      actorId: acct.id, actor: acct.name || acct.username,
      action: acct.created ? "created an account with Google sign-in" : "signed in with Google",
      entity: "account", entityId: acct.id,
    }));

    const res = NextResponse.redirect(`${origin}/`);
    res.cookies.set(COOKIE_NAME, token, cookieOptions);
    res.cookies.set(STATE_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  } catch (e) {
    console.error("google callback failed", e);
    if (/skedulo\.com|verified email/i.test(e.message || "")) return fail("domain");
    // A schema error here means the migration hasn't been run on this database.
    // It is worth its own message: the symptom (works for you, fails for
    // everyone else) otherwise points nowhere near the cause.
    //   42703 undefined column · 42P01 undefined table · 23502 not-null violation
    if (["42703", "42P01", "23502"].includes(e?.code)
        || /column .* does not exist|relation .* does not exist|null value in column/i.test(e.message || "")) {
      return fail("db");
    }
    return fail("failed");
  }
}
