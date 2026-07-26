import { updateAccount, setAccountPassword, deleteAccount, jsonError } from "@/lib/db";
import { requireAdmin } from "@/lib/guard";
import { hashPassword } from "@/lib/auth";

// PATCH /api/accounts/:id { username, email, name, role, password? }
// → edit an account / change role / reset password (admin only)
export async function PATCH(request, { params }) {
  try {
    await requireAdmin();
    const { id } = await params;
    const body = await request.json();
    if (body.password?.trim()) {
      await setAccountPassword(id, await hashPassword(body.password));
    }
    const account = await updateAccount(id, body);
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
    return Response.json({ ok: true });
  } catch (e) {
    return jsonError(e, "Could not delete the account.");
  }
}
