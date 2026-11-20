import type { Cohort, SessionSlot } from "@/types/cohort";
import type { ClassDay, ProgramGroup } from "@/types/program";
import { formatCohortPrice } from "@/lib/cohorts";
import { generateSessionDates } from "@/lib/makeup";
import { formatBlockDates, formatClassDays } from "@/lib/programCatalog";
import { coversWholeLadder, tierById, tierRangeForLevels, type TierId } from "@/lib/tiers";
import { BOOTCAMP_AUDIENCE, blockGroupTitle, priceSummaryFor } from "@/content/programs";
import { defaultLocation, locationForCohort } from "@/content/locations";

// One group card per open block (owner, 2026-11-19: "you should be able to
// sign up and pay for a group not just ask to join"; 2026-11-20: "There
// should also be a date outlined on the card ... some groups may run twice a
// week later"). A block is a cohort the coach builds in /admin/cohorts; the
// ones a visitor may see (public, inviting or confirmed, not yet started:
// src/lib/cohortVisibility.ts) each show as a group card whose button opens
// the block's sign-up page, /enroll/{cohortId}.
//
// From the block, a card takes its dates (first class to last), its class
// days and times, its location, its price and length, and its seats left.
// From the planned lineup (src/content/programs.ts) it takes only the
// program, the level tag, the level-led title and the ages. A block matches
// a planned group by program and level, never by day or time; one that
// matches none still shows, built from its own program and level. Two open
// blocks of one group are two cards. A planned group with no open block keeps
// its own card, which reads "Dates coming soon".
//
// Pure, with no database and no React: the pages, the quiz's layout and the
// tests read one rule, and what reaches a client component is plain data.

/** What a group card shows of one open block: everything it takes from the block. Plain data. */
export type BlockFacts = {
  /** The block's id: its sign-up page is /enroll/{cohortId}. */
  cohortId: string;
  /** "Jan 11 – Feb 15": the first class to the last (formatBlockDates). */
  dates: string;
  /** "Sundays 4–5pm" · "Sundays and Wednesdays 4–5pm" (formatClassDays). */
  days: string;
  /** "$280 for eight weeks": the block's own total over its own length (priceSummaryFor). */
  price: string;
  /**
   * Seats left, the enroll page's own count (src/lib/groupSeats.ts). Null when
   * it could not be read, which reads "Open to join". Display only.
   */
  seatsLeft: number | null;
};

/** One card: its group, and the open block it shows; null for a planned group with no open block. */
export type GroupCard = { group: ProgramGroup; block: BlockFacts | null };

/** A session's day as a group names its class day. */
const DAY_NAME: Record<SessionSlot["day"], ClassDay> = {
  Mon: "Monday",
  Tue: "Tuesday",
  Wed: "Wednesday",
  Thu: "Thursday",
  Fri: "Friday",
  Sat: "Saturday",
  Sun: "Sunday",
};

/** The first class and the last, as ISO dates. A block with no dated class falls back to its start and end. */
export function blockClassDates(
  block: Pick<Cohort, "startDate" | "endDate" | "weeks" | "sessions">
): { first: string; last: string } {
  const dated = generateSessionDates(block.startDate, block.weeks, block.sessions);
  if (dated.length === 0) return { first: block.startDate, last: block.endDate || block.startDate };
  return { first: dated[0].date, last: dated[dated.length - 1].date };
}

/** The block's weekly classes in the order they first come, from its start date. */
function weekOrder(block: Pick<Cohort, "startDate" | "sessions">): SessionSlot[] {
  return generateSessionDates(block.startDate, 1, block.sessions).map(({ day, start, end }) => ({ day, start, end }));
}

/**
 * The one level a block is built for: the tier its band starts in (a 3.0–3.5
 * block is Intermediate), or null for a block built for any level (no band,
 * or a band over the whole ladder).
 */
export function blockLevel(block: Pick<Cohort, "levelMin" | "levelMax">): TierId | null {
  if (coversWholeLadder(block.levelMin, block.levelMax)) return null;
  return tierRangeForLevels(block.levelMin, block.levelMax)?.min.id ?? null;
}

/** Does a block show as a group card? Its program runs group bootcamps, and it has a class to show. */
export function isBootcampBlock(block: Pick<Cohort, "programId" | "sessions">): boolean {
  return Object.prototype.hasOwnProperty.call(BOOTCAMP_AUDIENCE, block.programId) && block.sessions.length > 0;
}

/**
 * The planned group a block trains in: the same program and the same level
 * (owner, 2026-11-19), the first in lineup order, never matched by day or
 * time. Undefined when the lineup has no group at that level.
 */
export function plannedGroupForBlock(
  block: Pick<Cohort, "programId" | "levelMin" | "levelMax">,
  lineup: readonly ProgramGroup[]
): ProgramGroup | undefined {
  const level = blockLevel(block);
  return lineup.find((g) => g.programSlug === block.programId && g.status !== "arranged" && g.level === level);
}

/** "$280 for eight weeks": the block's own total over its own length; "Pricing TBA" for a block with no price set. */
export function blockPrice(block: Cohort): string {
  if (!(block.priceCents > 0)) return formatCohortPrice({ ...block, priceCents: 0 });
  return priceSummaryFor(block.priceCents / 100, block.weeks);
}

