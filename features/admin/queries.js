// Admin-managed reference data — tags, time frames, submit-form fields,
// runtime settings — plus the audit log.

import { err, sql, toArray, toBool, toJsonArray } from "@/lib/sql";

// ── tags ──────────────────────────────────────────────────────
// Returns [{ name, color }]. color is a hex accent or null.
export async function listTags() {
  const rows = await sql`select name, color from tags order by name`;
  return rows.map((r) => ({ name: r.name, color: r.color || null }));
}
export async function addTag(name, color) {
  const clean = (name || "").trim();
  if (!clean) throw err(400, "Tag name is required.");
  await sql`insert into tags (name, color) values (${clean}, ${color || null}) on conflict (name) do nothing`;
  return listTags();
}
export async function setTagColor(name, color) {
  const clean = (name || "").trim();
  await sql`update tags set color = ${color || null} where name = ${clean}`;
  return listTags();
}
// Delete a tag from the catalog and strip it from every idea (ideas remain).
export async function deleteTag(name) {
  const clean = (name || "").trim();
  await sql`update ideas set tags = array_remove(tags, ${clean}) where ${clean} = any(tags)`;
  await sql`delete from tags where name = ${clean}`;
  return listTags();
}

// ── time frames (admin-managed options for "Expected time frame") ──
export async function listTimeFrames() {
  const rows = await sql`select name from time_frames order by position asc, name asc`;
  return rows.map((r) => r.name);
}
export async function addTimeFrame(name) {
  const clean = (name || "").trim();
  if (!clean) throw err(400, "Time frame name is required.");
  const pos = (await sql`select coalesce(max(position), 0) + 1 as p from time_frames`)[0].p;
  await sql`insert into time_frames (name, position) values (${clean}, ${pos}::int) on conflict (name) do nothing`;
  return listTimeFrames();
}
export async function deleteTimeFrame(name) {
  await sql`delete from time_frames where name = ${(name || "").trim()}`;
  return listTimeFrames();
}

// ── form fields (admin-configurable submit form) ──────────────
const FIELD_TYPES = ["text", "textarea", "number", "select"];
export async function listFormFields() {
  const rows = await sql`
    select id, key, label, type, options, required, position, archived
    from form_fields order by archived asc, position asc, created_at asc
  `;
  return rows.map((r) => ({
    id: r.id, key: r.key, label: r.label, type: r.type, options: toArray(r.options),
    required: toBool(r.required), position: r.position, archived: toBool(r.archived),
  }));
}
export async function createFormField({ label, type, options, required }) {
  const lab = (label || "").trim();
  if (!lab) throw err(400, "Field label is required.");
  const t = FIELD_TYPES.includes(type) ? type : "text";
  const opts = Array.isArray(options) ? options.map((o) => String(o).trim()).filter(Boolean) : [];
  const base = lab.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "field";
  let key = base, n = 1;
  while ((await sql`select 1 from form_fields where key = ${key} limit 1`).length) {
    n += 1; key = `${base}_${n}`; if (n > 50) { key = `${base}_${n}${lab.length}`; break; }
  }
  const pos = (await sql`select coalesce(max(position), 0) + 1 as p from form_fields`)[0].p;
  await sql`insert into form_fields (key, label, type, options, required, position) values (${key}, ${lab}, ${t}, ${opts}, ${!!required}, ${pos}::int)`;
  return listFormFields();
}
export async function updateFormField(id, { label, type, options, required }) {
  const t = FIELD_TYPES.includes(type) ? type : null;
  const opts = Array.isArray(options) ? options.map((o) => String(o).trim()).filter(Boolean) : null;
  const rows = await sql`
    update form_fields set
      label = coalesce(${(label || "").trim() || null}, label),
      type = coalesce(${t}, type),
      options = coalesce(${opts}::text[], options),
      required = coalesce(${typeof required === "boolean" ? required : null}, required)
    where id = ${id}
    returning id
  `;
  if (rows.length === 0) throw err(404, "Field not found.");
  return listFormFields();
}
// Move a field up/down by swapping positions with its active neighbour.
// Order is global, so every idea's form renders in the new order immediately.
export async function moveFormField(id, direction) {
  const active = (await sql`
    select id, position from form_fields where archived = false order by position asc, created_at asc
  `);
  const i = active.findIndex((f) => f.id === id);
  if (i === -1) throw err(404, "Field not found.");
  const j = direction === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= active.length) return listFormFields(); // already at the end
  // Renumber 1..n first so positions are always distinct, then swap the pair.
  await sql`
    update form_fields f set position = v.pos
    from (select id, row_number() over (order by position asc, created_at asc) as pos
          from form_fields where archived = false) v
    where f.id = v.id
  `;
  await sql`
    update form_fields set position = case when id = ${active[i].id}::uuid then ${j + 1}::int else ${i + 1}::int end
    where id in (${active[i].id}::uuid, ${active[j].id}::uuid)
  `;
  return listFormFields();
}

