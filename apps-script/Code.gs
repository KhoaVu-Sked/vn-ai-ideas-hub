/**
 * Drive sharing check — scheduled watcher
 *
 * Runs on a timer under your own Google account and emails you when the
 * *sharing* of watched files and folders changes. It does not watch file
 * contents: editing a document sends no email.
 *
 * Two modes, independently switchable:
 *   1. WATCHLIST  — specific folders/files, including ones other people own.
 *                   Intended for shared team folders.
 *   2. MY DRIVE   — everything you own that is shared by link or org-wide.
 *
 * Nothing leaves your Google tenancy. No server, no database, no stored
 * credentials — the script runs as you, authorised once.
 *
 * Requires the Advanced Drive Service (v3). Setup steps are in README.md at
 * the repo root.
 */

// ----------------------------------------------------------------------------
// CONFIG — the only part you need to edit
// ----------------------------------------------------------------------------

const CONFIG = {
  /**
   * Team folders and files to keep watching. Paste Drive links or bare ids.
   * Folders are walked, including subfolders. Items owned by other people are
   * fine — see README for what can and cannot be seen on those.
   */
  // Set from the browser tool's Stop button. When true the script removes its
  // own trigger on the next run and stops.
  paused: false,

  watchlist: [
    // 'https://drive.google.com/drive/folders/1AbCdEf...',   // INITIATIVES
    // 'https://docs.google.com/document/d/1XyZ.../edit',     // a single doc
  ],

  // Whole-Drive monitoring is off by default: the watcher is for named folders
  // and files. The browser tool never turns this on.
  scanMyDrive: false,

  // Who gets the alerts. One address, or several separated by commas.
  // Blank = the account running the script.
  notifyEmail: '',


  // Email even when nothing changed, so you know it is still running.
  sendAllClearEmail: false,

  // Report organisation-wide *view* access. Off by default: usually
  // intentional, and including it buries the findings that need action.
  reportInfoLevel: false,

  // Report named people being added or removed, not just wider sharing. Only
  // possible where Drive shows named grants. No longer exposed in the browser
  // tool: it was one option too many, and on by default is the useful setting.
  reportPeopleChanges: true,

  // Safety rail on how many folders one run will walk.
  maxFoldersPerRun: 200,

  /**
   * When the scheduled check runs. Change these, then run installTrigger.
   *   frequency: 'weekly', 'daily', 'hourly', or one of the sub-hourly values
   *              'every5min' / 'every10min' / 'every15min' / 'every30min'.
   *              Sub-hourly is 96–288 runs a day and spends Google's daily
   *              script-runtime allowance accordingly.
   *   dayOfWeek: for weekly — MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY,
   *              SATURDAY or SUNDAY. Ignored otherwise.
   *   hour:      0–23, in the script's timezone (Project Settings → Time zone).
   *              Used by weekly and daily only.
   *
   * The browser tool can set all of this now. It writes the schedule into the
   * settings file only once someone actually picks one there; until then this
   * block stands and is left alone.
   */
  schedule: {
    frequency: 'weekly',
    dayOfWeek: 'MONDAY',
    hour: 9,
  },
};

// ----------------------------------------------------------------------------
// Classification — ported verbatim from the browser tool. Keep in sync.
// ----------------------------------------------------------------------------

const EDIT_ROLES = { writer: true, fileOrganizer: true, organizer: true };
const RANK = { OK: 0, Info: 1, Warning: 2, Critical: 3 };
const VERB = {
  writer: 'edit', reader: 'view', commenter: 'comment',
  fileOrganizer: 'manage content in', organizer: 'manage',
};

function verbFor_(role) {
  return VERB[role] || role || 'access';
}

function classify_(permissions) {
  let level = 'OK';
  let label = 'Named people only';

  (permissions || []).forEach(function (perm) {
    if (perm.type === 'user' && perm.role === 'owner') return;

    let entryLevel = 'OK';
    let entryLabel = '';

    if (perm.type === 'anyone') {
      entryLevel = 'Critical';
      entryLabel = 'Anyone with the link can ' + verbFor_(perm.role);
      if (perm.allowFileDiscovery) entryLabel += ', indexed by Google';
    } else if (perm.type === 'domain') {
      entryLevel = EDIT_ROLES[perm.role] ? 'Warning' : 'Info';
      const who = perm.domain || perm.emailAddress || 'your organisation';
      entryLabel = 'Everyone at ' + who + ' can ' + verbFor_(perm.role);
    }

    if (RANK[entryLevel] > RANK[level]) {
      level = entryLevel;
      label = entryLabel || label;
    }
  });

  return { level: level, label: label };
}

/**
 * Who currently has access, as a stable sorted list. Storing this — rather than
 * only the risk level — is what lets the script notice "a person was added"
 * when the level itself has not moved.
 * @return {Array<string>} e.g. ['user:writer:trung@skedulo.com']
 */
function granteeList_(permissions) {
  const out = [];
  (permissions || []).forEach(function (perm) {
    if (perm.type === 'user' && perm.role === 'owner') return;
    const who = perm.emailAddress || perm.domain || perm.type;
    out.push(perm.type + ':' + perm.role + ':' + who);
  });
  return out.sort();
}

