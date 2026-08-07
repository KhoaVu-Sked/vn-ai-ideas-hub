import { NextResponse, after } from "next/server";
import { getPasswordHash, setAccountPassword, rotateSessionId, jsonError } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { requireUser } from "@/lib/guard";
import { COOKIE_NAME } from "@/lib/session";
import { audit } from "@/lib/notify";
import { anyPasswordLogin, passwordLoginOff } from "@/lib/authMode";

// PATCH /api/profile/password { current, next } → change your own password.
//
// Acts on the session's account only — the id never comes from the request, so
// this can't be pointed at anyone else. Proving the current password is what
// makes it safe to skip the emailed code: a borrowed, still-signed-in browser
// can't lock the owner out.
export async function PATCH(request) {
  if (!anyPasswordLogin) return passwordLoginOff();
  try {
    const user = await requireUser();
    const { current, next } = await request.json();

    if (!current || !next) return Response.json({ error: "Enter your current and new password." }, { status: 400 });
    if (next.length < 6) return Response.json({ error: "Your new password must be at least 6 characters." }, { status: 400 });
    if (next === current) return Response.json({ error: "That's the same as your current password." }, { status: 400 });

    const hash = await getPasswordHash(user.uid);
    if (!hash) {
      return Response.json({
        error: "Your account signs in with Google, so there's no password to change.",
      }, { status: 400 });
    }
    if (!(await verifyPassword(current, hash))) {
      return Response.json({ error: "That isn't your current password." }, { status: 400 });
    }

    await setAccountPassword(user.uid, await hashPassword(next));
    // A new password should end every session started with the old one — this
    // device included, so you sign back in and prove you know the new one.
    await rotateSessionId(user.uid);
    after(() => audit({
      actorId: user.uid, actor: user.name || user.username,
      action: "changed their password", entity: "account", entityId: user.uid,
    }));
    const res = NextResponse.json({ ok: true, signedOut: true });
    res.cookies.set(COOKIE_NAME, "", { path: "/", maxAge: 0 });
    return res;
  } catch (e) {
    return jsonError(e, "Could not change your password.");
  }
}