/** The card's facts for one open block. */
export function blockFacts(block: Cohort, seatsLeft?: number | null): BlockFacts {
  const { first, last } = blockClassDates(block);
  return {
    cohortId: block.id,
    dates: formatBlockDates(first, last),
    days: formatClassDays(weekOrder(block)),
    price: blockPrice(block),
    seatsLeft: typeof seatsLeft === "number" && Number.isFinite(seatsLeft) ? seatsLeft : null,
  };
}

/**
 * A group for a block that matches no planned group, built from its own
 * program and level: titled from them ("Intermediate Youth Bootcamp"), the
 * ages the program's groups take together, the program's location, and open
 * to join (by approval is the High Performance Youth Bootcamp's own rule).
 */
function builtGroup(block: Cohort, lineup: readonly ProgramGroup[]): ProgramGroup {
  const level = blockLevel(block);
  const siblings = lineup.filter((g) => g.programSlug === block.programId);
  const mins = siblings.map((g) => g.ageMin);
  const maxes = siblings.map((g) => g.ageMax);
  return {
    id: `${block.programId}-${level === null ? "all-levels" : tierById(level).slug}`,
    programSlug: block.programId,
    locationId: siblings[0]?.locationId ?? defaultLocation()?.id ?? "",
    name: blockGroupTitle(block.programId, level),
    ageMin: siblings.length > 0 && mins.every((m) => m !== null) ? Math.min(...(mins as number[])) : null,
    ageMax: siblings.length > 0 && maxes.every((m) => m !== null) ? Math.max(...(maxes as number[])) : null,
    level,
    day: null,
    start: null,
    end: null,
    price: "",
    status: "forming",
    joining: "open",
  };
}

/**
 * The group a block's card shows, under the card's own id: the planned
 * group's program, level tag, title, ages and joining rule (or a group built
 * from the block's program and level), with the block's class day and time
 * (its first class), its location and its price.
 */
function blockCardGroup(block: Cohort, base: ProgramGroup, id: string): ProgramGroup {
  const first = weekOrder(block)[0];
  return {
    ...base,
    id,
    locationId: locationForCohort(block)?.id ?? base.locationId,
    day: first ? DAY_NAME[first.day] : null,
    start: first ? first.start : null,
    end: first ? first.end : null,
    price: blockPrice(block),
  };
}

/**
 * Every group card, in lineup order (owner, 2026-11-19): a planned group
 * with open blocks shows one card per block, the earliest first; one with
 * none keeps its own card ("Dates coming soon"); a block that matches no
 * planned group shows in its program's run by level; a group with no fixed
 * class (private lessons) keeps its row. Card ids are unique on a page: the
 * first card of a planned group keeps the group's id (so
 * /programs/youth-programs#high-performance still lands), the next ones add
 * "-2", "-3".
 *
 * `seats` is each block's seats left by its id (src/lib/groupSeats.ts).
 */
export function groupCards(
  lineup: readonly ProgramGroup[],
  publicBlocks: readonly Cohort[],
  seats: Readonly<Record<string, number | null | undefined>> = {}
): GroupCard[] {
  const blocks = publicBlocks
    .filter(isBootcampBlock)
    .map((block) => ({ block, first: blockClassDates(block).first }))
    .sort((a, b) => a.first.localeCompare(b.first) || a.block.id.localeCompare(b.block.id));

  const taken = new Set<string>();
  const claim = (base: string): string => {
    let id = base;
    for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
    taken.add(id);
    return id;
  };

  const programOrder = [...new Set(lineup.map((g) => g.programSlug))];
  const rank = (slug: string) => {
    const i = programOrder.indexOf(slug);
    return i === -1 ? programOrder.length : i;
  };
  type Placed = { card: GroupCard; program: number; level: number; lineup: number; first: string };
  const placed: Placed[] = [];

  lineup.forEach((g, index) => {
    const mine = g.status === "arranged" ? [] : blocks.filter(({ block }) => plannedGroupForBlock(block, lineup) === g);
    const base = { program: rank(g.programSlug), level: g.level ?? Number.MAX_SAFE_INTEGER, lineup: index };
    if (mine.length === 0) {
      placed.push({ ...base, first: "", card: { group: { ...g, id: claim(g.id) }, block: null } });
      return;
    }
    for (const { block, first } of mine) {
      placed.push({
        ...base,
        first,
        card: { group: blockCardGroup(block, g, claim(g.id)), block: blockFacts(block, seats[block.id]) },
      });
    }
  });

  for (const { block, first } of blocks) {
    if (plannedGroupForBlock(block, lineup)) continue;
    const built = builtGroup(block, lineup);
    placed.push({
      program: rank(block.programId),
      level: built.level ?? Number.MAX_SAFE_INTEGER,
      lineup: lineup.length,
      first,
      card: { group: blockCardGroup(block, built, claim(built.id)), block: blockFacts(block, seats[block.id]) },
    });
  }

  return placed
    .sort((a, b) => a.program - b.program || a.level - b.level || a.lineup - b.lineup || a.first.localeCompare(b.first))
    .map((p) => p.card);
}

/** The cards that show an open block, in page order: what the quiz's already-taken screen and the dashboard list. */
export function openBlockCards(cards: readonly GroupCard[]): GroupCard[] {
  return cards.filter((c) => c.block !== null);
}
