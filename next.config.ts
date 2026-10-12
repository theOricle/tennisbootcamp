import type { NextConfig } from "next";
import { LEGACY_TIER_SLUGS } from "./src/lib/tiers";

/** Sent on every route (backlog #30): full URL to our own origin, origin only
 * to anyone else, nothing over a downgrade — so an invite link's token never
 * reaches a third party through the Referer header. */
export const REFERRER_POLICY = "strict-origin-when-cross-origin";

/**
 * Platform hygiene (audit L26): no page may be framed (clickjacking), no
 * response is MIME-sniffed, and the browser features the site never uses are
 * switched off. Stripe Checkout is a redirect, never an iframe, so framing
 * is denied outright.
 */
export const SECURITY_HEADERS: readonly { key: string; value: string }[] = [
  { key: "Referrer-Policy", value: REFERRER_POLICY },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

/**
 * The tier names became plain words on 2026-10-12 (Love → Beginner …
 * Grand Slam → World Class), and the emblem PNG routes moved with their
 * slugs. Emails already sent still point at the old paths, so each old slug
 * redirects permanently to its new one (src/lib/tiers.ts LEGACY_TIER_SLUGS).
 */
export const TIER_EMBLEM_REDIRECTS = Object.entries(LEGACY_TIER_SLUGS).map(([from, to]) => ({
  source: `/tier-emblem/${from}`,
  destination: `/tier-emblem/${to}`,
  permanent: true,
}));

/** A month: next/image keeps an optimized image this long (audit L24). */
export const IMAGE_CACHE_TTL_SECONDS = 60 * 60 * 24 * 31;

const nextConfig: NextConfig = {
  // No "X-Powered-By: Next.js" banner (audit L26).
  poweredByHeader: false,
  images: {
    // AVIF first, then WebP (audit L24).
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: IMAGE_CACHE_TTL_SECONDS,
  },
  async redirects() {
    return [...TIER_EMBLEM_REDIRECTS];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [...SECURITY_HEADERS],
      },
    ];
  },
};

export default nextConfig;
