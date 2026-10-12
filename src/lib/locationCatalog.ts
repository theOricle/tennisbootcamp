import type { Cohort } from "@/types/cohort";
import type { Program, ProgramGroup } from "@/types/program";
import type { TrainingLocation } from "@/types/location";
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
