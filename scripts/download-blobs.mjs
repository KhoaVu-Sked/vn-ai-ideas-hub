// Download every file out of a Vercel Blob store, keeping its key as the path.
//
// The store is private, so each file needs an authenticated request — there's no
// bulk download in the dashboard, and no folders to download either: keys just
// happen to contain "/".
//
//   BLOB_READ_WRITE_TOKEN=vercel_blob_rw_xxx node scripts/download-blobs.mjs
//
// Files land in ./blob-backup, mirroring the store:
//   blob-backup/avatars/<account-id>/photo-Xy9.png
//   blob-backup/ideas/<idea-id>/notes-Ab3.pdf

import { list, get } from "@vercel/blob";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const token = process.env.BLOB_READ_WRITE_TOKEN;
if (!token) {
  console.error("Set BLOB_READ_WRITE_TOKEN first — Vercel → Storage → your Blob store → Tokens.");
  process.exit(1);
}

const OUT = "blob-backup";
let cursor;
let files = 0, bytes = 0, failed = 0;

do {
  const page = await list({ token, cursor, limit: 1000 });

  for (const b of page.blobs) {
    const dest = join(OUT, b.pathname);
    try {
      const res = await get(b.url, { access: "private", token });
      if (!res?.stream) { console.warn(`  missing: ${b.pathname}`); failed += 1; continue; }

      // Files are capped at 5 MB by the app, so buffering is simpler than piping.
      const buf = Buffer.from(await new Response(res.stream).arrayBuffer());
      await mkdir(dirname(dest), { recursive: true });
      await writeFile(dest, buf);

      files += 1; bytes += buf.length;
      console.log(`  ${(buf.length / 1024).toFixed(0).padStart(5)} KB  ${b.pathname}`);
    } catch (e) {
      console.warn(`  failed: ${b.pathname} — ${e.message}`);
      failed += 1;
    }
  }

  cursor = page.cursor;
} while (cursor);

console.log(`\n${files} file(s), ${(bytes / 1048576).toFixed(1)} MB → ./${OUT}`);
if (failed) console.log(`${failed} could not be downloaded.`);
