import type { MetadataRoute } from "next";

// Update BASE_URL when tennisbootcamp.ca is live in Vercel
const BASE_URL = "https://tennisbootcamp-seven.vercel.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/auth/", "/dashboard", "/profile", "/set-password", "/enroll/"],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
