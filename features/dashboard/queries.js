// The leader dashboard — one aggregate query per panel.

import { sql } from "@/lib/sql";

// ── leader dashboard ──────────────────────────────────────────
// `since` (ISO string or null) filters idea-based metrics by created_at;
// participation and contributors are all-time. `quarterStart` drives the
// "+N this quarter" delta on the total tile.
export async function getDashboard({ since = null, quarterStart = null } = {}) {
  // The Neon HTTP driver does one round trip per query, so run every
  // independent query in a single parallel wave instead of 8 sequential hops.
  const [countsRows, nqRows, partRows, statusRows, categoryRows, flagRows, engagementRows, contributorRows] = await Promise.all([
    sql`
      select
        count(*)::int as total,
        count(*) filter (where status in ('In Review','Approved','In Progress','Pilot'))::int as active,
        count(*) filter (where status = 'Launched')::int as launched
      from ideas i
      where (${since}::timestamptz is null or i.created_at >= ${since})
    `,
    quarterStart
      ? sql`select count(*)::int as n from ideas where created_at >= ${quarterStart}`
      : Promise.resolve([{ n: 0 }]),
    sql`
      select
        (select count(*) from accounts)::int as total_accounts,
        (select count(*) from (
          select initiator_account_id as acct from ideas where initiator_account_id is not null
          union select account_id from likes
          union select account_id from requests
          union select account_id from idea_members
          union select account_id from follows
        ) e)::int as engaged
    `,
    sql`
      select status, count(*)::int as n from ideas i
      where (${since}::timestamptz is null or i.created_at >= ${since})
      group by status
    `,
    sql`
      select t as tag, count(*)::int as n, min(tg.color) as color
      from ideas i
      cross join unnest(i.tags) as t
      left join tags tg on tg.name = t
      where (${since}::timestamptz is null or i.created_at >= ${since})
      group by t order by n desc, t asc
    `,
    sql`
      select name, status,
        greatest(0, extract(day from (now() - updated_at))::int) as days_update,
        greatest(0, extract(day from (now() - created_at))::int) as days_created
      from ideas
      where status in ('On Hold', 'In Review') and (${since}::timestamptz is null or created_at >= ${since})
    `,
    sql`
      select * from (
        select i.id, i.name, i.status, i.target_date,
          (select count(*) from likes l where l.idea_id = i.id)::int as likes,
          (select count(*) from requests r where r.idea_id = i.id)::int as requests,
          (select count(*) from idea_members m where m.idea_id = i.id)::int as members
        from ideas i
        where (${since}::timestamptz is null or i.created_at >= ${since})
      ) x
      order by (likes + requests + members) desc, name asc
      limit 8
    `,
    sql`
      select a.id, coalesce(a.name, a.username) as name, a.username, a.avatar_color, a.avatar_url,
        (select count(*) from ideas i where i.initiator_account_id = a.id)::int as ideas,
        (select count(*) from requests r where r.account_id = a.id)::int as requests,
        (select count(*) from idea_members m where m.account_id = a.id)::int as teams
      from accounts a
    `,
  ]);

  const counts = countsRows[0];
  const nq = nqRows[0]?.n || 0;
  const part = partRows[0];

  const byStatus = {};
  statusRows.forEach((r) => { byStatus[r.status] = r.n; });

  // Each idea counts once, at the stage it is currently in (a Launched idea is
  // only in Launched). Percentages are that stage's share of all ideas.
  const order = ["Submitted", "In Review", "Approved", "In Progress", "Pilot", "Launched"];
  const funnel = order.map((s) => ({ stage: s, status: s, count: byStatus[s] || 0 }));
  const totalIdeas = counts.total || 0;
  funnel.forEach((f) => { f.pct = totalIdeas ? Math.round((f.count / totalIdeas) * 100) : 0; });

  const categories = categoryRows.map((c) => ({ tag: c.tag, count: c.n, color: c.color || null }));

  const flags = [];
  flagRows.filter((r) => r.status === "On Hold").sort((a, b) => b.days_update - a.days_update).slice(0, 3)
    .forEach((r) => flags.push(`"${r.name}" on hold ${r.days_update} days — no update from idea lead`));
  const overSla = flagRows.filter((r) => r.status === "In Review" && r.days_created > 7).length;
  if (overSla) flags.push(`${overSla} idea${overSla > 1 ? "s" : ""} in review > 7 days — review SLA is 7 days`);

  const engagement = engagementRows.map((e) => ({
    id: e.id, name: e.name, status: e.status, target: e.target_date,
    likes: e.likes, requests: e.requests, members: e.members,
  }));

  const contributors = contributorRows
    .map((c) => ({ ...c, score: c.ideas * 5 + c.requests * 1 + c.teams * 2 }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  return {
    kpi: {
      total: counts.total, active: counts.active, launched: counts.launched,
      launchedPct: counts.total ? Math.round((counts.launched / counts.total) * 100) : 0,
      newThisQuarter: nq,
      participationPct: part.total_accounts ? Math.round((part.engaged / part.total_accounts) * 100) : 0,
      engaged: part.engaged, totalAccounts: part.total_accounts,
      hoursSaved: null, // not tracked yet — no per-idea estimate stored
    },
    funnel, categories, flags, engagement, contributors,
  };
}