// ----------------------------------------------------------------------------
// Baseline storage
//
// Apps Script caps a single property value at 9KB, which a few hundred entries
// will exceed. The baseline is chunked across numbered properties.
// ----------------------------------------------------------------------------

const BASELINE_PREFIX = 'baseline_';
const BASELINE_COUNT_KEY = 'baseline_chunks';
const CHUNK_SIZE = 8000;

function saveBaseline_(map) {
  const props = PropertiesService.getUserProperties();
  clearBaseline_();
  const json = JSON.stringify(map);
  const chunks = [];
  for (let i = 0; i < json.length; i += CHUNK_SIZE) {
    chunks.push(json.slice(i, i + CHUNK_SIZE));
  }
  chunks.forEach(function (chunk, i) { props.setProperty(BASELINE_PREFIX + i, chunk); });
  props.setProperty(BASELINE_COUNT_KEY, String(chunks.length));
}

function loadBaseline_() {
  const props = PropertiesService.getUserProperties();
  const count = Number(props.getProperty(BASELINE_COUNT_KEY) || 0);
  if (!count) return null; // null means "never run", not "nothing found"
  let json = '';
  for (let i = 0; i < count; i++) json += props.getProperty(BASELINE_PREFIX + i) || '';
  try {
    return JSON.parse(json);
  } catch (err) {
    Logger.log('Baseline unreadable, resetting: ' + err.message);
    return null;
  }
}

function clearBaseline_() {
  const props = PropertiesService.getUserProperties();
  const count = Number(props.getProperty(BASELINE_COUNT_KEY) || 0);
  for (let i = 0; i < count; i++) props.deleteProperty(BASELINE_PREFIX + i);
  props.deleteProperty(BASELINE_COUNT_KEY);
}

// ----------------------------------------------------------------------------
// Drive access
// ----------------------------------------------------------------------------

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const LINK_Q = "(visibility = 'anyoneWithLink' or visibility = 'anyoneCanFind')";
const DOMAIN_Q = "(visibility = 'domainWithLink' or visibility = 'domainCanFind')";
const OWNED = "'me' in owners and trashed = false";
const FILE_FIELDS = 'id,name,webViewLink,mimeType,ownedByMe,owners(emailAddress),' +
  'permissions(id,type,role,domain,emailAddress,allowFileDiscovery)';
const LIST_FIELDS = 'nextPageToken,files(' + FILE_FIELDS + ')';
const MAX_PAGES = 25;

function listAll_(query) {
  const out = [];
  let pageToken = null;
  let pages = 0;
  do {
    if (pages++ >= MAX_PAGES) {
      Logger.log('Stopped paging at ' + MAX_PAGES + ' pages for: ' + query);
      break;
    }
    const res = Drive.Files.list({
      q: query, fields: LIST_FIELDS, pageSize: 1000,
      spaces: 'drive', corpora: 'user', pageToken: pageToken || undefined,
    });
    (res.files || []).forEach(function (f) { out.push(f); });
    pageToken = res.nextPageToken || null;
  } while (pageToken);
  return out;
}

function getFile_(id) {
  try {
    return Drive.Files.get(id, { fields: FILE_FIELDS, supportsAllDrives: true });
  } catch (err) {
    Logger.log('Could not read ' + id + ': ' + err.message);
    return null;
  }
}

/** Accepts a Drive URL or a bare id. */
function idFromRef_(ref) {
  const text = String(ref || '').trim();
  let m = /\/folders\/([A-Za-z0-9_-]{15,})/.exec(text);
  if (m) return m[1];
  m = /\/d\/([A-Za-z0-9_-]{15,})/.exec(text);
  if (m) return m[1];
  m = /[?&]id=([A-Za-z0-9_-]{15,})/.exec(text);
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]{15,}$/.test(text)) return text;
  return null;
}

// ----------------------------------------------------------------------------
// Settings from Drive
//
// The browser tool writes its settings into the DESCRIPTION of a file in your
// Drive. A description is metadata, so this reads it under the same
// drive.metadata.readonly scope used for scanning — no extra permission.
// Anything found there overrides the CONFIG above; anything absent falls back
// to CONFIG, so the script still works with no settings file at all.
// ----------------------------------------------------------------------------

const SETTINGS_NAME = 'Drive sharing check \u2014 settings';
let SETTINGS_SOURCE = 'built-in CONFIG';

