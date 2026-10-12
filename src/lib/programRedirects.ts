// Program URLs that no longer exist (owner, 2026-10-12): High Performance
// became a group inside Youth Bootcamps and Kids' Summer Camp left the
// catalog. Each old page redirects permanently, so a link in a sent email or
// a search result still lands somewhere true. next.config.ts serves these;
// this module imports nothing, so the config loader can read it directly.

export const LEGACY_PROGRAM_REDIRECTS: readonly { from: string; to: string }[] = [
  // The HP group card on the youth page (its id is the anchor).
  { from: "high-performance", to: "/programs/youth-programs#high-performance" },
  { from: "kids-summer-camp", to: "/programs" },
];
