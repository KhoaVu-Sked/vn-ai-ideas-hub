-- Migration 021 — correct user_role.position values
--
-- Migration 020 shipped the wrong ladder: (junior, middle, senior, manager,
-- principal). The real one has no "manager" rung and starts one level
-- earlier: intern, junior, middle, senior, principal.
--
-- Any existing 'manager' rows are remapped to 'principal' (nearest level)
-- before the constraint tightens. If that mapping is wrong for someone,
-- fix their row by hand after running this — this is a one-time backfill
-- guess, not a real level.

update user_role set position = 'principal', updated_at = now()
where position = 'manager';

alter table user_role drop constraint if exists user_role_position_check;
alter table user_role add constraint user_role_position_check
  check (position in ('intern', 'junior', 'middle', 'senior', 'principal'));
