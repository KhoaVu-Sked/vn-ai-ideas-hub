import { updateAccount, setAccountPassword, deleteAccount, jsonError } from "@/lib/db";
import { requireAdmin } from "@/lib/guard";
import { after } from "next/server";
import { adminEvent } from "@/lib/notify";
import { hashPassword } from "@/lib/auth";

// PATCH /api/accounts/:id { username, email, name, role, password? }
// → edit an account / change role / reset password (admin only)
export async function PATCH(request, { params }) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const body = await request.json();
    if (body.password?.trim()) {
      await setAccountPassword(id, await hashPassword(body.password));
    }
    const account = await updateAccount(id, body);
    const base = new URL(request.url).origin;
    const who = admin.name || admin.username;
    const what = body.password?.trim() ? "reset the password for" : "updated the account";
    after(() => adminEvent({
      actorId: admin.uid, actor: who, entity: "account", entityId: id,
      auditAction: `${what} "${account.username}"`,
      subject: "AI Ideas Hub user account changed",
      heading: "User account changed",
      intro: `<b>${who}</b> ${what} <b>${account.username}</b>.`,
      rows: [["Username", account.username], ["Email", account.email || "—"], ["Role", account.role]],
      ctaPath: "/manage?section=users", base,
    }));
    return Response.json({ account });
  } catch (e) {
    return jsonError(e, "Could not update the account.");
  }
}

// DELETE /api/accounts/:id → remove an account (admin only; not yourself)
export async function DELETE(_request, { params }) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    if (id === admin.uid) return Response.json({ error: "You can't delete your own account." }, { status: 400 });
    await deleteAccount(id);
    const who = admin.name || admin.username;
    after(() => adminEvent({
      actorId: admin.uid, actor: who, entity: "account", entityId: id,
      auditAction: "deleted a user account",
      subject: "AI Ideas Hub user account deleted",
      heading: "User account deleted",
      intro: `<b>${who}</b> deleted a user account.`,
      ctaPath: "/manage?section=users",
    }));
    return Response.json({ ok: true });
  } catch (e) {
    return jsonError(e, "Could not delete the account.");
  }
}
