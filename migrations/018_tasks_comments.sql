-- Migration 018 — split requests into tasks + comments
-- SAFE for your data: additive columns, one new table, and a state remap.
-- No row is deleted. Run in the Neon SQL editor.
--
-- The `requests` table now backs the Jira-style Task board on an idea:
--   title       short card label (the only thing the card shows)
--   body        the detail, revealed when you open the card
--   assignee_id who's doing it
--   start/due   scheduled window, bounded by the idea's own window
--   position    order within a board column
--   seq         human number → T-007
--
-- Free-text discussion moves to the new `comments` table. One table serves both
-- the idea's Overview thread (request_id is null) and a thread on a single task.

alter table requests add column if not exists title       text;
alter table requests add column if not exists assignee_id uuid references accounts(id) on delete set null;
alter table requests add column if not exists start_date  date;
alter table requests add column if not exists due_date    date;
alter table requests add column if not exists position    integer not null default 0;
alter table requests add column if not exists seq         bigserial;

create index if not exists requests_board_idx on requests (idea_id, state, position);

-- Existing rows have no title — take the opening of their text, and mark it so
-- it's obvious these came from the old free-text list.
update requests
set title = case when length(body) > 60 then left(body, 57) || '…' else body end
where title is null or title = '';

-- Old states → board columns. 'accepted' and 'declined' already match.
update requests set state = 'pending_approval' where state in ('open', 'under_discussion');
update requests set state = 'done'             where state = 'closed';

-- Give each idea's existing cards a stable order.
with ordered as (
  select id, row_number() over (partition by idea_id, state order by created_at) as rn
  from requests
)
update requests r set position = ordered.rn
from ordered where ordered.id = r.id and r.position = 0;

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
