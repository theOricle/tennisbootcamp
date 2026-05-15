import type { MetadataRoute } from "next";
import { programs } from "@/content/programs";

// Update BASE_URL when tennisbootcamp.ca is live in Vercel
const BASE_URL = "https://tennisbootcamp-seven.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: BASE_URL, lastModified: new Date(), changeFrequency: "weekly", priority: 1 },
    { url: `${BASE_URL}/programs`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.9 },
    ...programs.map((p) => ({
      url: `${BASE_URL}/programs/${p.slug}`,
      lastModified: new Date(),
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
    { url: `${BASE_URL}/intake`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.9 },
    { url: `${BASE_URL}/events`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.7 },
    { url: `${BASE_URL}/locations`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE_URL}/about`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE_URL}/video-lessons`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
  ];
}
