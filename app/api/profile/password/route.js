import { after } from "next/server";
import { getPasswordHash, setAccountPassword, jsonError } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { requireUser } from "@/lib/guard";
import { audit } from "@/lib/notify";

// PATCH /api/profile/password { current, next } → change your own password.
//
// Acts on the session's account only — the id never comes from the request, so
// this can't be pointed at anyone else. Proving the current password is what
// makes it safe to skip the emailed code: a borrowed, still-signed-in browser
// can't lock the owner out.
export async function PATCH(request) {
  try {
    const user = await requireUser();
    const { current, next } = await request.json();

    if (!current || !next) return Response.json({ error: "Enter your current and new password." }, { status: 400 });
    if (next.length < 6) return Response.json({ error: "Your new password must be at least 6 characters." }, { status: 400 });
    if (next === current) return Response.json({ error: "That's the same as your current password." }, { status: 400 });

    if (!(await verifyPassword(current, await getPasswordHash(user.uid)))) {
      return Response.json({ error: "That isn't your current password." }, { status: 400 });
    }

    await setAccountPassword(user.uid, await hashPassword(next));
    after(() => audit({
      actorId: user.uid, actor: user.name || user.username,
      action: "changed their password", entity: "account", entityId: user.uid,
    }));
    return Response.json({ ok: true });
  } catch (e) {
    return jsonError(e, "Could not change your password.");
  }
}
