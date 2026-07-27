import { NextResponse } from "next/server";
import { createRegisteredAccount, jsonError } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { signSession, COOKIE_NAME, cookieOptions } from "@/lib/session";

const ALLOWED_DOMAIN = "@skedulo.com";

// POST /api/auth/register { name, email, password } → self-serve signup,
// restricted to @skedulo.com emails. Signs the user in on success.
export async function POST(request) {
  try {
    const { name, email, password } = await request.json();
    const em = (email || "").trim().toLowerCase();
    if (!em.endsWith(ALLOWED_DOMAIN) || em.length <= ALLOWED_DOMAIN.length) {
      return Response.json({ error: `Only ${ALLOWED_DOMAIN} emails can register.` }, { status: 400 });
    }
    if (!name?.trim()) return Response.json({ error: "Your name is required." }, { status: 400 });
    if (!password || password.length < 6) return Response.json({ error: "Password must be at least 6 characters." }, { status: 400 });

    const password_hash = await hashPassword(password);
    const acct = await createRegisteredAccount({ email: em, name, password_hash });

    const token = await signSession({ uid: acct.id, username: acct.username, role: acct.role });
    const res = NextResponse.json({ user: { username: acct.username, role: acct.role } });
    res.cookies.set(COOKIE_NAME, token, cookieOptions);
    return res;
  } catch (e) {
    return jsonError(e, "Could not create your account.");
  }
}
