// "What's New", shown once per person per release.
//
// The only database involvement is accounts.last_seen_release, which remembers
// the key someone last dismissed. Each release changes RELEASE and NEWS below —
// no SQL, no admin screen. Because the announcement ships with the deploy it
// describes, it cannot advertise something that is not live yet.
//
// A null last_seen_release counts as "not seen", so someone joining today gets
// the current note rather than nothing.

export const RELEASE = "2026-08-26-merge-star-docs";

export const NEWS = {
  title: "Merging, stars, and documentation",
  // Written for someone who does not know how any of it is built.
  items: [
    {
      heading: "Duplicate ideas can be merged",
      body: "If two people raise the same idea, the lead can ask for them to be merged. "
          + "The idea you keep gathers the others' write-ups as comments, and their files move across. "
          + "An admin approves every merge, so nothing disappears on one person's say-so.",
    },
    {
      heading: "Important ideas get a star",
      body: "Admins can star an idea. Starred ideas sit at the top of the board and count for "
          + "a little more on the contributors list, so the work on them is easier to see.",
    },
    {
      heading: "Somewhere to keep links and files",
      body: "Every idea now has a Documentation box next to the team. Add a link or upload a file "
          + "and give it a name. Anyone can add; the person who added it, the lead, or an admin can remove it.",
    },
    {
      heading: "Whoever raises an idea now owns it",
      body: "You used to be recorded as Project Lead on an idea you submitted. You are now the "
          + "Initiator — you keep every permission until someone takes the lead, and Project Lead "
          + "is open for whoever is actually going to drive it.",
    },
    {
      heading: "Deleting a comment asks first",
      body: "A small one: removing a comment now confirms before it goes.",
    },
  ],
};
