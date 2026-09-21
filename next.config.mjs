/** @type {import('next').NextConfig} */

// The Drive tool runs in the browser, so its client id has to be inlined at
// build time. It is the same Google client the calendar already uses — one
// client, two flows: calendar exchanges a code server-side with the secret,
// the Drive tool asks for a token in the browser and never sees the secret.
//
// Rather than asking someone to paste the same value into a second variable
// and remember both when it rotates, fall back to the calendar's own id. Same
// shape as the fallback features/learning/googleCalendar.js already uses.
//
// A client id is public by design — it appears in every OAuth URL Google
// generates. The secret is what must stay server-side, and it does.
const driveClientId =
  process.env.NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID ||
  process.env.GOOGLE_CALENDAR_CLIENT_ID ||
  "";

const nextConfig = {
  env: {
    NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID: driveClientId,
  },
};

export default nextConfig;
