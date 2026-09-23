// Checks the couplings the build cannot see.
//
// Every one of these guards a mistake this project has actually made, not a
// hypothetical. `next build` only type-checks imports; it has nothing to say
// about a role name spelled inside a SQL string, two schema files that drifted
// apart, or a guide describing a screen that was deleted.
//
//   bun scripts/check-consistency.mjs
//
// Exits non-zero on a problem, so it can go in CI or a pre-push hook.

import { readFileSync, readdirSync, existsSync } from "node:fs";

const read = (p) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const problems = [];
const fail = (check, detail, why) => problems.push({ check, detail, why });

// ── 1. Role and state names written inside SQL ────────────────────
// The board once tested for 'Initiator / Project Lead', a role migration 012
// had already split in two. The check matched nobody, so only admins could
// move a card — and nothing flagged it, because it is a string.
{
  const consts = read("features/ideas/constants.js");
  const listOf = (name) => {
    const m = consts.match(new RegExp(`export const ${name} = \\[([^\\]]*)\\]`, "s"));
    return m ? [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : [];
  };
  const single = (name) => (consts.match(new RegExp(`export const ${name} = "([^"]+)"`)) || [])[1];

  const roles = [...listOf("ROLES"), single("INITIATOR_ROLE"), single("LEAD_ROLE")].filter(Boolean);
  const taskStates = [...listOf("TASK_ORDER"), single("TASK_DECLINED")].filter(Boolean);
  const statuses = [...listOf("STATUS_ORDER"), ...listOf("SIDE_STATUSES")].filter(Boolean);

  for (const file of sqlBearingFiles()) {
    const src = read(file);
    for (const [, role] of src.matchAll(/roles @> array\['([^']+)'\]/g)) {
      if (!roles.includes(role)) {
        fail("sql-role", `${file}: array['${role}']`,
          `no such role in constants.js — known: ${roles.join(", ")}`);
      }
    }
    for (const [, st] of src.matchAll(/\bstate\s*=\s*'([a-z_]+)'/g)) {
      if (!taskStates.includes(st)) {
        fail("sql-task-state", `${file}: state = '${st}'`,
          `not a board column — known: ${taskStates.join(", ")}`);
      }
    }
    // `status` is only the idea lifecycle inside the ideas feature. Feedback
    // has its own open/resolved vocabulary and is not this check's business.
    const isIdeaFeature = file.startsWith("features/ideas/") || file.includes("/api/ideas/") || file.includes("/api/projects/");
    for (const [, st] of src.matchAll(/\bstatus\s*=\s*'([^']+)'/g)) {
      if (isIdeaFeature && !statuses.includes(st)) {
        fail("sql-status", `${file}: status = '${st}'`,
          `not an idea status — known: ${statuses.join(", ")}`);
      }
    }
  }
}

// ── 2. The two schema files must describe the same database ───────
// docs/fresh-install.sql provisions a NEW database. It has silently fallen
// behind schema.sql twice; each time, the app worked for everyone who already
// had a row and failed only for new people.
{
  const tablesOf = (src) =>
    new Set([...src.matchAll(/create table (?:if not exists )?(\w+)/g)].map((m) => m[1]));
  const colsOf = (src, table) => {
    const m = src.match(new RegExp(`create table (?:if not exists )?${table} \\(([^;]*?)\\n\\);`, "s"));
    if (!m) return new Set();
    return new Set(m[1].split("\n")
      .map((l) => l.trim().replace(/^--.*/, ""))
      .filter((l) => l && !/^(primary key|unique|constraint|foreign key|check)\b/i.test(l))
      .map((l) => l.split(/\s+/)[0])
      .filter((w) => /^[a-z_]+$/.test(w)));
  };

  const schema = read("schema.sql");
  const fresh = read("docs/fresh-install.sql");
  if (schema && fresh) {
    const a = tablesOf(schema), b = tablesOf(fresh);
    for (const t of a) {
      if (!b.has(t)) fail("schema-drift", `table "${t}"`, "in schema.sql but not docs/fresh-install.sql");
    }
    // Migrations drop columns, so schema.sql's fresh-create block can legitimately
    // list a column the replay later removes. Only flag the other direction:
    // something fresh-install would never create.
    for (const t of [...a].filter((t) => b.has(t))) {
      const missing = [...colsOf(schema, t)].filter((c) => !colsOf(fresh, t).has(c));
      const dropped = new Set([...schema.matchAll(/alter table (\w+) drop column if exists (\w+)/g)]
        .filter((m) => m[1] === t).map((m) => m[2]));
      const real = missing.filter((c) => !dropped.has(c));
      if (real.length) {
        fail("schema-drift", `${t}: ${real.join(", ")}`, "column in schema.sql, absent from docs/fresh-install.sql");
      }
    }
  }
}

