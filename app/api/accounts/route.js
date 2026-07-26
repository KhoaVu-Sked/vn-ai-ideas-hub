import { listAccounts, createAccount, jsonError } from "@/lib/db";
import { requireAdmin } from "@/lib/guard";
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
    await requireAdmin();
    const { username, email, name, password, role } = await request.json();
    if (!password?.trim()) return Response.json({ error: "An initial password is required." }, { status: 400 });
    const password_hash = await hashPassword(password);
    const account = await createAccount({ username, email, name, password_hash, role });
    return Response.json({ account }, { status: 201 });
  } catch (e) {
    return jsonError(e, "Could not create the account.");
  }
}
