-- Migration 021 — documentation: links alongside files
--
-- Ideas already carried file attachments. Rather than a second table holding
-- the same idea, attachments gain a kind and a human label, so a link and an
-- uploaded file are one concept with one set of permissions.
alter table attachments add column if not exists kind  text not null default 'file';  -- file | link
alter table attachments add column if not exists label text;
-- A link has no bytes and no content type; both columns already tolerate that
-- (size defaults to 0, content_type is nullable).
