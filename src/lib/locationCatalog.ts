import type { Cohort } from "@/types/cohort";
import type { Program, ProgramGroup } from "@/types/program";
import type { TrainingLocation } from "@/types/location";
import type { GroupCard } from "@/lib/groupBlocks";
import { DATES_COMING_SOON, formatGroupWhen, groupClassDays } from "@/lib/programCatalog";
import { locationForCohort, locationLine, locations } from "@/content/locations";
import { listedPrograms, programGroups } from "@/content/programs";

// What the locations list means for the catalog (owner, 2026-10-12): which
// groups and programs train where, and the one-line summaries the location
// surfaces print. Pure and server-safe, so the pages, the emails, the
// structured data and the tests read one rule. The lookups that need no
// programs (locationLine, locationForCohort) live in src/content/locations.ts,
// so a client component can read them without the catalog.

/** The groups that train at a location, in lineup order. */
export function groupsAtLocation(locationId: string, groups: readonly ProgramGroup[] = programGroups): ProgramGroup[] {
  return groups.filter((g) => g.locationId === locationId);
}

/** The locations a program's groups train at, in list order (one today). */
export function locationsForProgram(slug: string, groups: readonly ProgramGroup[] = programGroups): TrainingLocation[] {
  const ids = new Set(groups.filter((g) => g.programSlug === slug).map((g) => g.locationId));
  return locations.filter((l) => ids.has(l.id));
}

/**
 * A cohort's "Where" line for an email: the club on one line, else the
 * admin's own note, else the promise to confirm it. Never a stand-in that
 * contradicts a named club.
 */
export function cohortWhereLine(cohort: Pick<Cohort, "locationId">): string {
  const location = locationForCohort(cohort);
  if (location) return locationLine(location);
  return (cohort.locationId ?? "").trim() || "We'll confirm the club before your first session.";
}

/** "a, b, and c": the site's list style (Oxford comma, as on /programs). */
export function joinWithAnd(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

export type ProgramAtLocation = {
  program: Program;
  /** The program's groups at this location, in lineup order. */
  groups: ProgramGroup[];
  /** "Youth Bootcamps on Saturdays" · "Private Lessons by arrangement". */
  phrase: string;
};

/** What runs at a location: each listed program with groups there, in catalog order. */
export function programsAtLocation(
  locationId: string,
  groups: readonly ProgramGroup[] = programGroups
): ProgramAtLocation[] {
  const here = groupsAtLocation(locationId, groups);
  return listedPrograms.flatMap((program) => {
    const mine = here.filter((g) => g.programSlug === program.slug);
    if (mine.length === 0) return [];
    const days = [...new Set(mine.flatMap((g) => (g.day ? [`${g.day}s`] : [])))];
    const phrase = days.length > 0 ? `${program.title} on ${joinWithAnd(days)}` : `${program.title} by arrangement`;
    return [{ program, groups: mine, phrase }];
  });
}

/**
 * What runs at a location as a sentence: "Youth Bootcamps on Saturdays, Adult
 * Bootcamps on Sundays, and Private Lessons by arrangement."
 */
export function locationProgramsLine(location: TrainingLocation, groups: readonly ProgramGroup[] = programGroups): string {
  const phrases = programsAtLocation(location.id, groups).map((p) => p.phrase);
  if (phrases.length === 0) return "No groups train here yet.";
  return `${joinWithAnd(phrases)}.`;
}

/**
 * The one honest line about a location, from the lineup: "All our training is
 * here right now: Youth Bootcamps on Saturdays, Adult Bootcamps on Sundays,
 * and Private Lessons by arrangement." The "all our training" claim is made
 * only while this is the only location.
 */
export function locationSummary(location: TrainingLocation, groups: readonly ProgramGroup[] = programGroups): string {
  const line = locationProgramsLine(location, groups);
  if (programsAtLocation(location.id, groups).length === 0) return line;
  return locations.length === 1 ? `All our training is here right now: ${line}` : `At this club: ${line}`;
}

// ─── What runs at a location, from the group cards (backlog #99) ────────────
// /locations lists what /programs shows: the same cards (groupCards,
// src/lib/groupBlocks.ts), so a row never says a group runs on a day its card
// does not. A card trains where its group does: an open block's own location
// (locationForCohort), else the planned group's.

export type CardsAtLocation = {
  program: Program;
  /** The program's cards at this location, in the order /programs shows them. */
  cards: GroupCard[];
};

/**
 * What runs at a location, card by card: each listed program with cards
 * there, in catalog order, each with its cards in page order. An open block
 * that matches no planned group is listed under its program, as on /programs.
 */
export function cardsAtLocation(locationId: string, cards: readonly GroupCard[]): CardsAtLocation[] {
  const here = cards.filter((c) => c.group.locationId === locationId);
  return listedPrograms.flatMap((program) => {
    const mine = here.filter((c) => c.group.programSlug === program.slug);
    return mine.length > 0 ? [{ program, cards: mine }] : [];
  });
}

/** When a card says its group runs: its class days and times, then its dates (none for a group with no fixed class). */
export type CardWhen = { classDays: string; dates: string | null };

/**
 * When a card's group runs, in the card's own words
 * (src/components/sections/ProgramGroupCard.tsx): an open block's class days
 * and times and its dates ("Saturdays 12–1pm", "Jan 9 – Feb 13"); a planned
 * group with no open block, its own class and "Dates coming soon"; a group
 * with no fixed class, "By arrangement", as its row on /programs reads.
 */
export function cardWhen(card: GroupCard): CardWhen {
  const g = card.group;
  if (g.day === null) return { classDays: formatGroupWhen(g), dates: null };
  return card.block
    ? { classDays: card.block.days, dates: card.block.dates }
    : { classDays: groupClassDays(g), dates: DATES_COMING_SOON };
}
