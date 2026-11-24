import type { Cohort, SessionSlot } from "@/types/cohort";
import type { ClassDay, ProgramGroup } from "@/types/program";
import { AGE_BAND_QUERIES } from "@/lib/programFilters";
import { isAgeBand } from "@/lib/ageBand";
import { formatCohortPrice } from "@/lib/cohorts";
import { generateSessionDates } from "@/lib/makeup";
import {
  blockLevel,
  classDayPlural,
  groupAction,
  groupStatus,
  cohortMatchesGroup,
  formatBlockDates,
  formatClassDays,
  formatClassHours,
  joinDays,
  programHeadingLine,
  programLevelTags,
  programWhoLabel,
} from "@/lib/programCatalog";
import { levelNumber, tierById, type TierId } from "@/lib/tiers";
import {
  BOOTCAMP_AUDIENCE,
  COHORT_LENGTH_ADJ,
  COHORT_TOTAL_CENTS,
  COHORT_WEEKS,
  GROUP_PRICE,
  blockGroupTitle,
  formatDollars,
  numberInWords,
  priceSummaryFor,
  programGroups,
} from "@/content/programs";
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
   * "$280 for 8 classes over eight weeks", "$560 for 16 classes over eight
   * weeks": the block's own total over its own length, with its class count,
   * so two cards' prices compare at a glance (priceSummaryFor). Never a
   * per-session figure.
   */
  price: string;
  /** The block's total in cents (0 when no price is set): what a page's price reads (cardsPrice). */
  totalCents: number;
  /** How many classes the block runs, counted from its sessions (blockClassCount). */
  classes: number;
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

/**
 * One class's share of a block's price (backlog #86; owner, 2026-11-22: the
 * code works it out, and the site shows it quietly). Plain data.
 */
export type PerClassFigure = {
  /** The classes the block runs, the number its card names ("for 8 classes over eight weeks"). */
  classes: number;
  /** The block's price over its classes, in cents, rounded to the cent. */
  cents: number;
  /** "$35" for whole dollars; anything else to the cent, "$33.33". */
  amount: string;
};

/** Any date will do for a count: a block runs one class per class day per week, whatever day it starts. */
const COUNT_FROM = "2026-01-05";

/**
 * A block's per-class figure: its own price, from its row, over the classes
 * it runs, counted as its card counts them (blockClassCount). A class the
 * coach cancels is a dated row of its own (cohort_sessions), and so is its
 * make-up, so neither changes the count: the class is counted once. Null for
 * a block with no price, a zero price or no classes. It reads no price or
 * length typed in code. A form with no start date yet (admin) counts the
 * same, since the count does not depend on the date.
 *
 * Shown on the sign-up page of one block, under its whole price, and in
 * admin beside the price; nowhere else (npm test, test-copy-truth.ts).
 */
export function perClassFigure(
  block: Pick<Cohort, "priceCents" | "weeks" | "sessions"> & { startDate?: string | null }
): PerClassFigure | null {
  if (!blockHasPrice(block) || !Number.isInteger(block.weeks)) return null;
  const startDate = block.startDate && /^\d{4}-\d{2}-\d{2}$/.test(block.startDate) ? block.startDate : COUNT_FROM;
  const classes = blockClassCount({ startDate, weeks: block.weeks, sessions: block.sessions });
  if (classes <= 0) return null;
  const cents = Math.round(block.priceCents / classes);
  return { classes, cents, amount: formatDollars(cents / 100) };
}

/**
 * "8 classes, $35 each" · "6 classes, $33.33 each" · "1 class, $40": the
 * figure as one line. Each number keeps its word on its line, so a narrow
 * column breaks it only after the comma.
 */
export function perClassLine(figure: PerClassFigure): string {
  const nbsp = String.fromCharCode(0xa0);
  if (figure.classes === 1) return `1${nbsp}class, ${figure.amount}`;
  return `${figure.classes}${nbsp}classes, ${figure.amount}${nbsp}each`;
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
 * Does the block have a price to charge? (Safety review, #85.) One with none,
 * or zero, is nobody's to enroll in: it is no group card (its group falls
 * back to "Dates coming soon" and "Notify me"), its sign-up page refuses,
 * and both payment routes refuse it by the same test (priceRefusal,
 * src/lib/enrollGate.ts).
 */
export function blockHasPrice(block: Pick<Cohort, "priceCents">): boolean {
  const cents = block.priceCents;
  return typeof cents === "number" && Number.isFinite(cents) && cents > 0;
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
 * "$280 for 8 classes over eight weeks", "$560 for 16 classes over eight
 * weeks": the block's own total over its own length, with its class count,
 * once a week or twice; "Pricing TBA" for a block with no price set.
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
    totalCents: block.priceCents > 0 ? block.priceCents : 0,
    classes: blockClassCount(block),
    seatsLeft: typeof seatsLeft === "number" && Number.isFinite(seatsLeft) ? seatsLeft : null,
  };
}

