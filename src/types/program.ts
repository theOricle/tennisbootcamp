import type { AgeBand } from "@/lib/ageBand";
import type { PlateId } from "@/lib/plates/specs";

// The eyebrow above a program's title, so it never repeats the title.
export type ProgramType = "Weekend group class" | "Group Lessons" | "Summer Camp";

/** One weekly class in a program's weekend timetable. */
export type TimetableSlot = {
  day: "Saturday" | "Sunday";
  time: string;
  /** The class label as the recommender and its test match it; unchanged by M37. */
  group: string;
  /** The band this class is for, when the program splits its classes by age. */
  ageBand?: AgeBand;
  /**
   * The level band this class is built for (owner decision D3, 2026-10-09),
   * 1.0–7.0 in half steps. Either both are set or neither; a program's
   * banded slots are contiguous, ascending and together cover the program span.
   */
  levelMin?: number;
  levelMax?: number;
};

export type Program = {
  id: string;
  slug: string;
  title: string;
  description: string;
  /**
   * The search-result description for /programs/{slug}: hand-written, at most
   * 155 characters, geography plus how to start (audit M10). Never a slice of
   * longDescription, which cut words in half.
   */
  metaDescription?: string;
  longDescription: string;
  type: ProgramType;
  comingSoon?: boolean;
  ctaText: string;
  ctaHref: string;

  /**
   * The program's Court Plate (audit H1, design specs §4): a code-drawn court
   * diagram, one composition per program. There is no image field: no photo
   * or title is ever baked into program art. A new program starts as "court".
   */
  plate: PlateId;
  /** The plate's accessible name on the detail page; elsewhere the plate is decorative. */
  plateAlt: string;
  /** The visible figcaption under the detail-page plate. */
  plateCaption?: string;

  /**
   * Who the program is for (audit M37), youngest first. All three bands mean
   * "Any age". `ageGroup` is derived from this and stays for the enroll wizard
   * and the dashboard until they switch to the bands.
   */
  ageBands: AgeBand[];
  /**
   * The tier span the program is built for (owner decision D2, 2026-10-09),
   * 1.0–7.0 in half steps. Unset renders nothing, never a guess.
   */
  levelMin?: number;
  levelMax?: number;
  /** One plain line on levels, lifted from the program's own copy. */
  levelNote?: string;
  /** The price in one line, built from the constants in programs.ts only. */
  priceSummary?: string;
  /** This season's status chip (owner default D11, "Groups forming"); comingSoon always wins. */
  enrollmentStatus?: "forming" | "invite-only";

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
  /** One line pointing a coming-soon program's visitor to a live program. */
  related?: { text: string; label: string; href: string };
  /**
   * Retired from public listings (programs page, sitemap, admin picker,
   * recommender), but still resolvable by id so old cohort and enrollment
   * rows keep rendering their title.
   */
  unlisted?: boolean;
};