// ── 3. Every migration must be replayed in schema.sql ─────────────
// schema.sql carries both a fresh-install path and a replay of every migration.
// A migration that never reaches it means a rebuilt database is missing it.
{
  const schema = read("schema.sql");
  for (const f of readdirSync("migrations").filter((f) => /^\d+_.*\.sql$/.test(f)).sort()) {
    const src = read(`migrations/${f}`);
    const added = [...src.matchAll(/alter table (\w+) add column if not exists (\w+)/g)];
    const tables = [...src.matchAll(/create table (?:if not exists )?(\w+)/g)].map((m) => m[1]);
    for (const [, table, col] of added) {
      const inFresh = new RegExp(`create table (?:if not exists )?${table} \\([^;]*?\\b${col}\\b`, "s").test(schema);
      const inReplay = new RegExp(`alter table ${table} add column if not exists ${col}\\b`).test(schema);
      if (!inFresh && !inReplay) {
        fail("migration-not-replayed", `${f}: ${table}.${col}`, "never reaches schema.sql");
      }
    }
    for (const t of tables) {
      if (!new RegExp(`create table (?:if not exists )?${t}\\b`).test(schema)) {
        fail("migration-not-replayed", `${f}: table ${t}`, "never reaches schema.sql");
      }
    }
  }
}

// ── 4. The guides must not describe vocabulary that was removed ───
// The user guide documented "Accepted by idea lead" and "Under discussion"
// months after the board replaced them.
{
  const consts = read("features/ideas/constants.js");
  const live = new Set([...consts.matchAll(/label:\s*"([^"]+)"/g)].map((m) => m[1]));
  const retired = [
    "Accepted by idea lead", "Under discussion", "Requests &amp; input", "Forgot password",
    // The creator is the Initiator now; saying otherwise contradicts the
    // release note the same deploy shows every user.
    "you become its <b>Project Lead</b>",
  ];
  for (const doc of ["docs/user-guide.html", "docs/admin-guide.html"]) {
    const src = read(doc);
    for (const phrase of retired) {
      if (src.includes(phrase) && !live.has(phrase)) {
        fail("stale-doc", `${doc}: "${phrase}"`, "describes something the app no longer has");
      }
    }
  }
}

// ── 5. Identifiers used but never imported ────────────────────────
// `next build` resolves imports; it does not notice that a file calls useRef
// without importing it. That is a clean build and a crash on first render, and
// it has happened four times here.
{
  const HOOKS = ["useState", "useEffect", "useCallback", "useRef", "useMemo",
                 "useContext", "useReducer", "useLayoutEffect"];
  for (const file of sqlBearingFiles()) {
    if (!/\.jsx?$/.test(file)) continue;
    const src = read(file);
    const imported = new Set();
    for (const m of src.matchAll(/^import \{([^}]*)\} from/gm)) {
      for (const n of m[1].split(",")) imported.add(n.trim().split(" as ")[0]);
    }
    for (const m of src.matchAll(/^import (\w+)(?:\s*,\s*\{[^}]*\})? from/gm)) imported.add(m[1]);
    // declared locally is fine too
    for (const m of src.matchAll(/(?:const|let|function)\s+(\w+)/g)) imported.add(m[1]);

    for (const hook of HOOKS) {
      if (new RegExp(`\\b${hook}\\s*\\(`).test(src) && !imported.has(hook)) {
        fail("missing-import", `${file}: ${hook}()`, "used but never imported — builds fine, crashes at runtime");
      }
    }
  }
}

