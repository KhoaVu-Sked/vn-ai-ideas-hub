import { NextResponse } from "next/server";
import { getAccountByLogin, rotateSessionId, jsonError } from "@/lib/db";
import { verifyPassword } from "@/lib/auth";
import { signSession, COOKIE_NAME, cookieOptions } from "@/lib/session";

// POST /api/auth/login { username, password } → set session cookie.
// `username` is an identifier: it matches either a username or an email.
export async function POST(request) {
  try {
    const { username, password } = await request.json();
    if (!username?.trim() || !password) {
      return Response.json({ error: "Username/email and password are required." }, { status: 400 });
    }

    const account = await getAccountByLogin(username);
    // Same response whether the account is missing or the password is wrong.
    const ok = account && (await verifyPassword(password, account.password_hash));
    if (!ok) {
      return Response.json({ error: "Invalid username or password." }, { status: 401 });
    }

    // Rotating first is what makes this the only live session — any cookie
    // issued to another device stops matching from here on.
    const sid = await rotateSessionId(account.id);
    const token = await signSession({
      uid: account.id, username: account.username,
      name: account.name || account.username, role: account.role, sid,
    });
    const res = NextResponse.json({ user: { username: account.username, role: account.role } });
    res.cookies.set(COOKIE_NAME, token, cookieOptions);
    return res;
  } catch (e) {
    return jsonError(e, "Could not sign in.");
  }
}