function readDriveSettings_() {
  try {
    const res = Drive.Files.list({
      q: "name = '" + SETTINGS_NAME.replace(/'/g, "\\'") + "' and trashed = false",
      fields: 'files(id,name,description)',
      pageSize: 5,
    });
    const file = (res.files || [])[0];
    if (!file || !file.description) return null;
    const parsed = JSON.parse(file.description);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch (err) {
    // A malformed or unreadable settings file must not stop the check.
    Logger.log('Could not read settings from Drive, using built-in CONFIG: ' + err.message);
    return null;
  }
}

/** Overlays Drive settings onto CONFIG. Called once at the start of each run. */
function applyDriveSettings_() {
  const cfg = readDriveSettings_();
  if (!cfg) { SETTINGS_SOURCE = 'built-in CONFIG (no settings file found)'; return false; }

  if (Array.isArray(cfg.watchlist)) CONFIG.watchlist = cfg.watchlist;
  ['scanMyDrive', 'sendAllClearEmail', 'reportInfoLevel', 'reportPeopleChanges']
    .forEach(function (key) {
      if (typeof cfg[key] === 'boolean') CONFIG[key] = cfg[key];
    });
  // paused is absolute: an absent flag means running, never "keep the old value".
  CONFIG.paused = cfg.paused === true;
  if (typeof cfg.notifyEmail === 'string') CONFIG.notifyEmail = cfg.notifyEmail;
  // Only the object form is read, and deliberately. The browser tool used to
  // write `schedule` as a bare string, but it was never a choice anyone made:
  // the old normaliser filled in "weekly" whatever the file said, so every
  // settings file out there carries that string. Honouring it would reset a
  // schedule someone had hand-set in CONFIG back to weekly on the next run.
  // The tool now writes an object, which is what a real choice looks like.
  if (cfg.schedule && typeof cfg.schedule === 'object') {
    const sched = cfg.schedule;
    if (sched.frequency) CONFIG.schedule.frequency = sched.frequency;
    if (sched.dayOfWeek) CONFIG.schedule.dayOfWeek = sched.dayOfWeek;
    if (typeof sched.hour === 'number') CONFIG.schedule.hour = sched.hour;
  }
  SETTINGS_SOURCE = 'Drive settings file' + (cfg.savedAt ? ' (saved ' + cfg.savedAt + ')' : '');
  return true;
}

/**
 * Rebuilds the trigger when the configured schedule no longer matches what is
 * installed, so changing the time in the browser tool takes effect on its own
 * without anyone re-running installTrigger.
 */
/* Creates the trigger if it is missing, or rebuilds it if the schedule changed.
   Never fights a deliberate stop: pausing is how you turn monitoring off. */
function ensureTrigger_() {
  if (CONFIG.paused) return;   // never fight a pause, but never delete it either

  const installed = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === 'runCheck';
  });
  if (!installed) {
    try {
      installTrigger();
      Logger.log('Scheduled check started automatically. Nothing else to set up.');
    } catch (err) {
      Logger.log('Could not start the schedule: ' + err.message);
    }
    return;
  }
  reconcileTrigger_();
}

function reconcileTrigger_() {
  const props = PropertiesService.getUserProperties();
  const want = [
    String(CONFIG.schedule.frequency || 'weekly').toLowerCase(),
    String(CONFIG.schedule.dayOfWeek || '').toUpperCase(),
    String(CONFIG.schedule.hour),
  ].join('|');

  const installed = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === 'runCheck';
  });
  if (installed && props.getProperty('schedule_signature') === want) return;

  try {
    installTrigger();
    Logger.log('Schedule updated from settings.');
  } catch (err) {
    Logger.log('Could not apply the schedule: ' + err.message);
  }
}

// ----------------------------------------------------------------------------
// Scanning
// ----------------------------------------------------------------------------

function record_(map, file, sourceName) {
  const verdict = classify_(file.permissions);
  const hasPerms = Array.isArray(file.permissions);
  map[file.id] = {
    name: file.name || 'Untitled',
    level: verdict.level,
    label: verdict.label,
    url: file.webViewLink || ('https://drive.google.com/open?id=' + file.id),
    isFolder: file.mimeType === FOLDER_MIME,
    owner: (file.owners && file.owners[0] && file.owners[0].emailAddress) || '',
    mine: file.ownedByMe !== false,
    people: hasPerms ? granteeList_(file.permissions) : null,
    source: sourceName || '',
  };
}

/**
 * Walks the watchlist. The folder itself is inspected as well as its contents,
 * because sharing a folder exposes everything inside it.
 */
