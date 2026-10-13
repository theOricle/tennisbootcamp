// The /programs catalog filters (owner, 2026-10-12): the location first
// ("People need to choose location first"), then an age filter and a level
// filter over the groups, carried in the URL
// (?location=newtonbrook&age=14&level=intermediate) so a filtered list can be
// shared and the quiz result can link to one. While there is one location it
// is preselected and left out of the URL, so /programs stays the canonical
// link; a second location makes the choice explicit. Pure and server-safe:
// the client components read and write the URL, the page and the tests read
// the rules here.

import { AGE_BAND_LABELS, type AgeBand } from "@/lib/ageBand";
import { catalogTierFor } from "@/lib/level";
import { tierBySlug, type Tier } from "@/lib/tiers";
import { defaultLocation, locationById } from "@/content/locations";
import type { ProgramGroup } from "@/types/program";
import type { TrainingLocation } from "@/types/location";

/** What the age filter asks: a band or an exact age, as an inclusive range. */
export type AgeQuery = {
  /** The URL value: "junior", "teen", "adult" or an age ("14"). */
  value: string;
  min: number;
  /** null: no upper bound. */
  max: number | null;
  /** The select's option text. */
  label: string;
  /** How the results line names it: "juniors (7–13)", "age 14". */
  phrase: string;
};

/** The three bands as ranges, the same numbers as AGE_BAND_LABELS. */
export const AGE_BAND_QUERIES: Record<AgeBand, AgeQuery> = {
  junior: { value: "junior", min: 7, max: 13, label: AGE_BAND_LABELS.junior, phrase: "juniors (7–13)" },
  teen: { value: "teen", min: 14, max: 17, label: AGE_BAND_LABELS.teen, phrase: "teens (14–17)" },
  adult: { value: "adult", min: 18, max: null, label: AGE_BAND_LABELS.adult, phrase: "adults (18+)" },
};

/** The exact ages the select offers: every age the youth groups take. */
export const EXACT_AGES: readonly number[] = Array.from({ length: 11 }, (_, i) => 7 + i);

const AGE_MIN = 4;
const AGE_MAX = 99;

/** An exact age as a query, or null outside 4–99. */
export function exactAgeQuery(age: number): AgeQuery | null {
  if (!Number.isInteger(age) || age < AGE_MIN || age > AGE_MAX) return null;
  return { value: String(age), min: age, max: age, label: String(age), phrase: `age ${age}` };
}

/** The age query for a URL value: a band, an exact age, or null for anything else. */
export function ageQueryFor(value: string | null | undefined): AgeQuery | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed in AGE_BAND_QUERIES) return AGE_BAND_QUERIES[trimmed as AgeBand];
  if (/^\d{1,2}$/.test(trimmed)) return exactAgeQuery(Number(trimmed));
  return null;
}

/** The tier for a URL value (its slug), or null. A retired slug reads as "any". */
export function tierQueryFor(value: string | null | undefined): Tier | null {
  return tierBySlug(value);
}

/** The location for a URL value (its id), or null. */
export function locationQueryFor(value: string | null | undefined): TrainingLocation | null {
  if (!value) return null;
  return locationById(value.trim().toLowerCase()) ?? null;
}

/**
 * Where the player trains (null: every location), then who they are. The
 * location is a choice, not a filter: "Clear filters" keeps it.
 */
export type CatalogQuery = { location: TrainingLocation | null; age: AgeQuery | null; tier: Tier | null };

/** No location, no filter: every group. */
export const EMPTY_QUERY: CatalogQuery = { location: null, age: null, tier: null };

/** The catalog as a visitor first sees it: the default location chosen (the only one today), no filter. */
export function initialCatalogQuery(): CatalogQuery {
  return { ...EMPTY_QUERY, location: defaultLocation() };
}

/** The query a URL carries. An unknown or missing location reads as the default; unknown filters read as "any". */
export function parseCatalogQuery(params: { get(name: string): string | null }): CatalogQuery {
  return {
    location: locationQueryFor(params.get("location")) ?? defaultLocation(),
    age: ageQueryFor(params.get("age")),
    tier: tierQueryFor(params.get("level")),
  };
}

/**
 * "location=…&age=14&level=intermediate", or "" for the default view. Keys in
 * a fixed order, so equal queries share a URL; the preselected location is
 * left out, so /programs stays canonical while there is one location.
 */
export function catalogQueryString(q: CatalogQuery): string {
  const params = new URLSearchParams();
  if (q.location && q.location.id !== defaultLocation()?.id) params.set("location", q.location.id);
  if (q.age) params.set("age", q.age.value);
  if (q.tier) params.set("level", q.tier.slug);
  return params.toString();
}

/** "/programs" or "/programs?age=14&level=intermediate". */
export function catalogHref(q: CatalogQuery): string {
  const qs = catalogQueryString(q);
  return qs ? `/programs?${qs}` : "/programs";
}

/**
 * Does the group take a player in this age range? Ranges overlap: a teen
 * (14–17) sees the 11–15 group and the 16-and-up adult groups, an exact age
 * sees only the groups that take it, and a group with no age bounds takes
 * everyone.
 */
export function groupTakesAge(group: Pick<ProgramGroup, "ageMin" | "ageMax">, age: AgeQuery): boolean {
  const aboveMin = group.ageMin === null || age.max === null || group.ageMin <= age.max;
  const belowMax = group.ageMax === null || group.ageMax >= age.min;
  return aboveMin && belowMax;
}

