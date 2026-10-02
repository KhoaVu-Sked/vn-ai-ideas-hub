// "What's New", and the archive behind it.
//
// RELEASES is every note ever shown, newest first. The modal still shows one —
// the newest — and accounts.last_seen_release still remembers the key someone
// dismissed, so the dismissal logic and /api/whats-new are unchanged. The
// archive at /updates is simply a second reader of the same list.
//
// A null last_seen_release counts as "not seen", so someone joining today gets
// the current note rather than nothing.
//
// To publish an update: add an entry at the TOP of RELEASES. RELEASE and NEWS
// derive from it, so there is nothing else to bump — and forgetting to bump was
// the old failure, where a changed note reached nobody who had dismissed the
// previous one.
//
// `key` identifies a release and must never change once shipped: it is the
// value sitting in people's accounts rows. `date` is content, shown in the
// archive — which is why it is a field rather than something parsed back out of
// the key.

export const RELEASES = [
  {
    key: "2026-10-02-tools-and-core-competency",
    date: "2 October 2026",
    greeting: "Thanks for using TS Hub \u2727 \u00b7 \u2726 \u00b7 \u2727",
    title: "What's New: Tools, and the Core Competency track",
    intro: "Two things this time. TS Hub has a third section called Tools, holding small "
         + "utilities that work on your own account \u2014 the first is a check for Google Drive "
         + "files shared more widely than you meant. And the Core Competency track now covers "
         + "the Junior tier as well as Intern.",

    items: [
      {
        heading: "Tools, and the first one in it",
        body: "The home page now offers a third choice. Tools holds small utilities that run on "
            + "your own account and your own data, rather than anything stored centrally here. "
            + "It is its own section with its own list, so more can be added without crowding "
            + "the ideas board or the Learning Hub.",
      },
      {
        heading: "Drive Sharing Check",
        body: "Finds files in your Google Drive shared by link or with the whole organisation, "
            + "grouped by who can actually open them, and lets you narrow that access back down "
            + "without leaving the page. You can change several files at once. It reads file "
            + "names and sharing settings only \u2014 never what is inside a file \u2014 and nothing it "
            + "finds is sent to this app or stored anywhere central.",
      },
      {
        heading: "It will not touch files you do not own",
        body: "Files owned by someone else are listed and classified, but offer Remind owner "
            + "instead of a change, which opens an email naming the file and the problem. Google "
            + "would refuse the change anyway, but the real reason is that quietly re-sharing "
            + "another team's document is not this tool's call to make.",
      },
      {
        heading: "Watched folders",
        body: "Name a folder and you get an email when the sharing inside it changes, including "
            + "folders other people own. The watching is a Google Apps Script you install once "
            + "under your own account, so it runs on Google's timer rather than this app's "
            + "server, and no password or token of yours is stored anywhere.",
      },
      {
        heading: "Core Competency now reaches Junior",
        body: "The Core Competency track \u2014 our own career-ladder learning plan, as distinct from "
            + "the AI Track \u2014 has gained the Junior tier: twelve more courses with their "
            + "quizzes, on top of the thirty-six already there at Intern. The master plan runs "
            + "all the way to Principal and the remaining tiers follow the same route as that "
            + "content is prepared.",
      },
      {
        heading: "Every update in one place",
        body: "There is now an Updates section on the home page keeping every one of these notes, "
            + "including the previous ones. If you dismissed something before reading it, or "
            + "want to check what changed and when, it is all there.",
      },
    ],
  },

  {
    key: "2026-09-03-ts-hub-learning",
    date: "3 September 2026",
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
  },
];

// The newest note is the one the modal shows and the one dismissal compares
// against. Deriving both means a new entry cannot be added without also
// becoming current, which is the mistake this used to invite.
export const RELEASE = RELEASES[0].key;
export const NEWS = RELEASES[0];
