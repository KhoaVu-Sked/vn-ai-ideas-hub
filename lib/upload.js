// Shared upload rules — used by the server route AND the client UI.
// Pure module (no server-only deps), safe to import anywhere.

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB
export const ACCEPT_ATTR = ".doc,.docx,.xls,.xlsx,.pdf,image/*";

const ALLOWED_EXT = new Set(["doc", "docx", "xls", "xlsx", "pdf", "png", "jpg", "jpeg", "gif", "webp"]);
const ALLOWED_MIME = new Set([
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/pdf",
]);

export function isAllowedType(name = "", type = "") {
  if (type && (type.startsWith("image/") || ALLOWED_MIME.has(type))) return true;
  const ext = (name.split(".").pop() || "").toLowerCase();
  return ALLOWED_EXT.has(ext);
}

// Returns an error string, or null if the file is acceptable.
export function validateUpload({ name, type, size }) {
  if ((size || 0) > MAX_UPLOAD_BYTES) return "File is too large (max 5 MB).";
  if (!isAllowedType(name, type)) return "Only Word, Excel, PDF, and image files are allowed.";
  return null;
}

// ── avatars ───────────────────────────────────────────────────
// Tighter than attachments: images only, and small — these render inline on
// every board card, so a 5 MB photo would be paid for on every page view.
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2 MB
export const AVATAR_ACCEPT_ATTR = "image/png,image/jpeg,image/gif,image/webp";
const AVATAR_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp"]);

export function validateAvatar({ name, type, size }) {
  if ((size || 0) > MAX_AVATAR_BYTES) return "Image is too large (max 2 MB).";
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (!(type || "").startsWith("image/") && !AVATAR_EXT.has(ext)) return "Pick a PNG, JPG, GIF or WebP image.";
  return null;
}
