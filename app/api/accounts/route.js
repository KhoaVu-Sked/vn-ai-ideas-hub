import { listAccounts, createAccount, jsonError } from "@/lib/db";
import { requireAdmin } from "@/lib/guard";
import { after } from "next/server";
import { adminEvent } from "@/lib/notify";
import { hashPassword } from "@/lib/auth";

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
    if (!password?.trim()) return Response.json({ error: "An initial password is required." }, { status: 400 });
    const password_hash = await hashPassword(password);
    const account = await createAccount({ username, email, name, password_hash, role });
    const base = new URL(request.url).origin;
    const who = admin.name || admin.username;
    after(() => adminEvent({
      actorId: admin.uid, actor: who, entity: "account", entityId: account.id,
      auditAction: `created the account "${account.username}" (${account.role})`,
      subject: "New AI Ideas Hub user account",
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
