import { createAccount, listAccounts } from "@/features/accounts/queries";
import { jsonError } from "@/lib/sql";
import { requireAdmin } from "@/features/auth/guard";
import { after } from "next/server";
import { adminEvent } from "@/features/notifications/notify";
import { hashPassword } from "@/features/auth/password";
import { APP_NAME } from "@/lib/brand";
import { PASSWORD_LOGIN } from "@/features/auth/authMode";

// GET /api/accounts → list accounts (admin only)
export async function GET() {
  try {
    await requireAdmin();
    return Response.json({ accounts: await listAccounts() });
  } catch (e) {
    return jsonError(e, "Could not load accounts.");
  }
}

// POST /api/accounts { username, email, name, password, role } → create (admin)
export async function POST(request) {
  try {
    const admin = await requireAdmin();
    const { username, email, name, password, role } = await request.json();
    if (PASSWORD_LOGIN && !password?.trim()) return Response.json({ error: "An initial password is required." }, { status: 400 });
    // Google-only: the row is created without a hash and the person signs in
    // with Google. Setting one would just be a credential that never works.
    const password_hash = PASSWORD_LOGIN ? await hashPassword(password) : null;
    const account = await createAccount({ username, email, name, password_hash, role });
    const base = new URL(request.url).origin;
    const who = admin.name || admin.username;
    after(() => adminEvent({
      actorId: admin.uid, actor: who, entity: "account", entityId: account.id,
      auditAction: `created the account "${account.username}" (${account.role})`,
      subject: `New ${APP_NAME} user account`,
      heading: "User account created",
      intro: `<b>${who}</b> created an account for <b>${account.username}</b>.`,
      rows: [["Username", account.username], ["Email", account.email || "—"], ["Role", account.role]],
      ctaPath: "/manage?section=users", base,
    }));
    return Response.json({ account }, { status: 201 });
  } catch (e) {
    return jsonError(e, "Could not create the account.");
  }
}
