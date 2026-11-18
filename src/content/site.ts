import type { SiteConfig } from "@/types/site";
import { CLASS_IDEA } from "@/content/bootcamp";
import { COHORT_LENGTH_ADJ, GROUP_MAX_PLAYERS, numberInWords } from "@/content/programs";

// The hand-written search-result lines that say what a class is (owner,
// 2026-11-16: every group is a group bootcamp). Each is 155 characters at
// most, names Toronto and reads the class idea and the cohort length from
// their one source; `npm test` (test-copy-truth.ts) pins all three. None
// carries a price (owner, 2026-11-17: no price on the home page, and the
// whole price only elsewhere); a program page's own line, its
// `metaDescription` in src/content/programs.ts, carries the whole price.

/**
 * The site-wide meta description: the home page uses it, and so does every
 * page without its own (the 404 included). What we run, for whom, what a
 * class is and how long a cohort runs (audit M1, M10; backlog #69, #70).
 */
export const SITE_DESCRIPTION =
  `Group bootcamps in Toronto for juniors, teens and adults: ${CLASS_IDEA}, in ${COHORT_LENGTH_ADJ} cohorts.`;

/** /programs: the two bootcamp programs by day, then private lessons. */
export const PROGRAMS_DESCRIPTION =
  `Group bootcamps in Toronto, ${CLASS_IDEA}: youth on Saturdays, adults on Sundays. Private lessons by arrangement.`;

/** /about: what we run, the cohort and the public group size. */
export const ABOUT_DESCRIPTION =
  `Tennis Bootcamp runs group bootcamps in Toronto: ${CLASS_IDEA}, ${COHORT_LENGTH_ADJ} cohorts of up to ${numberInWords(GROUP_MAX_PLAYERS)} players, serious at every level.`;

export const site: SiteConfig = {
  name: "Tennis Bootcamp",
  tagline: "Where Athletes Evolve!",
  email: "info@tennisbootcamp.ca",

  // Later you can replace this with your Calendly booking link:
  // bookingHref: "https://calendly.com/...."
  bookingHref: "/programs",

  socials: [
    { label: "YouTube", href: "#" },
    { label: "TikTok", href: "#" },
    { label: "Instagram", href: "#" },
  ],

  // Kept on the owner default D20 (audit L16): the credit stays until Sina
  // says otherwise.
  footerNote: "Design and Development QUANTUMAPPS",
};

/**
 * The id of the newsletter line at the top of the footer, on every page: a
 * "Notify me" button on a full group points at it (`#notify`).
 */
export const NEWSLETTER_ANCHOR = "notify";

export type NavLink = { href: string; label: string };

/**
 * The header and phone-menu text links (audit M11; owner, 2026-11-16: the
 * top menu is Programs and About). Locations and Assessment live in the
 * footer. Events and Video Lessons stay out until they have real content
 * (audit M6, owner default D24); their pages still resolve, with noindex.
 */
export const NAV_LINKS: readonly NavLink[] = [
  { href: "/programs", label: "Programs" },
  { href: "/about", label: "About" },
];

/** The footer's "Site" column: the top menu's two, plus Locations and Assessment. */
export const FOOTER_SITE_LINKS: readonly NavLink[] = [
  { href: "/programs", label: "Programs" },
  { href: "/locations", label: "Locations" },
  { href: "/about", label: "About" },
  { href: "/assessment", label: "Assessment" },
];

/** The footer's link columns (audit M11): the site, then the policies. */
export const FOOTER_GROUPS: readonly { heading: string; links: readonly NavLink[] }[] = [
  { heading: "Site", links: FOOTER_SITE_LINKS },
  {
    heading: "Policies",
    links: [
      { href: "/legal/refund-policy", label: "Program Policies" },
      { href: "/legal/waiver", label: "Waiver" },
      { href: "/legal/privacy", label: "Privacy Policy" },
    ],
  },
];
