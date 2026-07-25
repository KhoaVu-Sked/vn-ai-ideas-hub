-- AI Ideas Hub — Neon Postgres schema.
-- Run this in the Neon SQL editor (dashboard → SQL Editor) before first use.
-- Raw SQL, no ORM. gen_random_uuid() needs pgcrypto (built in on Neon).

create extension if not exists pgcrypto;

-- Ideas ─ one row per idea/project. Problem/Solution/Detail become the drawer's
-- "content" blocks; the app reads Not started / In progress / On Hold / Done.
create table if not exists ideas (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  status      text not null default 'Not started',
  tags        text[] not null default '{}',
  lead        text,
  problem     text,
  solution    text,
  detail      text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists ideas_updated_at_idx on ideas (updated_at desc);

-- Comments ─ author is free-text 'Anonymous' until auth lands (then add author_email).
create table if not exists comments (
  id          uuid primary key default gen_random_uuid(),
  idea_id     uuid not null references ideas(id) on delete cascade,
  body        text not null,
  author      text not null default 'Anonymous',
  created_at  timestamptz not null default now()
);

create index if not exists comments_idea_id_idx on comments (idea_id);

-- Members ─ per-idea team. Rows with role <> 'watcher' render as board avatars.
-- name is free-text for now; add user_id / email when auth lands.
create table if not exists members (
  id          uuid primary key default gen_random_uuid(),
  idea_id     uuid not null references ideas(id) on delete cascade,
  name        text not null,
  role        text not null default 'member',
  created_at  timestamptz not null default now()
);

create index if not exists members_idea_id_idx on members (idea_id);

-- Accounts ─ username/password login. Passwords are stored ONLY as bcrypt hashes.
create table if not exists accounts (
  id            uuid primary key default gen_random_uuid(),
  username      text unique not null,
  password_hash text not null,
  role          text not null default 'member',
  created_at    timestamptz not null default now()
);

-- Seed the admin account (username: skedadmin). The hash below is bcrypt('sked123').
-- Change this password after first login (weak + shared) — see README.
insert into accounts (username, password_hash, role)
values ('skedadmin', '$2b$10$jXuVkyeenk74ziHvW17gtuAZMdtDJOYcvG5KuvaE/GPhCg5lyDzKS', 'admin')
on conflict (username) do nothing;
