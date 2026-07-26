# AI Ideas Hub

One home for the team's AI ideas — submit them, follow them on a board, and ship them. Next.js frontend + API routes on Vercel; **Neon Postgres is the data layer** (accessed server-side only).

Interaction design (the fetch-scoping that keeps it fast and cheap):

- **Refresh fetches the light project list only** (name, status, tags, people)
- **Clicking a project fetches that one project's detail**, then caches it for the session
- **Board-level writes** (new idea, status change) → refetch the **list only**
- **In-project writes** (comments) → refetch **that project only**
- The database connection string lives in a server env var; the browser only ever calls `/api/*`

## Stack

- Next.js 15 (App Router) — frontend + serverless API routes
- Neon Postgres via `@neondatabase/serverless` (HTTP driver) — raw parameterised SQL, no ORM
- Username/password auth — bcrypt password hashes + a signed httpOnly session cookie (jose JWT); middleware gates the app

## Setup

### 1. Neon database (one-time)

1. [neon.tech](https://neon.tech) → create a project (free tier is fine). This gives you a Postgres database.
2. Open **SQL Editor**, paste the contents of [`schema.sql`](schema.sql), and run it. This creates the `ideas`, `comments`, and `members` tables.
3. **Connect** (top right) → copy the connection string. Use the **pooled** one — it looks like `postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/dbname?sslmode=require` and is the one meant for serverless.

### 2. Local development

```bash
cp .env.example .env.local   # set DATABASE_URL and AUTH_SECRET
npm install
npm run dev                  # http://localhost:3000
```

`AUTH_SECRET` signs the session cookie — generate a strong random value with `openssl rand -base64 32`.

### 3. Deploy on Vercel

1. vercel.com → **Add New → Project** → import `KhoaVu-Sked/vn-ai-ideas-hub`. Next.js is auto-detected; no build settings needed.
2. **Environment Variables** (Production + Preview):
   - `DATABASE_URL` — the pooled Neon string.
   - `AUTH_SECRET` — a strong random value (`openssl rand -base64 32`). Without it, sign-in fails.
3. Deploy. Pin the URL in `#ai-ideas`.

> **Plan check:** Vercel's free Hobby tier is licensed for personal, non-commercial use. An internal Skedulo tool should run under a Skedulo Vercel Team / Pro account — confirm before the team-wide rollout.

## Auth

- **Login page** at `/login`. `middleware.js` redirects any unauthenticated page visit there; the `/api/*` data routes independently return `401` JSON, so the API is protected even if middleware is bypassed.
- **Accounts** live in the `accounts` table. Passwords are stored **only as bcrypt hashes** — never plaintext.
- **Seeded admin:** `skedadmin` (role `admin`). Its hash is set by `schema.sql`. **Change this password after first login** — it's weak and was shared in setup.
- **Add a user:** insert a row with a bcrypt hash. Generate one with `node -e "console.log(require('bcryptjs').hashSync('their-password',10))"`, then `insert into accounts (username, password_hash, role) values ('name','<hash>','member');`.
## Views

- **Board** (`/`) — cards with status + tag pills and team avatars, a 6-stage pipeline strip, search and status filter. Clicking a card opens the full idea page; the **Preview** button opens a read-only drawer.
- **Idea detail** (`/idea/[id]`) — the full page (Mock-up 3): Like (toggle), Add request, Join the team (role picker), Follow updates; Context / Pain points / Expected benefit (Project-Lead-editable); a Requests & input thread; the Team & roles sidebar; and a progress timeline.

## Lifecycle

Six stages: **Submitted → In Review → Approved → In Progress → Pilot → Launched**, plus **On Hold** and **Declined** as off-timeline states. Only a Project Lead (or admin) changes an idea's status.

## Roles (per idea)

Project Lead (max 1), Initiator / Idea Lead, AI Design, Form / UX Design, Data / Ops, Tester, Observer. The idea's creator becomes its Project Lead. Observers don't show as board avatars.

## API

| Route | Method | Purpose |
|---|---|---|
| `/api/auth/login` \| `logout` \| `me` | POST / POST / GET | Session sign-in, sign-out, current user |
| `/api/projects` | GET / POST | Board list / create idea |
| `/api/projects/:id` | GET / PATCH | Drawer preview / change status (lead) |
| `/api/ideas/:id` | GET / PATCH | Full detail / edit content (lead) |
| `/api/ideas/:id/like` | POST | Toggle like |
| `/api/ideas/:id/follow` | POST | Toggle follow |
| `/api/ideas/:id/requests` | POST | Add a request |
| `/api/ideas/:id/requests/:reqId` | DELETE / PATCH | Remove (author/lead) / triage state (lead) |
| `/api/ideas/:id/members` | POST / DELETE | Join in a role / leave |
| `/api/tags` | GET / POST | List tags / add tag (admin) |

## Data model

- `ideas` — `id, seq, name, status, tags text[], initiator_account_id, target_date, context, pain_points, expected_benefit, created_at, updated_at`. `seq` drives the `IDEA-007` number; the detail page's content is Context / Pain points / Expected benefit.
- `accounts` — `id, username, password_hash, name, role, created_at`. Login credentials + display name; `password_hash` is bcrypt.
- `tags` — `id, name, created_at`. Admin-managed catalog of allowed tags.
- `idea_members` — `id, idea_id, account_id, role, created_at`. Per-idea team; unique `(idea_id, account_id)`; a partial unique index enforces one Project Lead per idea.
- `likes` — `(idea_id, account_id)` PK. One like per person (toggle).
- `requests` — `id, idea_id, account_id, body, state, created_at`. `state`: open / accepted / under_discussion / declined.
- `follows` — `(idea_id, account_id)` PK.

## Known caveats

- **Follow emails aren't wired yet** — the Follow button records the follow; the email/Slack side is a later n8n job.
- **User management is SQL-only** — add accounts / change passwords via SQL (see Auth). No self-serve reset UI yet.
- **AUTH_SECRET must be set** in every environment, or sign-in fails and everyone is redirected to `/login`.
- **Pooled connection**: use Neon's pooled connection string for serverless; the HTTP driver is stateless, so no connection-pool tuning is needed.

## Roadmap

1. **Auth hardening** — self-serve password change/reset, admin user-management UI; optionally swap username/password for Google SSO restricted to `skedulo.com` (the SSO NFR) if the team prefers it
2. **Likes / "I'm in!"** — now unblocked (accounts exist for attribution)
3. **Leader dashboard page** — KPIs, funnel, needs-attention (port of the dashboard mock-up)
4. **n8n automations** — Slack notify on status transitions, 7-day review-SLA checks, stale-idea flags