function scanWatchlist_(state) {
  const map = {};
  const refs = CONFIG.watchlist || [];

  refs.forEach(function (ref) {
    const rootId = idFromRef_(ref);
    if (!rootId) {
      state.problems.push('Not a Drive link or id: ' + ref);
      return;
    }
    const root = getFile_(rootId);
    if (!root) {
      state.problems.push('Could not read watched item: ' + ref);
      return;
    }

    const sourceName = root.name || rootId;
    state.rootNames.push(sourceName);
    record_(map, root, sourceName);

    if (root.mimeType !== FOLDER_MIME) return;

    const queue = [rootId];
    const visited = {};
    while (queue.length && state.foldersWalked < CONFIG.maxFoldersPerRun) {
      const parent = queue.shift();
      if (visited[parent]) continue;
      visited[parent] = true;
      state.foldersWalked++;

      listAll_("'" + parent.replace(/'/g, "\\'") + "' in parents and trashed = false")
        .forEach(function (child) {
          if (map[child.id]) return;                 // overlapping watch entries
          record_(map, child, sourceName);
          if (child.mimeType === FOLDER_MIME) queue.push(child.id);
        });
    }
    if (queue.length) {
      state.problems.push('Folder tree of "' + sourceName +
        '" was larger than one run walks; deeper subfolders were not reached.');
    }
  });

  return map;
}

/** Everything you own that Google's sharing index says is shared. */
function scanMyDrive_() {
  const map = {};
  const seen = {};
  listAll_(OWNED + ' and ' + LINK_Q)
    .concat(listAll_(OWNED + ' and ' + DOMAIN_Q))
    .forEach(function (file) {
      if (seen[file.id]) return;
      seen[file.id] = true;
      record_(map, file, 'My Drive');
    });
  return map;
}

/** Findings worth reporting: drop OK, and drop Info unless asked for. */
function reportable_(map) {
  const out = {};
  Object.keys(map).forEach(function (id) {
    const item = map[id];
    if (item.level === 'OK') return;
    if (item.level === 'Info' && !CONFIG.reportInfoLevel) return;
    out[id] = item;
  });
  return out;
}

// ----------------------------------------------------------------------------
// Change detection
// ----------------------------------------------------------------------------

function peopleDelta_(before, after) {
  // null means Drive did not show us the grantee list, so we cannot compare.
  if (!before || !after) return null;
  const beforeSet = {};
  before.forEach(function (x) { beforeSet[x] = true; });
  const afterSet = {};
  after.forEach(function (x) { afterSet[x] = true; });

  const added = after.filter(function (x) { return !beforeSet[x]; });
  const removed = before.filter(function (x) { return !afterSet[x]; });
  if (!added.length && !removed.length) return null;
  return { added: added, removed: removed };
}

function prettyGrantee_(entry) {
  const bits = String(entry).split(':');
  const type = bits[0], role = bits[1], who = bits.slice(2).join(':');
  if (type === 'anyone') return 'anyone with the link (' + verbFor_(role) + ')';
  if (type === 'domain') return 'everyone at ' + who + ' (' + verbFor_(role) + ')';
  return who + ' (' + verbFor_(role) + ')';
}

/**
 * @param {Object} current  reportable findings this run
 * @param {Object} watched  every watched item this run, reportable or not
 * @param {Object} baseline previous run's watched items
 */
function diffFindings_(current, watched, baseline) {
  const added = [];        // newly shared, or new file already shared
  const worsened = [];     // level got wider
  const peopleChanged = [];// same level, different people
  const resolved = [];     // was flagged, no longer is

  Object.keys(current).forEach(function (id) {
    const now = current[id];
    const before = baseline[id];
    if (!before) { added.push(now); return; }
    if (RANK[now.level] > RANK[before.level]) {
      worsened.push(Object.assign({}, now, { was: before.level }));
    }
  });

  if (CONFIG.reportPeopleChanges) {
    Object.keys(watched).forEach(function (id) {
      const now = watched[id];
      const before = baseline[id];
      if (!before) return;                            // covered by `added`
      if (RANK[now.level] > RANK[before.level]) return; // covered by `worsened`
      const delta = peopleDelta_(before.people, now.people);
      if (delta) peopleChanged.push(Object.assign({}, now, { delta: delta }));
    });
  }

  Object.keys(baseline).forEach(function (id) {
    const before = baseline[id];
    if (before.level === 'OK') return;
    if (before.level === 'Info' && !CONFIG.reportInfoLevel) return;
    if (!current[id]) resolved.push(before);
  });

  return { added: added, worsened: worsened, peopleChanged: peopleChanged, resolved: resolved };
}

// ----------------------------------------------------------------------------
// Reporting
// ----------------------------------------------------------------------------

function escapeHtml_(text) {
  return String(text == null ? '' : text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function levelColour_(level) {
  return level === 'Critical' ? '#d53c30' : level === 'Warning' ? '#e3761c' : '#0070cc';
}

function rows_(items, showDelta) {
  return items.map(function (f) {
    let detail = escapeHtml_(f.label);
    if (showDelta && f.delta) {
      const parts = [];
      f.delta.added.forEach(function (a) { parts.push('added ' + escapeHtml_(prettyGrantee_(a))); });
      f.delta.removed.forEach(function (r) { parts.push('removed ' + escapeHtml_(prettyGrantee_(r))); });
      detail = parts.join('<br>');
    }
    return '<tr>' +
      '<td style="padding:8px 10px;border-bottom:1px solid #e4e7ed;">' +
        '<a href="' + escapeHtml_(f.url) + '" style="color:#0070cc;text-decoration:none;">' +
        escapeHtml_(f.name) + '</a>' +
        (f.isFolder ? ' <span style="color:#7a8291;font-size:12px;">(folder)</span>' : '') +
        (f.source ? '<div style="color:#7a8291;font-size:12px;">in ' + escapeHtml_(f.source) +
          (f.mine ? '' : ' · owned by ' + escapeHtml_(f.owner || 'someone else')) + '</div>' : '') +
      '</td>' +
      '<td style="padding:8px 10px;border-bottom:1px solid #e4e7ed;color:' + levelColour_(f.level) +
        ';font-weight:600;white-space:nowrap;">' + escapeHtml_(f.level) +
        (f.was ? ' <span style="color:#7a8291;font-weight:400;">(was ' + escapeHtml_(f.was) + ')</span>' : '') +
      '</td>' +
      '<td style="padding:8px 10px;border-bottom:1px solid #e4e7ed;color:#5e687a;">' + detail + '</td>' +
    '</tr>';
  }).join('');
}

function section_(title, items, showDelta) {
  if (!items.length) return '';
  return '<h3 style="font-size:15px;margin:22px 0 8px;color:#223049;">' +
    escapeHtml_(title) + ' (' + items.length + ')</h3>' +
    '<table style="border-collapse:collapse;width:100%;font-size:14px;">' +
    rows_(items, showDelta) + '</table>';
}

function problemsBlock_(problems) {
  if (!problems.length) return '';
  return '<div style="margin-top:20px;padding:11px 13px;background:#fcefe0;border-radius:5px;' +
    'font-size:13px;color:#5e687a;"><strong>Could not check everything</strong><br>' +
    problems.map(escapeHtml_).join('<br>') + '</div>';
}

function buildEmail_(diff, totals, isBaseline, problems) {
  const head = '<div style="font-family:Inter,Arial,sans-serif;color:#223049;max-width:700px;">';
  const foot = '<p style="font-size:12px;color:#7a8291;margin-top:26px;border-top:1px solid #e4e7ed;' +
    'padding-top:12px;">Sent by the Drive sharing check script running in your own Google ' +
    'account. It watches sharing only — file edits do not trigger email. On files owned by ' +
    'other people Drive hides individual named grants, so people-level changes are only ' +
    'detected on files you own.</p></div>';

  if (isBaseline) {
    return head +
      '<h2 style="font-size:18px;margin:0 0 8px;">Watching started</h2>' +
      '<p style="font-size:14px;line-height:1.6;">Recorded the current state of ' +
      totals.watched + ' watched items as the baseline. Nothing is reported as new, because ' +
      'on a first run everything would be. From now on you will only hear from this when ' +
      'sharing changes.</p>' +
      section_('Critical now', diff.added.filter(function (f) { return f.level === 'Critical'; })) +
      section_('Warning now', diff.added.filter(function (f) { return f.level === 'Warning'; })) +
      section_('Info now', diff.added.filter(function (f) { return f.level === 'Info'; })) +
      problemsBlock_(problems) + foot;
  }

  const changed = diff.added.length || diff.worsened.length ||
    diff.peopleChanged.length || diff.resolved.length;

  if (!changed) {
    return head +
      '<h2 style="font-size:18px;margin:0 0 8px;">No sharing changes</h2>' +
      '<p style="font-size:14px;">Still ' + totals.critical + ' critical and ' +
      totals.warning + ' warning across ' + totals.watched + ' watched items.</p>' +
      problemsBlock_(problems) + foot;
  }

  const summary = [];
  if (diff.added.length) summary.push('<strong>' + diff.added.length + ' newly shared</strong>');
  if (diff.worsened.length) summary.push('<strong>' + diff.worsened.length + ' more open</strong>');
  if (diff.peopleChanged.length) summary.push('<strong>' + diff.peopleChanged.length + ' had people change</strong>');
  if (diff.resolved.length) summary.push(diff.resolved.length + ' resolved');

  return head +
    '<h2 style="font-size:18px;margin:0 0 8px;">Sharing changed</h2>' +
    '<p style="font-size:14px;line-height:1.6;">' + summary.join(', ') + '. Now at ' +
    totals.critical + ' critical, ' + totals.warning + ' warning.</p>' +
    section_('Newly shared', diff.added) +
    section_('Became more open', diff.worsened) +
    section_('People added or removed', diff.peopleChanged, true) +
    section_('Resolved', diff.resolved) +
    problemsBlock_(problems) + foot;
}


/* Session.getActiveUser() needs the userinfo.email scope. Rather than widen the
   permissions just to learn our own address, ask Drive — which this script can
   already read. One call per run, then cached. */
let MY_EMAIL_ = null;
let LAST_PROBLEM_ = '';

function myEmail_() {
  if (MY_EMAIL_ !== null) return MY_EMAIL_;
  try {
    const about = Drive.About.get({ fields: 'user(emailAddress)' });
    MY_EMAIL_ = (about && about.user && about.user.emailAddress) || '';
  } catch (err) {
    Logger.log('Could not read your address from Drive: ' + err.message);
    MY_EMAIL_ = '';
  }
  return MY_EMAIL_;
}

/**
 * Where notifications go. Accepts several addresses separated by commas or
 * semicolons; MailApp takes a comma separated list directly.
 */
function notifyTarget_() {
  const configured = String(CONFIG.notifyEmail || '')
    .split(/[,;\n]+/)
    .map(function (a) { return a.trim(); })
    .filter(function (a) { return a !== ''; })
    .join(',');
  return configured || myEmail_() || '';
}

function notify_(subject, html) {
  const to = notifyTarget_();
  if (!to) {
    // Nowhere to send is a configuration problem, not a reason to abandon the
    // check: the baseline still updates and the status file records the fault.
    Logger.log('No notification address. Set one under Scheduled monitoring in the ' +
      'browser tool, or in CONFIG.notifyEmail. Nothing was emailed.');
    LAST_PROBLEM_ = 'No notification address configured';
    return;
  }
  Logger.log('Emailing: ' + to);
  MailApp.sendEmail({ to: to, subject: subject, htmlBody: html });
}


// ----------------------------------------------------------------------------
// Status reporting back to the browser tool
//
// The browser tool cannot read this script's triggers — separate systems. So
// each run records what happened into the description of a small file, which
// the tool reads with the metadata scope it already has. This is why the script
// needs drive.file: to create and update that one file, and nothing else.
// ----------------------------------------------------------------------------

const STATUS_NAME = 'Drive sharing check \u2014 status';

function describeSchedule_() {
  const sched = CONFIG.schedule || {};
  const f = normaliseFrequency_(sched.frequency);
  if (MINUTE_FREQ_[f]) return 'Every ' + MINUTE_FREQ_[f] + ' minutes';
  if (f === 'hourly') return 'Every hour';
  const at = ' at ' + pad2_(sched.hour) + ':00';
  if (f === 'daily') return 'Every day' + at;
  return 'Every ' + String(sched.dayOfWeek || 'MONDAY').toLowerCase() + at;
}

function writeStatus_(summary) {
  try {
    const payload = JSON.stringify({
      version: 1,
      lastRun: new Date().toISOString(),
      schedule: describeSchedule_(),
      scheduleRaw: CONFIG.schedule,
      timezone: Session.getScriptTimeZone(),
      triggerInstalled: ScriptApp.getProjectTriggers().some(function (t) {
        return t.getHandlerFunction() === 'runCheck';
      }),
      watching: summary.watched,
      watchedRoots: summary.roots || [],
      paused: summary.paused === true,
      scanMyDrive: CONFIG.scanMyDrive === true,
      critical: summary.critical,
      warning: summary.warning,
      changed: summary.changed,
      emailed: summary.emailed,
      settingsSource: SETTINGS_SOURCE,
      problem: LAST_PROBLEM_ || '',
      notifyTo: CONFIG.notifyEmail || myEmail_(),
    });

    const found = Drive.Files.list({
      q: "name = '" + STATUS_NAME.replace(/'/g, "\\'") + "' and trashed = false",
      fields: 'files(id)', pageSize: 5,
    });
    const existing = (found.files || [])[0];
    if (existing) {
      Drive.Files.update({ description: payload }, existing.id);
    } else {
      Drive.Files.create({
        name: STATUS_NAME,
        description: payload,
        mimeType: 'application/vnd.google-apps.document',
      });
    }
  } catch (err) {
    // Reporting status is a convenience. Never let it fail a check.
    Logger.log('Could not write the status file: ' + err.message);
  }
}

// ----------------------------------------------------------------------------
// Entry points
// ----------------------------------------------------------------------------

function runCheck() {
  applyDriveSettings_();      // browser-tool settings win over the CONFIG above

  if (CONFIG.paused) {
    // Paused from the browser tool. Keep the trigger: leaving it in place means
    // resuming is instant and never needs anyone to open Apps Script again.
    // The cost is one settings read per interval, which is negligible.
    writeStatus_({ watched: 0, critical: 0, warning: 0, changed: 0, emailed: false,
      roots: [], paused: true });
    Logger.log('Monitoring is paused in the browser tool. No check performed.');
    return;
  }

  // Self-installing: pressing Run once is the whole setup. A web page cannot
  // create an Apps Script trigger, and Google requires one manual run to
  // authorise the script anyway — so that run does everything.
  ensureTrigger_();
  const state = { problems: [], foldersWalked: 0, rootNames: [] };

  let watched = {};
  if ((CONFIG.watchlist || []).length) {
    watched = scanWatchlist_(state);
  }
  if (CONFIG.scanMyDrive) {
    const mine = scanMyDrive_();
    Object.keys(mine).forEach(function (id) {
      if (!watched[id]) watched[id] = mine[id];    // watchlist context wins
    });
  }
  if (!Object.keys(watched).length && !state.problems.length) {
    Logger.log('Nothing to check. Add folders to CONFIG.watchlist or enable scanMyDrive.');
    return;
  }

  const current = reportable_(watched);
  const baseline = loadBaseline_();
  const isBaseline = baseline === null;

  const totals = { critical: 0, warning: 0, info: 0, watched: Object.keys(watched).length };
  Object.keys(current).forEach(function (id) {
    const level = current[id].level;
    if (level === 'Critical') totals.critical++;
    else if (level === 'Warning') totals.warning++;
    else totals.info++;
  });

  const diff = isBaseline
    ? { added: objectValues_(current), worsened: [], peopleChanged: [], resolved: [] }
    : diffFindings_(current, watched, baseline);

  saveBaseline_(watched);   // store everything watched, so people-changes on OK files are seen

  const changed = diff.added.length || diff.worsened.length ||
    diff.peopleChanged.length || diff.resolved.length;

  if (!isBaseline && !changed && !CONFIG.sendAllClearEmail) {
    writeStatus_({ watched: totals.watched, critical: totals.critical,
      warning: totals.warning, changed: 0, emailed: false, roots: state.rootNames });
    Logger.log('No changes; no email sent. Watched ' + totals.watched + ' items.');
    return;
  }

  const subject = isBaseline
    ? 'Drive sharing: watching started'
    : changed
      ? 'Drive sharing changed: ' + totals.critical + ' critical, ' + totals.warning + ' warning'
      : 'Drive sharing unchanged';

  notify_(subject, buildEmail_(diff, totals, isBaseline, state.problems));
  writeStatus_({
    roots: state.rootNames,
    watched: totals.watched, critical: totals.critical, warning: totals.warning,
    changed: diff.added.length + diff.worsened.length + diff.peopleChanged.length +
      diff.resolved.length,
    emailed: true,
  });
  Logger.log('Reported. Watched=' + totals.watched + ' Critical=' + totals.critical);
}

/** Emails the current state even if nothing changed. Use to verify setup. */
function testRun() {
  const saved = CONFIG.sendAllClearEmail;
  CONFIG.sendAllClearEmail = true;
  try { runCheck(); } finally { CONFIG.sendAllClearEmail = saved; }
}

/** Lists what the watchlist resolves to, without emailing. Run this first. */
function checkWatchlist() {
  (CONFIG.watchlist || []).forEach(function (ref) {
    const id = idFromRef_(ref);
    if (!id) { Logger.log('BAD REFERENCE: ' + ref); return; }
    const file = getFile_(id);
    if (!file) { Logger.log('CANNOT READ: ' + ref); return; }
    Logger.log((file.mimeType === FOLDER_MIME ? 'Folder' : 'File') + ': ' + file.name +
      ' — owner ' + ((file.owners && file.owners[0] && file.owners[0].emailAddress) || 'unknown') +
      (file.ownedByMe === false ? ' (not yours: named grants will be hidden)' : ''));
  });
  if (!(CONFIG.watchlist || []).length) Logger.log('Watchlist is empty.');
}

/* Sub-hourly schedules are supported but cost trigger runtime: 288 runs a day
   at 5 minutes. Fine on Workspace, and useful for testing. */
const MINUTE_FREQ_ = { every5min: 5, every10min: 10, every15min: 15, every30min: 30 };

function normaliseFrequency_(freq) {
  return String(freq || 'weekly').toLowerCase();
}

/**
 * Installs the schedule described by CONFIG.schedule, replacing any existing
 * one. Run this again after changing the schedule — editing CONFIG alone does
 * nothing until the trigger is rebuilt.
 */

/* Whoever installs the trigger records what was installed, so callers can tell
   a real change from a repeat. */
function rememberSchedule_() {
  PropertiesService.getUserProperties().setProperty('schedule_signature', [
    String(CONFIG.schedule.frequency || '').toLowerCase(),
    String(CONFIG.schedule.dayOfWeek || '').toUpperCase(),
    String(CONFIG.schedule.hour),
  ].join('|'));
}

function installTrigger() {
  // Load the browser tool's settings first, otherwise this would install the
  // schedule written in the code and silently ignore what was saved in the UI.
  applyDriveSettings_();
  if (CONFIG.paused) {
    throw new Error('Monitoring is stopped in the browser tool. Press Resume there first.');
  }
  const sched = CONFIG.schedule || {};
  const freqRaw = normaliseFrequency_(sched.frequency);
  const needsHour = freqRaw === 'weekly' || freqRaw === 'daily';
  const hour = Number(sched.hour);
  if (needsHour && !(hour >= 0 && hour <= 23)) {
    throw new Error('CONFIG.schedule.hour must be a number from 0 to 23. Got: ' + sched.hour);
  }

  // Validate everything BEFORE removing the existing trigger, so a typo cannot
  // leave you with no monitoring at all.
  const frequency = normaliseFrequency_(sched.frequency);
  const allowed = ['weekly', 'daily', 'hourly'].concat(Object.keys(MINUTE_FREQ_));
  if (allowed.indexOf(frequency) === -1) {
    throw new Error('CONFIG.schedule.frequency must be one of: ' + allowed.join(', ') +
      '. Got: ' + sched.frequency);
  }
  let day = null;
  if (frequency === 'weekly') {
    const dayName = String(sched.dayOfWeek || 'MONDAY').toUpperCase();
    day = ScriptApp.WeekDay[dayName];
    if (!day) {
      throw new Error('CONFIG.schedule.dayOfWeek must be MONDAY through SUNDAY. Got: ' + sched.dayOfWeek);
    }
    sched.__dayName = dayName;
  }

  removeTriggers();

  if (MINUTE_FREQ_[frequency]) {
    const mins = MINUTE_FREQ_[frequency];
    ScriptApp.newTrigger('runCheck').timeBased().everyMinutes(mins).create();
    rememberSchedule_();
    Logger.log('Scheduled: every ' + mins + ' minutes. A change is emailed within about ' +
      mins + ' minutes of happening.');
    return;
  }

  if (frequency === 'hourly') {
    ScriptApp.newTrigger('runCheck').timeBased().everyHours(1).create();
    rememberSchedule_();
    Logger.log('Scheduled: every hour.');
    return;
  }

  if (frequency === 'daily') {
    ScriptApp.newTrigger('runCheck').timeBased().everyDays(1).atHour(hour).create();
    rememberSchedule_();
    Logger.log('Scheduled: every day at ' + pad2_(hour) + ':00 (' +
      Session.getScriptTimeZone() + ').');
    return;
  }

  const dayName = sched.__dayName;
  ScriptApp.newTrigger('runCheck').timeBased().onWeekDay(day).atHour(hour).create();
  rememberSchedule_();
  Logger.log('Scheduled: every ' + dayName.charAt(0) + dayName.slice(1).toLowerCase() +
    ' at ' + pad2_(hour) + ':00 (' + Session.getScriptTimeZone() + ').');
}

/** Kept so older instructions still work. Sets weekly, then installs. */
function installWeeklyTrigger() {
  CONFIG.schedule.frequency = 'weekly';
  installTrigger();
}

/** Kept so older instructions still work. Sets daily, then installs. */
function installDailyTrigger() {
  CONFIG.schedule.frequency = 'daily';
  installTrigger();
}

function pad2_(n) {
  return (n < 10 ? '0' : '') + n;
}

/**
 * AC-2: answers "is this set up correctly?" in one place. Reports the
 * watchlist, the schedule actually installed, and whether a baseline exists.
 */
function showStatus() {
  Logger.log('--- Drive sharing check: status ---');
  applyDriveSettings_();
  Logger.log('Settings source: ' + SETTINGS_SOURCE);

  Logger.log('Timezone: ' + Session.getScriptTimeZone() +
    '   (change in Project Settings)');
  Logger.log('Notifications go to: ' +
    (CONFIG.notifyEmail || myEmail_() || 'not set — configure one'));
  Logger.log('Also scanning My Drive: ' + (CONFIG.scanMyDrive ? 'yes' : 'no'));

  const refs = CONFIG.watchlist || [];
  if (!refs.length) {
    Logger.log('Watchlist: EMPTY — add folder or file links to CONFIG.watchlist.');
  } else {
    Logger.log('Watchlist (' + refs.length + '):');
    refs.forEach(function (ref) {
      const id = idFromRef_(ref);
      if (!id) { Logger.log('   BAD REFERENCE: ' + ref); return; }
      const file = getFile_(id);
      if (!file) { Logger.log('   CANNOT READ (check sharing): ' + ref); return; }
      Logger.log('   ' + (file.mimeType === FOLDER_MIME ? '[folder] ' : '[file]   ') +
        file.name +
        (file.ownedByMe === false
          ? '  — owned by ' + ((file.owners && file.owners[0] && file.owners[0].emailAddress) || 'someone else')
          : ''));
    });
  }

  if (CONFIG.paused) {
    Logger.log('Monitoring: STOPPED in the browser tool. Press Resume there, then run ' +
      'installTrigger.');
  }

  const triggers = ScriptApp.getProjectTriggers().filter(function (t) {
    return t.getHandlerFunction() === 'runCheck';
  });
  const wantSig = [
    String(CONFIG.schedule.frequency || '').toLowerCase(),
    String(CONFIG.schedule.dayOfWeek || '').toUpperCase(),
    String(CONFIG.schedule.hour),
  ].join('|');
  const haveSig = PropertiesService.getUserProperties().getProperty('schedule_signature');
  if (!CONFIG.paused && triggers.length && haveSig && haveSig !== wantSig) {
    Logger.log('Schedule changed since the trigger was installed. Applying it now...');
    try { installTrigger(); } catch (err) { Logger.log('Could not apply: ' + err.message); }
  }

  if (!triggers.length) {
    Logger.log('Schedule: not started yet — press Run on runCheck once and it starts itself.');
  } else {
    Logger.log('Schedule: installed (' + triggers.length + ' trigger' +
      (triggers.length === 1 ? '' : 's') + '). Configured as ' +
      CONFIG.schedule.frequency +
      (String(CONFIG.schedule.frequency).toLowerCase() === 'weekly'
        ? ' on ' + CONFIG.schedule.dayOfWeek : '') +
      ' at ' + pad2_(CONFIG.schedule.hour) + ':00.');
    Logger.log('   Exact next run time is on the Triggers page (clock icon, left sidebar).');
  }

  const props = PropertiesService.getUserProperties();
  const chunks = Number(props.getProperty(BASELINE_COUNT_KEY) || 0);
  Logger.log(chunks
    ? 'Baseline: recorded. Only changes will be emailed.'
    : 'Baseline: none yet. The next run records one and emails a summary.');
}

function removeTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'runCheck') ScriptApp.deleteTrigger(t);
  });
  Logger.log('Existing runCheck triggers removed.');
}

function resetBaseline() {
  clearBaseline_();
  Logger.log('Baseline cleared. The next run records a new one.');
}

function objectValues_(obj) {
  return Object.keys(obj).map(function (k) { return obj[k]; });
}
