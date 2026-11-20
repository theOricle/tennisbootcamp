import type { Cohort, SessionSlot } from "@/types/cohort";
import type { ClassDay, ProgramGroup } from "@/types/program";
import { AGE_BAND_QUERIES } from "@/lib/programFilters";
import { isAgeBand } from "@/lib/ageBand";
import { formatCohortPrice } from "@/lib/cohorts";
import { generateSessionDates } from "@/lib/makeup";
import {
  blockLevel,
  classDayPlural,
  cohortMatchesGroup,
  formatBlockDates,
  formatClassDays,
  joinDays,
  programHeadingLine,
  programLevelTags,
  programWhoLabel,
  twelveHourStart,
} from "@/lib/programCatalog";
import { tierById, type TierId } from "@/lib/tiers";
import { BOOTCAMP_AUDIENCE, COHORT_LENGTH_ADJ, blockGroupTitle, numberInWords, priceSummaryFor } from "@/content/programs";
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
// program, the level tag, the level-led title and the ages. A block belongs
// to a planned group by program and level, never by day or time, through the
// one rule the sign-up page and the payment routes read too
// (cohortMatchesGroup, src/lib/programCatalog.ts); one that matches none
// still shows, built from its own program and level. Two open blocks of one
// group are two cards. A planned group with no open block keeps its own
// card, which reads "Dates coming soon".
//
// Pure, with no database and no React: the pages, the quiz's layout and the
// tests read one rule, and what reaches a client component is plain data.

export { blockLevel };

