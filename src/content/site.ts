import type { SiteConfig } from "@/types/site";

/**
 * The site-wide meta description: the home page uses it, and so does every
 * page without its own (the 404 included). Quiz first, assessment optional
 * (audit M1, M10).
 */
export const SITE_DESCRIPTION =
  "Weekend tennis classes in Toronto for juniors, teens and adults. Take the 2-minute quiz and our coaches place you. The 20-minute assessment is optional.";

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