// ── 6. publish calls must name a variable their handler declares ───
// `publishIdea(id, "task")` shipped in a handler that destructured only
// { taskId }. It is a ReferenceError thrown while evaluating the argument, so
// publish.js's own try/catch never sees it — the route's catch turns it into a
// 500 on a write that had already committed. Check 5 missed it: that one only
// knows React hook names.
{
  const routes = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(p);
      else if (e.name === "route.js") routes.push(p);
    }
  };
  if (existsSync("app/api")) walk("app/api");

  for (const file of routes) {
    const src = read(file);
    if (!/publish(Idea|Board)\(/.test(src)) continue;
    for (const part of src.split(/(?=^export async function )/m)) {
      const verb = part.match(/^export async function (\w+)/);
      if (!verb) continue;
      // Names this handler has in scope: its own declarations plus module-level ones.
      const scope = new Set();
      for (const m of part.matchAll(/const \{([^}]*)\}\s*=/g)) {
        for (const n of m[1].split(",")) scope.add(n.trim().split(":").pop().trim());
      }
      for (const m of part.matchAll(/(?:const|let|var)\s+(\w+)\s*=/g)) scope.add(m[1]);
      // for (const x of …) and .map((x) => …) bind a name without an `=`.
      for (const m of part.matchAll(/for\s*\(\s*(?:const|let|var)\s+(\w+)\s+of\b/g)) scope.add(m[1]);
      for (const m of part.matchAll(/\(\s*\(?(\w+)\)?\s*=>/g)) scope.add(m[1]);
      for (const m of src.matchAll(/^(?:const|let|function)\s+(\w+)/gm)) scope.add(m[1]);
      for (const m of src.matchAll(/^import[^;]*?\{([^}]*)\}/gm)) {
        for (const n of m[1].split(",")) scope.add(n.trim().split(" as ").pop().trim());
      }
      for (const m of part.matchAll(/publish(?:Idea|Board)\(\s*([A-Za-z_$][\w$]*)/g)) {
        const name = m[1];
        if (!scope.has(name)) {
          fail("undeclared-arg", `${file}: publish…(${name}) in ${verb[1]}`,
            "not declared in this handler — a ReferenceError that becomes a 500 on a committed write");
        }
      }
    }
  }
}

// ── 7. Every Manage section must have somewhere to render ─────────
// sections.js drives both the header menu and the page selector. A key with no
// matching branch is a menu entry that opens a blank panel — and nothing else
// would tell you.
{
  const list = read("features/admin/sections.js");
  const page = read("features/admin/ManagePage.jsx");
  for (const m of list.matchAll(/\["(\w+)",\s*"[^"]*"\]/g)) {
    const key = m[1];
    if (!page.includes(`view === '${key}'`) && !page.includes(`view === "${key}"`)) {
      fail("orphan-section", `sections.js: "${key}"`, "no render branch in ManagePage — the menu entry would show nothing");
    }
  }
}

// ── 8. The release note must be bumped when its content changes ────
// last_seen_release is compared against RELEASE. Editing NEWS without changing
// RELEASE means nobody who dismissed the previous note ever sees the new one.
{
  const src = read("features/announcements/release.js");
  if (src) {
    const rel = (src.match(/export const RELEASE = "([^"]+)"/) || [])[1];
    if (!rel) fail("release", "features/announcements/release.js", "no RELEASE constant");
    else {
      // The key is a date plus a slug; a stale one is the common mistake.
      const dated = /^\d{4}-\d{2}-\d{2}/.test(rel);
      if (!dated) {
        fail("release", `RELEASE = "${rel}"`, "start it with a date so a stale key is obvious at a glance");
      }
    }
  }
}

// ── 5. The Drive tool must never reach the server ─────────────────
// features/tools/drive/ talks to Google from the browser with the user's own
// token, and keeps nothing. That is the whole security position of the tool it
// was ported from: a central list of every over-shared file at Skedulo would
// itself be worth attacking, so one must not come to exist.
//
// The dangerous version of this rule is the polite one in a comment. Someone
// adds an endpoint to cache a scan, for entirely sensible reasons, and the
// property is gone with nothing to notice. So it is checked.
{
  const serverFiles = [];
  const walkApi = (dir) => {
    if (!existsSync(dir)) return;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = `${dir}/${e.name}`;
      if (e.isDirectory()) walkApi(p);
      else if (/\.(js|jsx)$/.test(e.name)) serverFiles.push(p);
    }
  };
  walkApi("app/api");

  for (const file of serverFiles) {
    const src = read(file);
    if (/from\s+["']@\/features\/tools\/drive/.test(src)) {
      fail("drive-on-server", file,
        "imports features/tools/drive — that code is browser-only by design");
    }
    if (/googleapis\.com\/drive\//.test(src)) {
      fail("drive-on-server", file,
        "calls the Drive API from the server — the user's browser must make that call");
    }
  }

  // The token must not be written anywhere that outlives the tab. Comments are
  // stripped first: the file that explains why it does not use localStorage
  // should not be reported for saying the word.
  const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  for (const file of sqlBearingFiles().filter((f) => f.startsWith("features/tools/drive/"))) {
    const src = stripComments(read(file));
    if (/\b(localStorage|sessionStorage|indexedDB)\b|document\.cookie/.test(src)) {
      fail("drive-token-stored", file,
        "persists something in the browser — the Drive token must live in memory only");
    }
  }
}

// ── 6. The page and the Apps Script watcher must agree ────────────
// features/tools/drive/constants.js and apps-script/Code.gs are separate
// programs. They never talk to each other — there is no server between them —
// so they meet through two files in the user's own Drive, found by name.
//
// Nothing at runtime notices when they drift. A typo in a query returns zero
// rows and no error, and the scan reports all clear. Get a name wrong and the
// two halves simply stop finding each other.
//
// Compared by decoded value, not by source text: Code.gs writes the em dash as
// \u2014 inside single quotes and constants.js uses a literal one in double
// quotes. Same string, different bytes.
{
  const SHARED = ["LINK_Q", "DOMAIN_Q", "OWNED", "SETTINGS_NAME", "STATUS_NAME"];
  const decode = (raw) =>
    raw.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
       .replace(/\\(['"\\])/g, "$1");
  const valueOf = (src, name) => {
    const m = src.match(new RegExp(`(?:const|var|let|export const)\\s+${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`));
    return m ? decode(m[2]) : null;
  };

  const page = read("features/tools/drive/constants.js");
  const gs = read("apps-script/Code.gs");
  if (page && gs) {
    for (const name of SHARED) {
      const a = valueOf(page, name);
      const b = valueOf(gs, name);
      if (a === null || b === null) {
        fail("drive-drift", name,
          `missing from ${a === null ? "features/tools/drive/constants.js" : "apps-script/Code.gs"}`);
      } else if (a !== b) {
        fail("drive-drift", name,
          `page has ${JSON.stringify(a)}, Code.gs has ${JSON.stringify(b)} — the two halves will stop agreeing`);
      }
    }
  }
}

// ── 6b. The schedule vocabulary must agree too ────────────────────
// The watched-folder panel offers a frequency list and a day list, and Code.gs
// matches both as exact strings. installTrigger THROWS on a frequency it does
// not know — and reconcileTrigger_ catches that into a log line — so a value
// added on one side only leaves the old trigger running while the panel says
// the new one is in force. Nothing fails; the screen simply lies.
{
  const page = read("features/tools/drive/constants.js");
  const gs = read("apps-script/Code.gs");
  if (page && gs) {
    const listOf = (src, name) => {
      const m = src.match(new RegExp(`export const ${name}\\s*=\\s*\\[([^\\]]*)\\]`));
      return m ? [...m[1].matchAll(/["']([^"']+)["']/g)].map((x) => x[1]) : null;
    };

    // Code.gs's own allow-list: ['weekly','daily','hourly'] plus MINUTE_FREQ_'s keys.
    const minuteKeys = (() => {
      const m = gs.match(/const MINUTE_FREQ_\s*=\s*\{([^}]*)\}/);
      return m ? [...m[1].matchAll(/([A-Za-z0-9_]+)\s*:/g)].map((x) => x[1]) : [];
    })();
    const gsAllowed = new Set(["weekly", "daily", "hourly", ...minuteKeys]);

    const offered = listOf(page, "FREQUENCY_VALUES");
    if (!offered) {
      fail("drive-drift", "FREQUENCY_VALUES", "missing from features/tools/drive/constants.js");
    } else {
      for (const value of offered) {
        if (!gsAllowed.has(value)) {
          fail("drive-drift", `FREQUENCY_VALUES: ${value}`,
            `the panel offers it, Code.gs does not accept it — installTrigger would throw and the old schedule would stay`);
        }
      }
    }

    const days = listOf(page, "DAY_VALUES");
    if (!days) {
      fail("drive-drift", "DAY_VALUES", "missing from features/tools/drive/constants.js");
    } else {
      for (const day of days) {
        if (!new RegExp(`\\b${day}\\b`).test(gs)) {
          fail("drive-drift", `DAY_VALUES: ${day}`,
            "the panel offers it but ScriptApp.WeekDay is never looked up with it in Code.gs");
        }
      }
    }
  }
}

function sqlBearingFiles() {
  const out = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      const p = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(p);
      else if (/\.(js|jsx)$/.test(e.name)) out.push(p);
    }
  };
  for (const d of ["features", "app", "lib", "components"]) if (existsSync(d)) walk(d);
  return out;
}

// ── report ────────────────────────────────────────────────────────
if (problems.length === 0) {
  console.log("✓ consistency checks passed");
  process.exit(0);
}
const byCheck = {};
for (const p of problems) (byCheck[p.check] ||= []).push(p);
for (const [check, list] of Object.entries(byCheck)) {
  console.log(`\n${check} (${list.length})`);
  for (const p of list) console.log(`  ${p.detail}\n     ${p.why}`);
}
console.log(`\n${problems.length} problem(s).`);
process.exit(1);
