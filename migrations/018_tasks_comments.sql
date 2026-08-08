-- Migration 018 — split requests into a task board and a comment thread
--
-- The existing `requests` rows are free-text discussion, not tracked work — the
-- old input box literally said "write a request or comment". So they move to
-- `comments` and the board starts empty, rather than becoming a column of
-- one-line cards nobody wrote as tasks.
--
-- `requests` keeps its table but changes meaning: it now backs the board.
--   title       short card label (all the card shows)
--   body        the detail, revealed when the card is opened
--   assignee_id who's doing it
--   start/due   scheduled window, bounded by the idea's own window
--   position    order within a column
--   seq         human number → T-007
--
-- `comments` serves both the idea's Overview thread (request_id null) and the
-- thread on a single card.
--
-- NOTE: triage state is not carried over. An "accepted" request becomes an
-- ordinary comment — the verdict was about text that is no longer a request.

begin;

alter table requests add column if not exists title       text;
alter table requests add column if not exists assignee_id uuid references accounts(id) on delete set null;
alter table requests add column if not exists start_date  date;
alter table requests add column if not exists due_date    date;
alter table requests add column if not exists position    integer not null default 0;
alter table requests add column if not exists seq         bigserial;

create index if not exists requests_board_idx on requests (idea_id, state, position);

-- An older database may carry an unrelated `comments` table (author as free
-- text, no account_id). Drop it ONLY if it is that one — never the real table.
do $$
begin
  if exists (select 1 from information_schema.tables  where table_name = 'comments')
     and not exists (select 1 from information_schema.columns
                     where table_name = 'comments' and column_name = 'request_id')
  then
    drop table comments;
  end if;
end $$;

create table if not exists comments (
  id         uuid primary key default gen_random_uuid(),
  idea_id    uuid not null references ideas(id) on delete cascade,
  request_id uuid references requests(id) on delete cascade,   -- null → idea-level
  account_id uuid not null references accounts(id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create index if not exists comments_idea_idx    on comments (idea_id, created_at);
create index if not exists comments_request_idx on comments (request_id, created_at);

-- Every existing request becomes an idea-level comment, keeping its author and
-- its original timestamp so the thread reads in the order it was written.
insert into comments (idea_id, request_id, account_id, body, created_at)
select idea_id, null, account_id, body, created_at
from requests;

-- The board starts empty. Nothing is lost — every row was copied above.
delete from requests;

commit;