/**
 * Is the group's one level tag this tier? Exact (owner, 2026-10-13: "the
 * level filter matches the tag exactly"); a group built for any level
 * (private lessons) takes every tier.
 */
export function groupTakesTier(group: Pick<ProgramGroup, "level">, tier: Tier): boolean {
  return group.level === null || group.level === tier.id;
}

/**
 * How far a group's level tag sits from a tier, in tiers: 0 for an exact
 * match or a group that takes any level, 1 for the tier next door. The
 * recommender and the catalog's "Closest fit" read this.
 */
export function tierDistance(group: Pick<ProgramGroup, "level">, tier: Tier): number {
  return group.level === null ? 0 : Math.abs(group.level - tier.id);
}

/** Is the group's level tag within `steps` tiers of this one (an exact match at 0)? */
export function groupTakesTierNear(group: Pick<ProgramGroup, "level">, tier: Tier, steps: number): boolean {
  return tierDistance(group, tier) <= steps;
}

export function groupMatches(group: ProgramGroup, q: CatalogQuery): boolean {
  if (q.location && group.locationId !== q.location.id) return false;
  if (q.age && !groupTakesAge(group, q.age)) return false;
  if (q.tier && !groupTakesTier(group, q.tier)) return false;
  return true;
}

export function filterGroups(groups: readonly ProgramGroup[], q: CatalogQuery): ProgramGroup[] {
  return groups.filter((g) => groupMatches(g, q));
}

/**
 * "Closest fit" (owner, 2026-10-13: only when nothing matches), decided per
 * program and capped by the whole list: for each program whose tagged groups
 * fit the chosen location and age but none of which carries the chosen
 * level, the groups whose tag is nearest it (ties kept), as long as that
 * nearest is within reach; the whole list in lineup order. The reach is the
 * shortest distance any tagged group in the list has to the level, and one
 * tier when a group somewhere matches exactly. Per program, because the age
 * ranges overlap across programs: a 16-and-up adult group matches a teen
 * (14–17) at Intermediate exactly, and that must not hide the youth
 * program's nearest group, Novice next door, from a 14-year-old who cannot
 * join the adult one. Capped, because the only youth group a 16- or
 * 17-year-old fits is High Performance (by approval), four tiers above a
 * Beginner with an exact adult match right above it: a far group is never
 * the closest fit while a near one exists. Empty when there is no level
 * filter, when every program that fits has an exact tagged match and no
 * other program sits one tier away, or when nothing fits the age at all. A
 * group built for any level (private lessons) is an exact match, never a
 * "closest" one, so a parent filtering age 9 at Intermediate still sees the
 * Beginner Junior Bootcamp here.
 */
export function closestGroups(groups: readonly ProgramGroup[], q: CatalogQuery): ProgramGroup[] {
  const tier = q.tier;
  if (!tier) return [];
  const tagged = groups.filter((g) => g.level !== null && groupMatches(g, { ...q, tier: null }));
  if (tagged.length === 0) return [];
  const best = Math.min(...tagged.map((g) => tierDistance(g, tier)));
  const reach = Math.max(1, best);
  const keep = new Set<string>();
  for (const slug of new Set(tagged.map((g) => g.programSlug))) {
    const mine = tagged.filter((g) => g.programSlug === slug);
    if (mine.some((g) => groupTakesTier(g, tier))) continue;
    const nearest = Math.min(...mine.map((g) => tierDistance(g, tier)));
    if (nearest > reach) continue;
    for (const g of mine) if (tierDistance(g, tier) === nearest) keep.add(g.id);
  }
  return groups.filter((g) => keep.has(g.id));
}

/** No age or level filter. The location is a choice, not a filter, so it never counts. */
export function isEmptyQuery(q: CatalogQuery): boolean {
  return q.age === null && q.tier === null;
}

/** "Clear filters": the age and level go, the chosen location stays. */
export function clearFilters(q: CatalogQuery): CatalogQuery {
  return { ...q, age: null, tier: null };
}

/** "for age 14 at Intermediate" · "for juniors (7–13)" · "at Intermediate" · "" */
export function describeQuery(q: CatalogQuery): string {
  const parts: string[] = [];
  if (q.age) parts.push(`for ${q.age.phrase}`);
  if (q.tier) parts.push(`at ${q.tier.name}`);
  return parts.join(" ");
}

/**
 * The results line, announced when the filters change: "7 groups" · "3 groups
 * for age 14 at Intermediate" · "No groups for juniors (7–13) at Pro yet."
 */
export function resultsLine(count: number, q: CatalogQuery): string {
  const scope = describeQuery(q);
  if (count === 0) return `No groups ${scope} yet.`.replace(/\s+/g, " ");
  const noun = count === 1 ? "group" : "groups";
  return scope ? `${count} ${noun} ${scope}` : `${count} ${noun}`;
}

/**
 * The quiz result's link into the catalog: the player's age band and, when
 * the quiz could name one, their provisional tier (audit M17, owner D4),
 * except for a competitive or tournament youth, whose link carries the band
 * alone so the High Performance Youth Bootcamp the result put first is in
 * the list (catalogTierFor).
 */
export function quizCatalogHref(ageBand: AgeBand | undefined, selfLevel: string | null | undefined): string {
  return catalogHref({
    location: null,
    age: ageBand ? AGE_BAND_QUERIES[ageBand] : null,
    tier: catalogTierFor(ageBand, selfLevel),
  });
}
