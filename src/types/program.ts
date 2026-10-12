import type { AgeBand } from "@/lib/ageBand";
import type { PlateId } from "@/lib/plates/specs";

// The eyebrow above a program's title, so it never repeats the title.
export type ProgramType = "Weekend group class" | "One-to-one coaching" | "Group Lessons";

export type ClassDay = "Saturday" | "Sunday";

/**
 * A group's state this season. "forming" is a group taking players (its chip
 * reads "Open to join" since the joining flow, owner 2026-10-12; D11 named it
 * "Groups forming"); "invite-only" is the owner's invite chip (D11); "full"
 * is a group with no room; "arranged" is a program with no fixed class,
 * booked with the player (private lessons).
 */
export type GroupStatus = "forming" | "invite-only" | "full" | "arranged";

/**
 * How a player joins a group (joining flow, owner 2026-10-12). "open": anyone
 * whose age and level fit can reserve a spot, and the coach confirms the
 * level on court in week one. "approval": the 2-minute quiz, then our
 * coaches approve the place (High Performance); no assessment is required.
 */
export type GroupJoining = "open" | "approval";

/**
 * One group a player can be placed in (owner, 2026-10-12): an age range, a
 * level band, a class day and time, a price and a status. Groups are the
 * unit the catalog filters, the program pages list and the quiz points at;
 * a program's timetable and level span are derived from its groups, so the
 * lineup lives in one editable list in src/content/programs.ts.
 */
export type ProgramGroup = {
  /** Stable id; also the card's anchor on the program page (#high-performance). */
  id: string;
  /** The program the group belongs to (Program.slug). */
  programSlug: string;
  /** The card title: "Ages 7–10", "High Performance", "Newer players". */
  name: string;
  /** Youngest age the group takes, or null for any age. */
  ageMin: number | null;
  /** Oldest age the group takes, or null for no upper bound ("16 and up"). */
  ageMax: number | null;
  /** The level band, 1.0–7.0 in half steps, whole tiers (x.0–y.5). */
  levelMin: number;
  levelMax: number;
  /** The class day, or null when the time is arranged with the player. */
  day: ClassDay | null;
  /** 24-hour start and end ("12:00", "13:00"); null when arranged. */
  start: string | null;
  end: string | null;
  /** The price in one line, from the constants in programs.ts only. */
  price: string;
  status: GroupStatus;
  /** Open to join, or by approval (High Performance). */
  joining: GroupJoining;
  /** One plain line on who the group is for, when the name alone is not enough. */
  note?: string;
};

/**
 * A program's photograph (owner, 2026-10-12: real people playing, in place
 * of the Court Plates on cards). Free-licence stock for now, swapped for
 * consented session photos later; public/images/programs/CREDITS.md names
 * the source of each file. 16:10, at most 1600px wide and 250 KB.
 */
export type ProgramPhoto = {
  src: string;
  width: number;
  height: number;
  /** What the photo shows, in words. Never the program name, never "photo of". */
  alt: string;
};

/** One weekly class in a program's weekend timetable, derived from its groups. */
export type TimetableSlot = {
  day: ClassDay;
  time: string;
  /** The group's name as the recommender and the structured data read it. */
  group: string;
  /** The group's level band (always set for a derived slot). */
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

  /** The program's photograph, on its card and its page. Listed programs always carry one. */
  photo?: ProgramPhoto;

  /**
   * The program's Court Plate (design specs §4): a code-drawn court diagram,
   * now the secondary art — the dashboard strip, the admin marks and the OG
   * card — since photos took the cards and the page hero (owner, 2026-10-12).
   * A new program starts as "court".
   */
  plate: PlateId;
  /** The plate's accessible name where it is the only art; elsewhere it is decorative. */
  plateAlt: string;
  /** The plate's one-line caption, where a surface shows one. */
  plateCaption?: string;

  /**
   * The age bands the program takes (audit M37), youngest first, for the
   * band-level rules (the quiz recommender, the dashboard fit). All three
   * bands mean "Any age". Exact ages live on the groups: Adult Bootcamps is
   * `["adult"]` here while its groups take players from 16, because a band
   * cannot say "16 and up" and a 14-year-old must never be offered an adult
   * group on the band alone. `ageGroup` is derived from this.
   */
  ageBands: AgeBand[];
  /**
   * The tier span the program is built for, 1.0–7.0 in half steps: the union
   * of its groups' bands. Unset renders nothing, never a guess.
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

  /** Weekend classes, one per group, derived from the groups (backlog #20). */
  timetable?: TimetableSlot[];
  /** The price with its mechanic, spelled out (ops/briefs/voice.md rule 2). */
  priceLine?: string;
  /** One line pointing a visitor to a related program. */
  related?: { text: string; label: string; href: string };
  /**
   * Retired from public listings (programs page, sitemap, admin picker,
   * recommender), but still resolvable by id so old cohort and enrollment
   * rows keep rendering their title.
   */
  unlisted?: boolean;
};
