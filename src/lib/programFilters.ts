// The /programs catalog filters (owner, 2026-10-12): an age filter and a
// level filter over the groups, carried in the URL (?age=14&level=intermediate)
// so a filtered list can be shared and the quiz result can link to one.
// Pure and server-safe: the client component reads and writes the URL, the
// page and the tests read the rules here.

import { AGE_BAND_LABELS, type AgeBand } from "@/lib/ageBand";
import { TIERS, tierIdsInRange, type Tier } from "@/lib/tiers";
import type { ProgramGroup } from "@/types/program";

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

/** The tier for a URL value (its slug), or null. */
export function tierQueryFor(value: string | null | undefined): Tier | null {
  if (!value) return null;
  const slug = value.trim().toLowerCase();
  return TIERS.find((t) => t.slug === slug) ?? null;
}

export type CatalogQuery = { age: AgeQuery | null; tier: Tier | null };

export const EMPTY_QUERY: CatalogQuery = { age: null, tier: null };

/** The query a URL carries. Unknown values read as "any". */
export function parseCatalogQuery(params: { get(name: string): string | null }): CatalogQuery {
  return { age: ageQueryFor(params.get("age")), tier: tierQueryFor(params.get("level")) };
}

/** "age=14&level=intermediate", or "" for no filter. Keys in a fixed order, so equal queries share a URL. */
export function catalogQueryString(q: CatalogQuery): string {
  const params = new URLSearchParams();
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

/** Does the group's level band include this tier? */
export function groupTakesTier(group: Pick<ProgramGroup, "levelMin" | "levelMax">, tier: Tier): boolean {
  return tierIdsInRange(group.levelMin, group.levelMax).includes(tier.id);
}

export function groupMatches(group: ProgramGroup, q: CatalogQuery): boolean {
  if (q.age && !groupTakesAge(group, q.age)) return false;
  if (q.tier && !groupTakesTier(group, q.tier)) return false;
  return true;
}

export function filterGroups(groups: readonly ProgramGroup[], q: CatalogQuery): ProgramGroup[] {
  return groups.filter((g) => groupMatches(g, q));
}

export function isEmptyQuery(q: CatalogQuery): boolean {
  return q.age === null && q.tier === null;
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
 * the quiz could name one, their provisional tier (audit M17, owner D4).
 */
export function quizCatalogHref(ageBand: AgeBand | undefined, tier: Tier | null): string {
  return catalogHref({ age: ageBand ? AGE_BAND_QUERIES[ageBand] : null, tier });
}
