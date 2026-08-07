import { put, del } from "@vercel/blob";
import { setAvatarUrl } from "@/features/accounts/queries";
import { jsonError } from "@/lib/sql";
import { requireUser } from "@/features/auth/guard";
import { validateAvatar } from "@/lib/upload";

const blobConfigured = () => !!(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN);

// POST /api/profile/avatar (multipart, field "file") → set your own avatar
export async function POST(request) {
  try {
    const user = await requireUser();
    const form = await request.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") return Response.json({ error: "No image provided." }, { status: 400 });
    const invalid = validateAvatar({ name: file.name, type: file.type, size: file.size });
    if (invalid) return Response.json({ error: invalid }, { status: 400 });
    if (!blobConfigured()) {
      return Response.json({ error: "Image uploads aren't configured — connect a Vercel Blob store to this project." }, { status: 400 });
    }

    const blob = await put(`avatars/${user.uid}/${file.name}`, file, { access: "private", addRandomSuffix: true });
    const { oldUrl } = await setAvatarUrl(user.uid, blob.url);
    // Don't leave the replaced image paying for storage forever.
    if (oldUrl && oldUrl !== blob.url) { try { await del(oldUrl); } catch { /* ignore */ } }
    return Response.json({ ok: true });
  } catch (e) {
    return jsonError(e, "Could not upload the image.");
  }
}

// DELETE /api/profile/avatar → back to initials
export async function DELETE() {
  try {
    const user = await requireUser();
    const { oldUrl } = await setAvatarUrl(user.uid, null);
    if (oldUrl && blobConfigured()) { try { await del(oldUrl); } catch { /* ignore */ } }
    return Response.json({ ok: true });
  } catch (e) {
    return jsonError(e, "Could not remove the image.");
  }
}
