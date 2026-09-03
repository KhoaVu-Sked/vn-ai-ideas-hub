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

export const RELEASE = "2026-08-26-merge-star-docs-v2";

export const NEWS = {
  greeting: "Thank you for keep using AI Ideas Hub 𓇼 ⋆.˚ 𓆉 𓆝 𓆡⋆.˚ 𓇼",
  title: "What's New: Idea Merging, Stars, and Better Documentation",
  intro: "We're excited to share our latest updates designed to help you organize ideas, "
       + "clarify ownership, and keep your workspace clutter-free.",

  // Served from public/, so it needs no blob store and no signed URL. The panel
  // simply omits it if the file is not there, rather than showing a broken
  // image to everyone on the first load after a release.
  image: { src: "/whats-new/2026-08-26.png", alt: "Waiting for a new update" },

  items: [
    {
      heading: "Merge duplicate ideas",
      body: "Great minds think alike! If multiple people submit the same idea, Project Leads can now "
          + "request to merge them. The primary idea will automatically gather the others' write-ups as "
          + "comments and smoothly migrate all attached files. To keep your data safe, an Admin must "
          + "approve every merge, ensuring nothing gets lost by mistake.",
    },
    {
      heading: "Highlight what matters with Stars",
      body: "Admins can now add a star to high-priority ideas. Starred ideas are pinned to the top of "
          + "the board for easy visibility and carry a bit more weight on the contributors list, making "
          + "important work easier to track and recognize.",
    },
    {
      heading: "A dedicated home for links and files",
      body: "Every idea now features a dedicated Documentation box next to the team section. Anyone can "
          + "easily add links or upload files to keep context all in one place. To maintain order, only "
          + "the person who added the file, the Project Lead, or an Admin can remove it.",
    },
    {
      heading: "Clearer roles: Initiator vs. Project Lead",
      body: "We've updated how ownership works to better reflect reality. When you submit an idea, you "
          + "are now recorded as the Initiator. You retain full permissions until someone officially "
          + "takes over, leaving the Project Lead role open for the person who is actually going to "
          + "drive the work forward.",
    },
    {
      heading: "Accident-proof comment deletion",
      body: "A small but mighty update: you'll now see a confirmation prompt before deleting a comment, "
          + "saving you from accidental clicks.",
    },
  ],
};
