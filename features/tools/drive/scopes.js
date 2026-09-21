// Whether Google actually granted a scope.
//
// The trap: these strings are prefixes of one another.
//
//   https://www.googleapis.com/auth/drive
//   https://www.googleapis.com/auth/drive.file
//   https://www.googleapis.com/auth/drive.metadata.readonly
//
// So `granted.includes(SCOPE_WRITE)` is true for a user who only granted
// drive.file, and the tool would offer to change files it cannot change. The
// scope string arrives space-separated; split it and compare whole values.

export function scopesInclude(grantedScopeString, wanted) {
  const granted = String(grantedScopeString || "").split(/\s+/).filter(Boolean);
  return granted.includes(wanted);
}

export function canWrite(grantedScopeString) {
  // Only the unsuffixed drive scope permits changing sharing on arbitrary
  // files. drive.file is limited to files this app itself created or opened.
  return scopesInclude(grantedScopeString, "https://www.googleapis.com/auth/drive");
}

// Which scope a request should ask for.
//
// Exists because `onClick={authorise}` hands the handler a React
// SyntheticEvent as its first argument. That became the scope, reached
// Google's library as an object, and surfaced as "c.trim is not a function"
// from inside minified library code — a stack trace pointing nowhere near the
// cause. Anything that is not a non-empty string is not a scope.
export function pickScope(wanted, fallback) {
  return typeof wanted === "string" && wanted.trim() ? wanted : fallback;
}
