// Values shared with the Apps Script watcher.
//
// The watcher (apps-script/Code.gs) is a separate program running on a Google
// timer as the user. It and this page never talk to each other directly —
// there is no server between them — so they meet through two files in the
// user's own Drive, found by the names below.
//
// Nothing at runtime notices when these drift. A typo in a query returns zero
// rows and no error, and the scan cheerfully reports all clear. `bun run check`
// compares them against Code.gs by decoded value for exactly that reason.

export const LINK_Q = "(visibility = 'anyoneWithLink' or visibility = 'anyoneCanFind')";
export const DOMAIN_Q = "(visibility = 'domainWithLink' or visibility = 'domainCanFind')";
export const OWNED = "'me' in owners and trashed = false";

// Em dashes, not hyphens. These are Drive search terms, matched literally.
export const SETTINGS_NAME = "Drive sharing check — settings";
export const STATUS_NAME = "Drive sharing check — status";

// How a role reads in a sentence: "Anyone with the link can edit".
export const VERB = {
  writer: "edit",
  reader: "view",
  commenter: "comment",
  fileOrganizer: "manage content in",
  organizer: "manage",
};

// Roles that can change the file, as opposed to only seeing it. A domain-wide
// grant is a Warning when it carries one of these and Info when it does not.
export const EDIT_ROLES = { writer: 1, fileOrganizer: 1, organizer: 1 };

// Severity order. Comparing by rank rather than by string is what lets one
// file's worst grant win over its milder ones.
export const RANK = { OK: 0, Info: 1, Warning: 2, Critical: 3 };

// The watcher's schedule vocabulary. Code.gs matches these strings exactly and
// installTrigger throws on one it does not know — a throw reconcileTrigger_
// turns into a log line, so an invented value leaves the old trigger running
// while this tool's panel claims the new one. `bun run check` compares this
// list against Code.gs's own allow-list for exactly that reason.
export const FREQUENCY_VALUES = ["every15min", "every30min", "hourly", "daily", "weekly"];

// ScriptApp.WeekDay names, which Code.gs looks up by these exact keys.
export const DAY_VALUES = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];

export const DRIVE_API = "https://www.googleapis.com/drive/v3";

// Exact strings, never prefixes — see scopesInclude() in scopes.js.
export const SCOPE_READ = "https://www.googleapis.com/auth/drive.metadata.readonly";
export const SCOPE_FILE = "https://www.googleapis.com/auth/drive.file";
export const SCOPE_WRITE = "https://www.googleapis.com/auth/drive";
