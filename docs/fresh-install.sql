-- TS - AI Ideas Hub — fresh install
-- For a BRAND-NEW, EMPTY Neon database. Paste the whole file into the Neon SQL
-- Editor and run once. Safe to re-run — every statement is IF NOT EXISTS or
-- ON CONFLICT DO NOTHING. Creates no schemas, sets no owners, grants nothing.

create extension if not exists pgcrypto;

-- ── Core tables (fresh installs get the final shape here) ──────────

create table if not exists ideas (
  id                    uuid primary key default gen_random_uuid(),
  seq                   bigserial,                       -- human number → IDEA-007
  name                  text not null,
  status                text not null default 'Submitted',
  tags                  text[] not null default '{}',
  initiator_account_id  uuid,
  target_date           text,
  context               text,
  pain_points           text,
  expected_benefit      text,
  extra                 jsonb not null default '{}'::jsonb,   -- admin-defined custom fields
  delete_requested      boolean not null default false,       -- project lead asked admin to delete
  delete_reason         text,
  delete_requested_by   uuid,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists ideas_updated_at_idx on ideas (updated_at desc);

-- Admin-configurable extra fields for the Submit form. Deleting a field ARCHIVES
-- it (archived = true) — existing answers in ideas.extra are kept, never dropped.
create table if not exists form_fields (
  id         uuid primary key default gen_random_uuid(),
  key        text unique not null,                 -- immutable JSONB key (relabel-safe)
  label      text not null,
  type       text not null default 'text',         -- text | textarea | number | select
  options    text[] not null default '{}',         -- for select
  required   boolean not null default false,
  position   integer not null default 0,
  archived   boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists accounts (
  id            uuid primary key default gen_random_uuid(),
  username      text unique not null,
  email         text,                                    -- unique (index added below); login works with either
  password_hash text,                                      -- null = signs in with Google only
  auth_provider text not null default 'password',          -- password | google
  name          text,                                    -- display name, e.g. "Trung Vo"
  role          text not null default 'member',          -- workspace role: admin | member
  avatar_color  text,                                    -- chosen on /profile; null → hashed default
  avatar_url    text,                                    -- private blob, served via /api/avatars/:id
  region        text,
  timezone      text,                                    -- IANA zone, e.g. Asia/Ho_Chi_Minh
  session_id    uuid not null default gen_random_uuid(), -- rotates on sign-in; one live session
  created_at    timestamptz not null default now()
);
-- (the accounts_email unique index is created in the migration block below, after
--  ALTER ... ADD COLUMN email — so it works on both fresh and existing databases)

-- Seniority level per account (junior..principal). Separate from accounts.role
-- (workspace permission) and idea_members.roles (per-idea contribution role).
create table if not exists user_role (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null unique references accounts(id) on delete cascade,
  position    text not null
                check (position in ('intern', 'junior', 'middle', 'senior', 'principal')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- A track (AI Track, Core Competency) a course belongs to. One track per
-- course, but an account can be assigned more than one track — see
-- account_tracks below.
create table if not exists tracks (
  id         uuid primary key default gen_random_uuid(),
  name       text unique not null,
  created_at timestamptz not null default now()
);

create table if not exists account_tracks (
  account_id uuid not null references accounts(id) on delete cascade,
  track_id   uuid not null references tracks(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (account_id, track_id)
);

-- Course catalog. target date and completion status are NOT here — they
-- differ per learner taking the same course, so they live on
-- course_assignments instead.
create table if not exists courses (
  id                    uuid primary key default gen_random_uuid(),
  track_id              uuid references tracks(id) on delete set null,
  stage                 text,
  title                 text not null,
  focus_area            text,
  platform              text,
  est_hours             numeric,
  cost                  text,
  outcome               text,
  priority              text not null default 'optional'
                          check (priority in ('core', 'optional')),
  link                  text,
  expected_by_position  text
                          check (expected_by_position in ('intern', 'junior', 'middle', 'senior', 'principal')),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (track_id, title)
);
create index if not exists courses_track_id_idx on courses (track_id);

-- One row per (account, course): a learner's target date and progress.
create table if not exists course_assignments (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references accounts(id) on delete cascade,
  course_id   uuid not null references courses(id) on delete cascade,
  target_date date,
  status      text not null default 'not_started'
                check (status in ('not_started', 'in_progress', 'complete', 'skipped')),
  position    integer,  -- learner's own display order within a position tier
  wrap_up_url text,     -- knowledge artifact: nothing writes this yet
  exam_score  integer,  -- knowledge artifact: nothing writes this yet
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (account_id, course_id)
);
create index if not exists course_assignments_account_id_idx on course_assignments (account_id);

-- Tags catalog — admin-managed list of allowed tags (with a display color).
create table if not exists tags (
  id         uuid primary key default gen_random_uuid(),
  name       text unique not null,
  color      text,                                    -- hex accent, e.g. #0070cc
  created_at timestamptz not null default now()
);

-- Per-idea team membership. One row per (idea, account); role from a fixed set.
create table if not exists idea_members (
  id         uuid primary key default gen_random_uuid(),
  idea_id    uuid not null references ideas(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  role       text,                                  -- legacy single role (unused)
  roles      text[] not null default '{}',          -- a member can hold several roles
  created_at timestamptz not null default now(),
  unique (idea_id, account_id)
);
create index if not exists idea_members_idea_id_idx on idea_members (idea_id);
-- At most one Project Lead and one Initiator per idea. (Both recreated in the
-- migration block below, since the index NAMES predate these predicates.)
create unique index if not exists idea_members_one_lead
  on idea_members (idea_id) where roles @> array['Project Lead'];
create unique index if not exists idea_members_one_initiator
  on idea_members (idea_id) where roles @> array['Initiator'];

-- Expected time frame options for the submit form (admin-managed).
create table if not exists time_frames (
  id         uuid primary key default gen_random_uuid(),
  name       text unique not null,
  position   integer not null default 0,
  created_at timestamptz not null default now()
);

-- Likes — one per person per idea (toggle).
create table if not exists likes (
  idea_id    uuid not null references ideas(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (idea_id, account_id)
);

-- Board cards on an idea. Columns: pending_approval → accepted → in_progress
-- → done, plus declined. Free-text discussion lives in `comments`, not here.
create table if not exists requests (
  id          uuid primary key default gen_random_uuid(),
  idea_id     uuid not null references ideas(id) on delete cascade,
  account_id  uuid not null references accounts(id) on delete cascade,
  title       text,                            -- the card label
  body        text not null,                   -- the detail, shown when opened
  state       text not null default 'pending_approval',
  assignee_id uuid references accounts(id) on delete set null,
  -- Timing is measured, not declared: created_at is total age, state_changed_at
  -- is age in the current column. Both reset themselves.
  state_changed_at timestamptz not null default now(),
  position    integer not null default 0,      -- order within a column
  seq         bigserial,                       -- human number → T-007
  created_at  timestamptz not null default now(),
  updated_at  timestamptz
);
create index if not exists requests_idea_id_idx on requests (idea_id);
create index if not exists requests_board_idx   on requests (idea_id, state, position);

-- Comments. One table serves the idea's Overview thread (request_id null) and
-- the thread on a single card.
create table if not exists comments (
  id         uuid primary key default gen_random_uuid(),
  idea_id    uuid not null references ideas(id) on delete cascade,
  request_id uuid references requests(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create index if not exists comments_idea_idx    on comments (idea_id, created_at);
create index if not exists comments_request_idx on comments (request_id, created_at);

-- Follows — notify members on updates (email wiring comes later).
create table if not exists follows (
  idea_id    uuid not null references ideas(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (idea_id, account_id)
);

-- File attachments on an idea (stored in Vercel Blob; we keep the URL + metadata).
create table if not exists attachments (
  id           uuid primary key default gen_random_uuid(),
  idea_id      uuid not null references ideas(id) on delete cascade,
  account_id   uuid not null references accounts(id) on delete cascade,
  filename     text not null,
  url          text not null,
  size         bigint not null default 0,
  content_type text,
  created_at   timestamptz not null default now()
);
create index if not exists attachments_idea_id_idx on attachments (idea_id);

-- Admin to-do list (shared across admins). Free-text checklist, not tied to ideas.
create table if not exists tasks (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  done       boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now(),
  done_at    timestamptz
);
create index if not exists tasks_created_at_idx on tasks (created_at desc);

-- Password reset codes (OTP). Hashed, expiring, attempt-limited.
create table if not exists password_resets (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references accounts(id) on delete cascade,
  code_hash   text not null,
  expires_at  timestamptz not null,
  attempts    integer not null default 0,
  consumed_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists password_resets_account_idx on password_resets (account_id, created_at desc);

-- Pending signups. The account isn't created until the emailed code is entered,
-- so an unverified address never becomes a login.
create table if not exists signup_codes (
  id            uuid primary key default gen_random_uuid(),
  email         text not null,
  name          text,
  password_hash text not null,
  code_hash     text not null,
  expires_at    timestamptz not null,
  attempts      integer not null default 0,
  consumed_at   timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists signup_codes_email_idx on signup_codes (lower(email), created_at desc);

-- Audit log — every notable action; rows older than 14 days are pruned on write.
create table if not exists audit_log (
  id         uuid primary key default gen_random_uuid(),
  actor      text,
  actor_id   uuid,
  action     text not null,
  entity     text,
  entity_id  uuid,
  created_at timestamptz not null default now()
);
create index if not exists audit_log_created_at_idx on audit_log (created_at desc);

-- Feedback — any signed-in user can submit; admins review. Kept if the account
-- is later deleted (account_id set null).
create table if not exists feedback (
  id         uuid primary key default gen_random_uuid(),
  account_id uuid references accounts(id) on delete set null,
  body       text not null,
  page       text,
  status     text not null default 'open',   -- open | resolved
  created_at timestamptz not null default now()
);
create index if not exists feedback_created_at_idx on feedback (created_at desc);

-- Unique email. (In schema.sql this lives in the migration block, because on an
-- existing database the column has to be added first.)
create unique index if not exists accounts_email_lower_key on accounts (lower(email));

-- Runtime settings, one row per key. An absent row means the default, so this
-- starts empty. Currently just email_notifications (on | off).
create table if not exists app_settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

-- ── Seeds ─────────────────────────────────────────────────────────

insert into time_frames (name, position) values
  ('1-2 weeks', 1), ('3-4 weeks', 2), ('4-8 weeks', 3), ('1 quarter', 4)
on conflict (name) do nothing;

insert into tracks (name) values ('AI Track'), ('Core Competency')
on conflict (name) do nothing;

insert into courses (track_id, stage, focus_area, title, platform, priority, est_hours, cost, outcome, expected_by_position, link)
select (select id from tracks where name = 'AI Track'), v.*
from (values
  ('L0 — Foundations', 'How AI & LLMs work; capabilities & limits', 'AI Capabilities and Limitations', 'Anthropic Academy', 'core', 2.0, 'Free', 'Explain what generative AI is, what it can and can''t do, and where it fails.', 'intern', 'https://anthropic.skilljar.com/ai-capabilities-and-limitations'),
  ('L0 — Foundations', 'Everyday AI for work', 'Claude 101', 'Anthropic Academy', 'core', 2.0, 'Free', 'Use Claude for writing, summarizing, and analyzing documents.', 'intern', 'https://anthropic.skilljar.com/claude-101'),
  ('L0 — Foundations', 'AI fluency, ethics & safe use', 'AI Fluency: Framework & Foundations', 'Anthropic Academy', 'core', 4.0, 'Free', 'Apply the Effective/Efficient/Ethical/Safe framework; know when NOT to trust AI.', 'intern', 'https://anthropic.skilljar.com/ai-fluency-framework-foundations'),
  ('L0 — Foundations', 'Customer-data safety & policy', 'Skedulo AI Usage Policy', 'Confluence (Internal)', 'core', 1.0, 'Free', 'Handle customer data safely and follow Skedulo''s AI Usage Policy.', 'intern', 'https://skedulo.atlassian.net/wiki/spaces/IS/pages/3355443246/Artificial+Intelligence+AI+Usage+Policy'),
  ('L0 — Foundations', 'Self-paced video primer', 'GenAI for Beginners', 'Udemy Business', 'optional', 3.0, 'Udemy Business', 'Reinforce the fundamentals in a self-paced video format.', 'intern', 'https://skedulo.udemy.com/course/generative-ai-for-beginners-b/'),
  ('L1 — Applied for Support', 'Prompt engineering fundamentals', 'Prompt Engineering: ChatGPT, Claude & AI Masterclass', 'Udemy Business', 'core', 6.0, 'Udemy Business', 'Write effective prompts (chain-of-thought, few-shot, role-based) across Claude & Gemini.', 'junior', 'https://skedulo.udemy.com/course/complete-ai-guide/'),
  ('L1 — Applied for Support', 'AI for support tasks', 'Customer Experience with Generative AI', 'Udemy Business', 'core', 4.0, 'Udemy Business', 'Use AI for support tasks: chatbots, personalization, ticket/data analysis, and ethical customer engagement.', 'junior', 'https://skedulo.udemy.com/course/customer-experience-learnit/'),
  ('L1 — Applied for Support', 'Gemini for daily work', 'Gemini for Google Workspace (learning path)', 'Google Skills', 'core', 4.0, 'Free', 'Use Gemini to summarize, draft replies, and research in daily tools.', 'junior', 'https://www.skills.google/paths/249'),
  ('L1 — Applied for Support', 'Team workflows with Claude', 'Claude for Work', 'Anthropic Academy', 'core', 3.0, 'Free', 'Use Projects and shared workflows to standardize support output.', 'junior', 'https://www.anthropic.com/learn'),
  ('L1 — Applied for Support', 'DevRev product mastery', 'DevRev Product Mastery', 'DevRev University', 'core', 3.0, 'Free (DevRev)', 'Navigate DevRev (tickets, parts, workflows) confidently to handle support cases.', 'junior', 'https://devrevu.reach360.com/learn/course/4bd98843-4bbf-4084-8487-39d807bca5ae'),
  ('L1 — Applied for Support', 'AI foundations & industry applications', 'AI Foundations & Industry Applications', 'DevRev University', 'core', 2.0, 'Free (DevRev)', 'Understand core AI concepts and how they apply across industries and support work.', 'junior', 'https://devrevu.reach360.com/learn/course/5e1b06c7-4f78-4ccc-a940-1eae6a8bb187'),
  ('L2 — Intermediate', 'Reusable assistants & prompt libraries', 'Custom assistants: Claude Projects / Gemini Gems', 'Anthropic Academy + Google', 'core', 3.0, 'Free', 'Build and share reusable assistants and prompt templates for the team.', 'middle', 'https://www.anthropic.com/learn'),
  ('L2 — Intermediate', 'What is an agent? (agentic AI)', 'Introduction to Claude Cowork', 'Anthropic Academy', 'core', 2.0, 'Free', 'Understand agents that take actions, not just chat — non-technical friendly.', 'middle', 'https://anthropic.skilljar.com/introduction-to-claude-cowork'),
  ('L2 — Intermediate', 'Delegating to subagents (concept)', 'Introduction to subagents', 'Anthropic Academy', 'core', 2.0, 'Free', 'Understand how work is delegated to subagents and how context is managed.', 'middle', 'https://anthropic.skilljar.com/introduction-to-subagents'),
  ('L2 — Intermediate', 'Connecting AI to tools & data (concept)', 'Introduction to Model Context Protocol (MCP)', 'Anthropic Academy', 'core', 2.0, 'Free', 'Understand how agents connect to external tools and data sources.', 'middle', 'https://anthropic.skilljar.com/introduction-to-model-context-protocol'),
  ('L2 — Intermediate', 'Gemini fluency + Google AI Studio', 'Generative AI with Gemini and Google AI Studio for Beginners', 'Udemy Business', 'core', 6.0, 'Udemy Business', 'Deepen Gemini fluency (Gems, Deep Research, NotebookLM) and build a custom AI tool in Google AI Studio (bridges to L3).', 'senior', 'https://skedulo.udemy.com/course/google-bard-the-ultimate-guide-master-generative-ai/'),
  ('L3 — Advanced (Technical)', 'Claude API & tool use', 'Build with Claude (API)', 'Anthropic Academy', 'core', 6.0, 'Free', 'Call the Claude API and implement tool use in code.', 'principal', 'https://anthropic.skilljar.com/claude-with-the-anthropic-api'),
  ('L3 — Advanced (Technical)', 'Build connectors (MCP development)', 'Model Context Protocol — build servers', 'Anthropic Academy', 'core', 6.0, 'Free', 'Build MCP servers so agents can use your tools and data.', 'principal', 'https://anthropic.skilljar.com/model-context-protocol-advanced-topics'),
  ('L3 — Advanced (Technical)', 'Coding with an AI agent', 'Claude Code 101', 'Anthropic Academy', 'core', 3.0, 'Free', 'Use Claude Code for real coding tasks (Explore -> Plan -> Code).', 'principal', 'https://anthropic.skilljar.com/claude-code-101'),
  ('L3 — Advanced (Technical)', 'Advanced agentic coding', 'Claude Code in Action', 'Anthropic Academy', 'core', 4.0, 'Free', 'Apply Claude Code to larger, multi-step workflows.', 'principal', 'https://anthropic.skilljar.com/claude-code-in-action'),
  ('L3 — Advanced (Technical)', 'AI pair programming with GitHub Copilot (Enterprise)', 'GitHub Copilot Fundamentals (learning path, Part 1 & 2)', 'Microsoft Learn / GitHub', 'core', 8.0, 'Free (Copilot Enterprise)', 'Use GitHub Copilot across the SDLC: chat, agent mode, Copilot Cloud Agent, and the GitHub MCP server in an enterprise setup.', 'principal', 'https://learn.microsoft.com/en-us/training/paths/copilot/'),
  ('L3 — Advanced (Technical)', 'Multi-agent / subagent design (hands-on)', 'Introduction to subagents (applied)', 'Anthropic Academy', 'core', 3.0, 'Free', 'Design multi-agent systems that delegate and coordinate work.', 'principal', 'https://anthropic.skilljar.com/introduction-to-subagents'),
  ('L3 — Advanced (Technical)', 'Capstone: build an LLM app', 'Generative AI + LLM App Development Bootcamp (opt. LangChain)', 'Udemy Business', 'core', 30.0, 'Udemy Business', 'Design and ship an agent / LLM application end-to-end.', 'principal', 'https://skedulo.udemy.com/course/bootcamp-generative-artificial-intelligence-and-llm-app-development/')
) as v(stage, focus_area, title, platform, priority, est_hours, cost, outcome, expected_by_position, link)
on conflict (track_id, title) do nothing;

insert into tags (name, color) values
  ('Work', '#0070cc'), ('Personal Development', '#735dd0'), ('Family', '#e3761c'), ('Home', '#249387')
on conflict (name) do nothing;
-- Backfill colors for tags created before the color column existed.
update tags set color = '#0070cc' where name = 'Work' and color is null;
update tags set color = '#735dd0' where name = 'Personal Development' and color is null;
update tags set color = '#e3761c' where name = 'Family' and color is null;
update tags set color = '#249387' where name = 'Home' and color is null;

-- Admin account (username: skedadmin, email: khoa.vu@skedulo.com).
-- Hash below is bcrypt('sked123'). Change this password after first login.
insert into accounts (username, email, password_hash, name, role)
values ('skedadmin', 'khoa.vu@skedulo.com', '$2b$10$jXuVkyeenk74ziHvW17gtuAZMdtDJOYcvG5KuvaE/GPhCg5lyDzKS', 'Sked Admin', 'admin')
on conflict (username) do nothing;
update accounts set name = 'Sked Admin' where username = 'skedadmin' and name is null;
update accounts set email = 'khoa.vu@skedulo.com' where username = 'skedadmin' and email is null;
