-- findOrCreateSsoAccount matches on lower(email), but accounts_email_key is on
-- the raw column — so 'Khoa.Vu@' and 'khoa.vu@' can both exist and the SELECT
-- (no ORDER BY) may return either one. Same person, different account, possibly
-- a different role, varying between sign-ins.
--
-- If the first statement raises a duplicate-key error, two rows differ only by
-- case. Find them, merge by hand, then re-run:
--   select lower(email), count(*) from accounts where email is not null
--   group by 1 having count(*) > 1;

create unique index if not exists accounts_email_lower_key on accounts (lower(email));
drop index if exists accounts_email_key;

-- Store what we look up, so new rows can't reintroduce the mismatch.
update accounts set email = lower(email) where email is not null and email <> lower(email);
