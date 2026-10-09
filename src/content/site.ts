import type { SiteConfig } from "@/types/site";

/**
 * The site-wide meta description: the home page uses it, and so does every
 * page without its own (the 404 included). Quiz first, assessment optional
 * (audit M1, M10).
 */
export const SITE_DESCRIPTION =
  "Weekend tennis classes in Toronto for juniors, teens and adults. Take the 2-minute quiz and Sina places you. The 20-minute assessment is optional.";

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

  footerNote: "Design and Development QUANTUMAPPS",
};