/** What a group card shows of one open block: everything it takes from the block. Plain data. */
export type BlockFacts = {
  /** The block's id: its sign-up page is /enroll/{cohortId}. */
  cohortId: string;
  /** The first class, ISO "YYYY-MM-DD": where a page says when the next block starts. */
  firstClass: string;
  /** "Jan 11 – Feb 15": the first class to the last (formatBlockDates). */
  dates: string;
  /** "Sundays 4–5pm" · "Sundays and Wednesdays 4–5pm" (formatClassDays). */
  days: string;
  /** The weekly classes in the order they first come: what a page's day lists read. */
  weekly: Pick<SessionSlot, "day" | "start" | "end">[];
  /**
   * "$280 for eight weeks": the block's own total over its own length, with
   * its class count when it runs more than one class a week ("$560 for 16
   * classes over eight weeks"; priceSummaryFor). Never a per-session figure.
   */
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

/** How many classes a block runs: 16 for two a week over eight weeks. */
export function blockClassCount(block: Pick<Cohort, "startDate" | "weeks" | "sessions">): number {
  return generateSessionDates(block.startDate, block.weeks, block.sessions).length;
}

/** The block's weekly classes in the order they first come, from its start date. */
function weekOrder(block: Pick<Cohort, "startDate" | "sessions">): SessionSlot[] {
  return generateSessionDates(block.startDate, 1, block.sessions).map(({ day, start, end }) => ({ day, start, end }));
}

/** Does a block show as a group card? Its program runs group bootcamps, and it has a class to show. */
export function isBootcampBlock(block: Pick<Cohort, "programId" | "sessions">): boolean {
  return Object.prototype.hasOwnProperty.call(BOOTCAMP_AUDIENCE, block.programId) && block.sessions.length > 0;
}

/**
 * The planned group a block trains in: the first in lineup order that the
 * one rule matches (cohortMatchesGroup: the same program and level, never
 * the day or time). Undefined when the lineup has no group at that level.
 */
export function plannedGroupForBlock(
  block: Pick<Cohort, "programId" | "levelMin" | "levelMax">,
  lineup: readonly ProgramGroup[]
): ProgramGroup | undefined {
  return lineup.find((g) => cohortMatchesGroup(block, g));
}

/**
 * "$280 for eight weeks", "$560 for 16 classes over eight weeks": the block's
 * own total over its own length, with its class count when it runs more than
 * one class a week; "Pricing TBA" for a block with no price set.
 */
export function blockPrice(block: Cohort): string {
  if (!(block.priceCents > 0)) return formatCohortPrice({ ...block, priceCents: 0 });
  return priceSummaryFor(block.priceCents / 100, block.weeks, blockClassCount(block));
}

/** The card's facts for one open block. */
export function blockFacts(block: Cohort, seatsLeft?: number | null): BlockFacts {
  const { first, last } = blockClassDates(block);
  const weekly = weekOrder(block);
  return {
    cohortId: block.id,
    firstClass: first,
    dates: formatBlockDates(first, last),
    days: formatClassDays(weekly),
    weekly,
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
  const level: TierId | null = blockLevel(block);
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

/** The cards that show an open block, in page order. */
export function openBlockCards(cards: readonly GroupCard[]): GroupCard[] {
  return cards.filter((c) => c.block !== null);
}

// ─── Signed in (owner, 2026-11-19: no dead end) ─────────────────────────────

/**
 * The open blocks a signed-in screen lists, the quiz's already-taken screen
 * and the dashboard: every open block but a by-approval one. Its "Ask to
 * join" leads to a sign-up page whose approval step sends a quiz-taker back
 * to the dashboard, where the same card would wait again; a signed-in
 * quiz-taker has asked already, by the quiz.
 */
export function signedInOpenCards(cards: readonly GroupCard[]): GroupCard[] {
  return cards.filter((c) => c.block !== null && c.group.joining !== "approval");
}

/** A player as an account holds one: enough to tell which groups' ages take them. */
export type AgePlayer = { age_band?: string | null; is_minor: boolean };

/**
 * Does a group's age range take this player? Ages only, never the level: the
 * player's band as an age range (junior 7–13, teen 14–17, adult 18 and up,
 * the catalog's own), or, with no band, under 18 or 18 and up.
 */
export function groupTakesPlayerAge(g: Pick<ProgramGroup, "ageMin" | "ageMax">, player: AgePlayer): boolean {
  const range = isAgeBand(player.age_band)
    ? AGE_BAND_QUERIES[player.age_band]
    : player.is_minor
      ? { min: 0, max: 17 }
      : { min: 18, max: null };
  const aboveMin = g.ageMin === null || range.max === null || g.ageMin <= range.max;
  const belowMax = g.ageMax === null || g.ageMax >= range.min;
  return aboveMin && belowMax;
}

/**
 * The open blocks the dashboard lists for an account: the signed-in list,
 * less the blocks the account is already enrolled in, and only those whose
 * ages take at least one of its players, so an adult-only household sees no
 * youth group. Ages only, never the level. An account with no player on
 * file sees every open block.
 */
export function accountOpenCards(
  cards: readonly GroupCard[],
  account: { enrolledCohortIds: readonly string[]; players: readonly AgePlayer[] }
): GroupCard[] {
  const enrolled = new Set(account.enrolledCohortIds);
  return signedInOpenCards(cards).filter(
    (c) =>
      !enrolled.has((c.block as BlockFacts).cohortId) &&
      (account.players.length === 0 || account.players.some((p) => groupTakesPlayerAge(c.group, p)))
  );
}

// ─── What a page says about its cards (fix round, #85) ──────────────────────
// Every heading, count, day list and "next starts" line on a program page and
// on /programs reads the cards the page shows, so a block on another day, or
// one that matches no planned group, is never left out of the words above it.

/** The days a card's classes run on, in the plural, in the order they come: a block's own, or a planned group's day. */
export function cardDays(card: GroupCard): string[] {
  if (card.block) return [...new Set(card.block.weekly.map((s) => classDayPlural(s.day)))];
  return card.group.day ? [`${card.group.day}s`] : [];
}

/** "Saturdays" · "Saturdays and Wednesdays": the days across the cards, in the order they first come. */
export function cardsDaysLabel(cards: readonly GroupCard[]): string {
  return joinDays([...new Set(cards.flatMap(cardDays))]);
}

/** "Three groups on Saturdays" · "Four groups on Saturdays and Wednesdays": counted from the cards shown. */
export function cardsHeading(cards: readonly GroupCard[]): string {
  const word = numberInWords(cards.length);
  const count = `${word.charAt(0).toUpperCase()}${word.slice(1)} group${cards.length === 1 ? "" : "s"}`;
  const days = cardsDaysLabel(cards);
  return days ? `${count} on ${days}` : count;
}

/** The first class of the earliest open block among the cards, ISO, or null when none is open. */
export function cardsNextStart(cards: readonly GroupCard[]): string | null {
  return cards.flatMap((c) => (c.block ? [c.block.firstClass] : [])).sort()[0] ?? null;
}

/**
 * "{Length}-week cohorts · Saturdays 12:00, 1:00 and 2:00": a program's schedule
 * line, from its cards: each day their classes run on, in the order it first
 * comes, with that day's class starts, earliest first. The cohort length is
 * the setting's.
 */
export function cardsScheduleLine(cards: readonly GroupCard[]): string {
  const startsByDay = new Map<string, Set<string>>();
  for (const card of cards) {
    const classes = card.block
      ? card.block.weekly.map((s) => ({ day: classDayPlural(s.day), start: s.start }))
      : card.group.day && card.group.start
        ? [{ day: `${card.group.day}s`, start: card.group.start }]
        : [];
    for (const { day, start } of classes) {
      const starts = startsByDay.get(day) ?? new Set<string>();
      starts.add(start.slice(0, 5));
      startsByDay.set(day, starts);
    }
  }
  const lead = `${COHORT_LENGTH_ADJ} cohorts`;
  const days = [...startsByDay].map(([day, starts]) => `${day} ${joinDays([...starts].sort().map(twelveHourStart))}`);
  return [`${lead.charAt(0).toUpperCase()}${lead.slice(1)}`, ...days].join(" · ");
}

/** The level tags the cards carry, one per distinct level in ladder order (null: one takes any level). */
export function cardsLevelTags(cards: readonly GroupCard[]): TierId[] | null {
  return programLevelTags(cards.map((c) => c.group));
}

/**
 * The line beside a program's title on /programs, from its cards: the days
 * their classes run on, then who ("Saturdays and Wednesdays · ages 7–17");
 * for a program with no fixed class, who and its level ("Any age · any level").
 */
export function cardsProgramLine(cards: readonly GroupCard[]): string {
  const groups = cards.map((c) => c.group);
  const days = cardsDaysLabel(cards.filter((c) => c.group.day !== null));
  if (!days) return programHeadingLine(groups);
  const who = programWhoLabel(groups);
  return `${days} · ${who.charAt(0).toLowerCase()}${who.slice(1)}`;
}
