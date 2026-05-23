export type ProgramType = "Bootcamp" | "Junior Bootcamp" | "Group Lessons" | "Summer Camp";

export type Program = {
  id: string;
  slug: string;
  title: string;
  description: string;
  longDescription: string;
  type: ProgramType;
  comingSoon?: boolean;
  ctaText: string;
  ctaHref: string;
  imageSrc?: string;

  schedule?: string;
  priceCents?: number;
  currency?: "CAD" | "USD";
  ageGroup?: string;
  locationId?: string;
  includes?: string[];
};