// "Delete" = archive: the field leaves the form, existing answers are kept.
export async function archiveFormField(id) {
  const rows = await sql`update form_fields set archived = true where id = ${id} returning id`;
  if (rows.length === 0) throw err(404, "Field not found.");
  return listFormFields();
}

// ── runtime settings ──────────────────────────────────────────
// Switches an admin flips without a redeploy. Stored as text; an absent row
// means "use the default", so a fresh database needs no seeding.
export const EMAIL_NOTIFICATIONS = "email_notifications";

export async function listSettings() {
  const rows = await sql`select key, value from app_settings`;
  const out = {};
  rows.forEach((r) => { out[r.key] = r.value; });
  return {
    // Default ON: a new install should behave normally without being configured.
    [EMAIL_NOTIFICATIONS]: out[EMAIL_NOTIFICATIONS] !== "off",
  };
}

export async function setSetting(key, value, accountId = null) {
  await sql`
    insert into app_settings (key, value, updated_by)
    values (${key}, ${value}, ${accountId}::uuid)
    on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by
  `;
  return listSettings();
}

// Read by lib/notify before sending. Fails OPEN on a database error — a broken
// settings lookup shouldn't silently stop every notification.
export async function notificationsEnabled() {
  try {
    const rows = await sql`select value from app_settings where key = ${EMAIL_NOTIFICATIONS}`;
    return rows[0]?.value !== "off";
  } catch {
    return true;
  }
}

// ── audit log ─────────────────────────────────────────────────
const AUDIT_DAYS = 14;

// Insert + prune in ONE statement, so retention needs no cron job.
export async function addAuditEntry({ actorId, actor, action, entity, entityId }) {
  await sql`
    with ins as (
      insert into audit_log (actor, actor_id, action, entity, entity_id)
      values (${actor || null}, ${actorId || null}, ${action}, ${entity || null}, ${entityId || null})
      returning 1
    )
    delete from audit_log where created_at < now() - interval '14 days'
  `;
  return { ok: true };
}

// Filtered page of entries plus the actor/type vocabularies for the dropdowns,
// in one round trip. `from`/`to` are whole days, inclusive, resolved in `tz` —
// the viewer's zone, so the boundaries match the timestamps on screen.
export async function listAuditEntries({ limit = 200, actor = null, type = null, from = null, to = null, tz = "UTC" } = {}) {
  const rows = await sql`
    with recent as (
      select id, actor, action, entity, created_at
      from audit_log
      where created_at >= now() - interval '14 days'
    ),
    hits as (
      select * from recent
      where (${actor}::text is null or actor = ${actor}::text)
        and (${type}::text is null or entity = ${type}::text)
        and (${from}::date is null or (created_at at time zone ${tz}::text)::date >= ${from}::date)
        and (${to}::date is null or (created_at at time zone ${tz}::text)::date <= ${to}::date)
      order by created_at desc
      limit ${Math.min(Number(limit) || 200, 500)}::int
    )
    select
      (select coalesce(json_agg(json_build_object(
         'id', id, 'actor', actor, 'action', action, 'entity', entity, 'at', created_at
       ) order by created_at desc), '[]'::json) from hits) as entries,
      (select coalesce(json_agg(distinct actor), '[]'::json) from recent where actor is not null) as actors,
      (select coalesce(json_agg(distinct entity), '[]'::json) from recent where entity is not null) as types
  `;
  const r = rows[0] || {};
  return {
    entries: toJsonArray(r.entries).map((e) => ({ ...e, actor: e.actor || "Someone", entity: e.entity || null })),
    actors: toJsonArray(r.actors).sort((a, b) => a.localeCompare(b)),
    types: toJsonArray(r.types).sort(),
  };
}
export const AUDIT_RETENTION_DAYS = AUDIT_DAYS;
