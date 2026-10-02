export type ProgramType =
  | "Bootcamp"
  | "Junior Bootcamp"
  | "Youth Programs"
  | "High Performance"
  | "Group Lessons"
  | "Summer Camp";

/** One weekly class in a program's weekend timetable. */
export type TimetableSlot = {
  day: "Saturday" | "Sunday";
  time: string;
  group: string;
};

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

  /** Weekend classes, one 60-minute session each (backlog #20). */
  timetable?: TimetableSlot[];
  /** The price with its mechanic, spelled out (ops/briefs/voice.md rule 2). */
  priceLine?: string;
  /**
   * Retired from public listings (programs page, sitemap, admin picker,
   * recommender), but still resolvable by id so old cohort and enrollment
   * rows keep rendering their title.
   */
  unlisted?: boolean;
};
