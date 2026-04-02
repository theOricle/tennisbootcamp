export type SocialLink = {
  label: "YouTube" | "TikTok" | "Instagram";
  href: string;
};

export type SiteConfig = {
  name: string;
  tagline: string;
  email: string;
  bookingHref: string;
  socials: SocialLink[];
  footerNote?: string;
};
