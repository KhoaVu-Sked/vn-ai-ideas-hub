// The tools the hub offers.
//
// One list, read by both the /tools index and anything else that needs to know
// what exists. Adding a tool is an entry here plus its own route — deliberately
// the smallest possible ceremony, because the point of a Tools hub is that
// small utilities have somewhere to live without negotiating for it.

export const TOOLS = [
  {
    slug: "drive-sharing-check",
    name: "Drive Sharing Check",
    line: "Find Google Drive files shared more widely than you meant, and narrow them back down.",
    detail: "Scans your own Drive for anything shared by link or with the whole organisation, "
          + "sorted by how wide the access is. It never reads file contents — names and sharing "
          + "settings only.",
    glyph: "🔍",
    status: "beta",
    credit: "Originally built by Thao Lai",
  },
];

export const toolBySlug = (slug) => TOOLS.find((t) => t.slug === slug) || null;
