export type ProgramType = "Bootcamp" | "Junior Bootcamp" | "Group Lessons" | "Summer Camp";

export type Program = {
  id: string;
  title: string;
  description: string;
  type: ProgramType;
  comingSoon?: boolean;
  ctaText: string;
  ctaHref: string;
  imageSrc?: string;
};
