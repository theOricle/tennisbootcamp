// Canonical site origin for metadataBase, robots.txt and the sitemap.
//
// Reads NEXT_PUBLIC_SITE_URL so the switch to https://tennisbootcamp.ca is a
// Vercel env change with no code change. The vercel.app origin stays the
// fallback until the custom domain is attached.
const FALLBACK_SITE_URL = "https://tennisbootcamp-seven.vercel.app";

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL?.trim() || FALLBACK_SITE_URL).replace(
  /\/+$/,
  ""
);
