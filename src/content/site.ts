import type { SiteConfig } from "@/types/site";

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
