"use client";

import { folderLink } from "@/features/tools/drive/paths";

const MY_DRIVE = "https://drive.google.com/drive/my-drive";

/* Where the file sits, each folder its own link.

   Three states, not two. An empty trail means one of two different things, and
   showing both as "My Drive" would put a file that lives in a folder this
   account cannot read at the root of your own Drive — a wrong answer that looks
   like a confident one. `resolved` separates "still working" from "gave up",
   which a bare empty Map cannot: `.get()` returns undefined for both. */
export default function Trail({ trail, resolved, hasParent }) {
  if (!resolved) {
    return <span className="drive-trail"><span>Finding location…</span></span>;
  }
  if (!trail?.length) {
    return (
      <span className="drive-trail">
        {hasParent
          ? <span>Location unavailable</span>
          : <a href={MY_DRIVE} target="_blank" rel="noreferrer">My Drive</a>}
      </span>
    );
  }
  return (
    <span className="drive-trail">
      {trail.map((folder, i) => (
        <span key={folder.id} style={{ display: "contents" }}>
          {i > 0 && <span aria-hidden="true">›</span>}
          <a href={folderLink(folder.id)} target="_blank" rel="noreferrer">{folder.name}</a>
        </span>
      ))}
    </span>
  );
}
