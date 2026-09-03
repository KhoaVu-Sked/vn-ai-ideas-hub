# What's New images

The announcement panel looks for the file named in
`features/announcements/release.js` under `NEWS.image.src`.

Drop the image here with that exact filename. Nothing else is needed — it is
served straight from `public/`, so there is no blob store, no upload and no
signed URL involved.

If the file is missing the panel simply omits it: the note still shows, with no
broken-image placeholder. That is deliberate, so a forgotten image never
disfigures a release note for everyone.

Keep them small — this loads on someone's first visit after a deploy. Under
300 KB, and roughly 2:1 landscape reads best at the panel's 240px cap.
