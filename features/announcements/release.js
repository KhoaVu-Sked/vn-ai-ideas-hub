// "What's New", shown once per person per release.
//
// The only database involvement is accounts.last_seen_release, which remembers
// the key someone last dismissed. Each release changes RELEASE and NEWS below —
// no SQL, no admin screen. Because the announcement ships with the deploy it
// describes, it cannot advertise something that is not live yet.
//
// A null last_seen_release counts as "not seen", so someone joining today gets
// the current note rather than nothing.
//
// Bump RELEASE whenever NEWS changes, or nobody who dismissed the previous note
// will ever see the new one.

export const RELEASE = "2026-09-03-ts-hub-learning";

export const NEWS = {
  greeting: "Thanks for using TS Hub 𓇼 ⋆.˚ 𓆉 𓆝 𓆡⋆.˚ 𓇼",
  title: "What's New: TS Hub, and a Learning Hub",
  intro: "This is a bigger update than usual. The app now has two halves — the ideas board you "
       + "already know, and a new Learning Hub — so it has a new name to match: TS Hub. "
       + "Everything below is live now. The second half of this note repeats the previous "
       + "update, in case you missed it.",

  // Served from public/, so it needs no blob store and no signed URL. The panel
  // simply omits it if the file is not there, rather than showing a broken
  // image to everyone on the first load after a release.
  image: { src: "/whats-new/2026-08-26.png", alt: "Waiting for a new update" },

  items: [
    {
      heading: "Two hubs, one place",
      body: "The home page now asks where you're headed and offers two choices: the Ideas Hub and the "
          + "Learning Hub. Each side shows only its own menu, so the header stays short and you're not "
          + "hunting past links you don't need. A button on the right of the header always crosses to "
          + "the other side, so switching takes one click and you rarely need to go home. "
          + "Your bookmarks still work — the board is now at /ideas, and links to individual ideas "
          + "have not moved, so every link in an old email still opens the right idea.",
    },
    {
      heading: "The Learning Hub — training tracks at your own pace",
      body: "Pick a track, preview its full roadmap, and enroll yourself — there's no approval step and "
          + "nobody has to let you in. Your roadmap is ordered by seniority level, so you see what's "
          + "expected of you now rather than the whole catalogue at once. Each course links out to "
          + "wherever it actually lives, and finishing its wrap-up quiz marks it complete.",
    },
    {
      heading: "Auto Schedule puts study time on your calendar",
      body: "This is the one part that reaches outside the app. Tell it a level range and a date to "
          + "finish by, and it books a study block per remaining course on your Google Calendar, "
          + "working around meetings you already have. Running it again updates the same events rather "
          + "than filling your calendar with duplicates. You connect Google Calendar the first time you "
          + "use it — that permission is separate from signing in, and you can skip the whole feature "
          + "if you'd rather plan your own time.",
    },
    {
      heading: "My Dashboard — how your learning is actually going",
      body: "Your own progress, in one place: how far through what's expected of you, your current level "
          + "and the next one up, quiz accuracy grouped by skill rather than by course, and the ideas "
          + "you've raised on the board. The mind map lives here too, and it's the one view that shows "
          + "which courses are still locked and lets you skip past a prerequisite when you need to.",
    },
    {
      heading: "A note on what isn't built yet",
      body: "So you're not left looking for them: there are no AI-generated course summaries or mind "
          + "maps, and no reminders before a booked study block. Auto Schedule puts the time on your "
          + "calendar, but nothing nudges you when it arrives. Both are on the list, neither is here.",
    },
    {
      heading: "In case you missed it: merge duplicate ideas",
      body: "Great minds think alike! If multiple people submit the same idea, Project Leads can now "
          + "request to merge them. The primary idea will automatically gather the others' write-ups as "
          + "comments and smoothly migrate all attached files. To keep your data safe, an Admin must "
          + "approve every merge, ensuring nothing gets lost by mistake.",
    },
    {
      heading: "In case you missed it: highlight what matters with Stars",
      body: "Admins can now add a star to high-priority ideas. Starred ideas are pinned to the top of "
          + "the board for easy visibility and carry a bit more weight on the contributors list, making "
          + "important work easier to track and recognize.",
    },
    {
      heading: "In case you missed it: a dedicated home for links and files",
      body: "Every idea now features a dedicated Documentation box next to the team section. Anyone can "
          + "easily add links or upload files to keep context all in one place. To maintain order, only "
          + "the person who added the file, the Project Lead, or an Admin can remove it.",
    },
    {
      heading: "In case you missed it: clearer roles, Initiator vs. Project Lead",
      body: "We've updated how ownership works to better reflect reality. When you submit an idea, you "
          + "are now recorded as the Initiator. You retain full permissions until someone officially "
          + "takes over, leaving the Project Lead role open for the person who is actually going to "
          + "drive the work forward.",
    },
    {
      heading: "In case you missed it: accident-proof comment deletion",
      body: "A small but mighty update: you'll now see a confirmation prompt before deleting a comment, "
          + "saving you from accidental clicks.",
    },
  ],
};