/**
 * A group for a block that matches no planned group, built from its own
 * program and level: titled from them ("Intermediate Youth Bootcamp"), the
 * ages the program's groups take together, the program's location, and open
 * to join until groupForBlock says otherwise (blockByApproval).
 */
function builtGroup(
  block: Pick<Cohort, "programId" | "levelMin" | "levelMax">,
  lineup: readonly ProgramGroup[]
): ProgramGroup {
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
 * Is this block joined by approval? (Safety review, #85.) A program whose
 * lineup has a by-approval group (Youth Bootcamps: the High Performance
 * Youth Bootcamp) takes no walk-in into any block that could seat a player
 * of that group's level: one whose level band reaches that level, and one
 * whose levels were left blank, which takes every level. It never depends on
 * where the band starts, so a Youth block typed 4.0–7.0, 1.0–7.0 or with no
 * levels at all is by approval, as a 5.0–7.0 one is. A program with no
 * by-approval group (Adult Bootcamps) has none.
 *
 * The one rule for the approval step: the card's chip and button, the
 * sign-up page and both payment routes read it through groupForBlock.
 */
export function blockByApproval(
  block: Pick<Cohort, "programId" | "levelMin" | "levelMax">,
  lineup: readonly ProgramGroup[] = programGroups
): boolean {
  const floors = lineup
    .filter((g) => g.programSlug === block.programId && g.day !== null && g.joining === "approval")
    .map((g) => (g.level === null ? Number.NEGATIVE_INFINITY : tierById(g.level).levelMin));
  if (floors.length === 0) return false;
  const lo = levelNumber(block.levelMin);
  const hi = levelNumber(block.levelMax);
  // No band at all: the block takes every level.
  if (lo === null && hi === null) return true;
  // A missing bound means min = max for a cohort (src/lib/tiers.ts).
  return Math.max(lo ?? (hi as number), hi ?? (lo as number)) >= Math.min(...floors);
}

/**
 * The group a block trains in, on the planned lineup or off it (safety
 * review, #85): the planned group the one rule matches, else a group built
 * from the block's own program and level, with the ages its program's groups
 * take together. The card, the sign-up page (the ages it checks, and its
 * approval step) and both payment routes (approvalRefusal,
 * src/lib/enrollGate.ts) read this one function, so a block never shows one
 * group on its card and another, or none, on the page that takes the money.
 * Its joining rule is the block's own (blockByApproval), whichever group it
 * is. Null for a block of a program that runs no group bootcamps.
 */
export function groupForBlock(
  block: Pick<Cohort, "programId" | "levelMin" | "levelMax">,
  lineup: readonly ProgramGroup[] = programGroups
): ProgramGroup | null {
  if (!Object.prototype.hasOwnProperty.call(BOOTCAMP_AUDIENCE, block.programId)) return null;
  const group = plannedGroupForBlock(block, lineup) ?? builtGroup(block, lineup);
  return blockByApproval(block, lineup) && group.joining !== "approval" ? { ...group, joining: "approval" } : group;
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
 * planned group shows in its program's run by level; a block with no price
 * is no card at all (blockHasPrice), since nobody can enroll in it; a group with no fixed
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
    .filter((block) => isBootcampBlock(block) && blockHasPrice(block))
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
        card: {
          group: blockCardGroup(block, groupForBlock(block, lineup) ?? g, claim(g.id)),
          block: blockFacts(block, seats[block.id]),
        },
      });
    }
  });

  for (const { block, first } of blocks) {
    if (plannedGroupForBlock(block, lineup)) continue;
    const built = groupForBlock(block, lineup);
    if (!built) continue;
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

/**
 * Can a visitor enroll from this card now? Its button is "Enroll": an open
 * block with room, by the card's own rule (groupStatus, groupAction). A Full
 * card ("Notify me"), a by-approval one ("Ask to join") and a group with no
 * open block cannot. The dashboard's next step reads this before it says
 * "Or pick a group with dates below."
 */
export function cardTakesEnrollment(card: GroupCard): boolean {
  if (card.block === null) return false;
  return groupAction(card.group, groupStatus(card.group, card.block.seatsLeft)).kind === "join";
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

/**
 * The dashboard's "Open for your tier": private blocks only (safety review,
 * #85). A public block is already a card under "Groups with dates" above it,
 * with its own button; listed here again it repeated that card, and offered
 * "Enroll" on a public by-approval block to a player at its level, whose
 * sign-up page sends a walk-in back to the dashboard. A private block, which
 * admits a signed-in player by level, shows nowhere else. A block with no
 * visibility set is public, as everywhere.
 */
export function privateTierMatches<T extends { cohort: Pick<Cohort, "visibility"> }>(matches: readonly T[]): T[] {
  return matches.filter((m) => m.cohort.visibility === "private");
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

/**
 * The dashboard's "Suggested for you" beside its groups with dates: a
 * program whose open groups are listed there is left out, since those cards
 * already carry its dates, its price and "Enroll". Every other suggestion stays.
 */
export function suggestionsBesideCards<T extends { program: { id: string } }>(
  suggestions: readonly T[],
  listed: readonly GroupCard[]
): T[] {
  const programs = new Set(listed.filter((c) => c.block !== null).map((c) => c.group.programSlug));
  return suggestions.filter((s) => !programs.has(s.program.id));
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

/**
 * "Three groups on Saturdays" · "Four groups on Saturdays and Wednesdays":
 * the groups the cards show, counted once each (two blocks of one group are
 * one group with two date options), on the days their classes run.
 */
export function cardsHeading(cards: readonly GroupCard[]): string {
  const groups = new Set(cards.map((c) => c.group.name)).size;
  const word = numberInWords(groups);
  const count = `${word.charAt(0).toUpperCase()}${word.slice(1)} group${groups === 1 ? "" : "s"}`;
  const days = cardsDaysLabel(cards);
  return days ? `${count} on ${days}` : count;
}

/** A card's price as numbers: a block's own, or a planned group's from the setting; null when it names no amount. */
function cardPriceFacts(card: GroupCard): { totalCents: number; classes: number } | null {
  if (card.block) {
    const { totalCents, classes } = card.block;
    return totalCents > 0 && classes > 0 ? { totalCents, classes } : null;
  }
  // A planned group reads the setting's price, one class a week (GROUP_PRICE).
  if (card.group.day !== null && card.group.price === GROUP_PRICE) {
    return { totalCents: COHORT_TOTAL_CENTS, classes: COHORT_WEEKS };
  }
  return null;
}

/**
 * A program page's price, short, from every card it shows, with dates or
 * without, with the class count as the cards name it: "$280 for 8 classes"
 * when they all cost the same, "from $280 for 8 classes" (the lowest, and its
 * class count) when they differ, so one open block beside cheaper cards
 * with no dates never reads as the only price. The setting's line
 * (`fallback`) when no card names an amount.
 */
export function cardsPrice(cards: readonly GroupCard[], fallback: string): string {
  const priced = cards.flatMap((c) => {
    const facts = cardPriceFacts(c);
    return facts ? [facts] : [];
  });
  if (priced.length === 0) return fallback;
  const lowest = [...priced].sort((a, b) => a.totalCents - b.totalCents || a.classes - b.classes)[0];
  const text = `${formatDollars(lowest.totalCents / 100)} for ${lowest.classes} class${lowest.classes === 1 ? "" : "es"}`;
  return priced.every((p) => p.totalCents === lowest.totalCents && p.classes === lowest.classes) ? text : `from ${text}`;
}

/** The first class of the earliest open block among the cards, ISO, or null when none is open. */
export function cardsNextStart(cards: readonly GroupCard[]): string | null {
  return cards.flatMap((c) => (c.block ? [c.block.firstClass] : [])).sort()[0] ?? null;
}

/**
 * "{Length}-week cohorts · Saturdays 12–1pm, 1–2pm and 2–3pm": a program's
 * schedule line, from its cards: each day their classes run on, in the order
 * it first comes, with that day's classes, earliest first, in the cards' own
 * time style (formatClassHours). The cohort length is the setting's.
 */
export function cardsScheduleLine(cards: readonly GroupCard[]): string {
  const classesByDay = new Map<string, Map<string, string>>();
  for (const card of cards) {
    const classes = card.block
      ? card.block.weekly.map((s) => ({ day: classDayPlural(s.day), start: s.start, end: s.end }))
      : card.group.day && card.group.start && card.group.end
        ? [{ day: `${card.group.day}s`, start: card.group.start, end: card.group.end }]
        : [];
    for (const { day, start, end } of classes) {
      const times = classesByDay.get(day) ?? new Map<string, string>();
      times.set(`${start.slice(0, 5)}-${end.slice(0, 5)}`, formatClassHours(start, end));
      classesByDay.set(day, times);
    }
  }
  const lead = `${COHORT_LENGTH_ADJ} cohorts`;
  const days = [...classesByDay].map(([day, times]) => {
    const ordered = [...times].sort(([a], [b]) => a.localeCompare(b)).map(([, hours]) => hours);
    return `${day} ${joinDays(ordered)}`;
  });
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
