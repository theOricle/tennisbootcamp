import type { Program, ProgramGroup, TimetableSlot } from "@/types/program";
import type { Cohort, SessionSlot } from "@/types/cohort";
import { audienceLabel, isAgeBand } from "@/lib/ageBand";
import { formatStartDate } from "@/lib/cohorts";
import { levelNumber, levelWithinRange, tierById, LEVEL_MAX, LEVEL_MIN, type Tier, type TierId } from "@/lib/tiers";

// The program catalog's decision data (audit H7, M31; design specs §5.2;
// groups per owner 2026-10-12): what a card says about a program or a group's
// status, who it is for and when it runs, and whether a player on an account
// fits it. Pure and server-safe — no React, no database — so the dashboard,
// the cards, the quiz and the tests read one rule.

export type LevelRange = { min: number; max: number };

export type ProgramStatusKind =
  | "coming-soon"
  | "next-cohort"
  | "invite-only"
  | "full"
  | "forming"
  | "open"
  | "low"
  | "approval";

export type ProgramStatus = { kind: ProgramStatusKind; label: string };

/**
 * This season's status chip. Precedence: coming soon, then the next public
 * cohort's start, then "Invite only", else "Groups forming" (owner D11). A
 * program with no fixed class (private lessons) shows no chip, as its group
 * shows none: the card's eyebrow and When row already read "By arrangement".
 */
export function programStatus(p: Program, nextCohort?: Cohort | null): ProgramStatus | null {
  if (p.comingSoon) return { kind: "coming-soon", label: "Coming Soon" };
  if (nextCohort) {
    return { kind: "next-cohort", label: `Next cohort ${formatStartDate(nextCohort.startDate)}` };
  }
  if (p.enrollmentStatus === "invite-only") return { kind: "invite-only", label: "Invite only" };
  if (!p.timetable?.length) return null;
  return { kind: "forming", label: "Groups forming" };
}

/**
 * A group card names how many spots are left at this many or fewer: the
 * enroll page's own threshold ("Only 2 spots left", EnrollWizard), so the
 * card and the page a visitor lands on never disagree.
 */
export const LOW_SEATS_THRESHOLD = 3;

/**
 * A group's status chip (joining flow, owner 2026-10-12; seats, owner-approved
 * design 2026-11-17; one card per open block, owner 2026-11-19): how a player
 * gets in. "Full" when the group is marked full or its block has no seat
 * left. "Invite only" keeps its chip. A by-approval group (High Performance)
 * reads "By approval" whatever its seats, since that is the fact a visitor
 * needs first. "{n} spots left" when the block is down to LOW_SEATS_THRESHOLD
 * or fewer, and "Open to join" otherwise. An arranged group (private lessons)
 * shows no chip.
 *
 * `seatsLeft` is the seat count of the card's open block, the one the enroll
 * page reads (src/lib/seatCount.ts through src/lib/groupSeats.ts). Null or
 * absent means it could not be read: the group then reads "Open to join",
 * never an error. Display only.
 *
 * `dated` is false for a planned group with no open block: it has nothing to
 * join yet, so it never reads "Open to join" or a seat count. The facts that
 * stand without dates (Full, Invite only, By approval) keep their chip, and
 * an open group shows none; its card reads "Dates coming soon".
 */
export function groupStatus(g: ProgramGroup, seatsLeft?: number | null, dated = true): ProgramStatus | null {
  if (g.status === "arranged") return null;
  const seats = dated && typeof seatsLeft === "number" && Number.isFinite(seatsLeft) ? seatsLeft : null;
  if (g.status === "full" || (seats !== null && seats <= 0)) return { kind: "full", label: "Full" };
  if (g.status === "invite-only") return { kind: "invite-only", label: "Invite only" };
  if (g.joining === "approval") return { kind: "approval", label: "By approval" };
  if (!dated) return null;
  if (seats !== null && seats <= LOW_SEATS_THRESHOLD) {
    return { kind: "low", label: `${seats} spot${seats === 1 ? "" : "s"} left` };
  }
  return { kind: "open", label: "Open to join" };
}

/**
 * What a group card's one button does: "join" is the lime button of an open
 * block or one down to its last spots; "ask" the outline of a by-approval or
 * invite-only block, or of a group with no fixed class; "notify" the outline
 * of a full block, or of a planned group with no open block.
 */
export type GroupActionKind = "join" | "ask" | "notify";

export type GroupAction = {
  kind: GroupActionKind;
  /** The button's words: "Join", "Ask to join", "Notify me", "Ask about lessons". */
  label: string;
  /** The rest of its accessible name, after the label: " the Beginner Junior Bootcamp". */
  nameSuffix: string;
};

/**
 * The lime button of an open block (owner, 2026-11-19: "you should be able to
 * sign up and pay for a group not just ask to join"). It opens the block's
 * sign-up page, /enroll/{cohortId}, where the player picks who plays, signs
 * the agreement and pays, signed in or not.
 */
export const JOIN_LABEL = "Join";

/**
 * The outline button of a by-approval block (High Performance) and of an
 * invite-only one. It opens the same sign-up page, whose approval step takes
 * over (the quiz, then our coaches' yes).
 */
export const ASK_TO_JOIN_LABEL = "Ask to join";

/** The outline button of a full block, and of a planned group with no open block. */
export const NOTIFY_LABEL = "Notify me";

/** "the Beginner Junior Bootcamp" · "the One-to-one coaching group". */
function groupNamed(name: string): string {
  return `the ${name}${/bootcamp$/i.test(name) ? "" : " group"}`;
}

/**
 * A group card's one action, from its status (owner-approved design,
 * 2026-11-17; join and pay, owner 2026-11-19 and 2026-11-20): "Join" on the
 * lime button of a block that is open or down to its last spots; "Ask to
 * join" on the outline of a by-approval or invite-only block; an outline
 * "Notify me" for a full block, and for a planned group with no open block
 * (`dated` false); and "Ask about lessons" for a group with no fixed class.
 * Each is named for its group for assistive tech ("Join the Beginner Adult
 * Bootcamp").
 */
export function groupAction(
  g: Pick<ProgramGroup, "name" | "status">,
  status: ProgramStatus | null,
  dated = true
): GroupAction {
  const named = groupNamed(g.name);
  if (g.status === "arranged") return { kind: "ask", label: "Ask about lessons", nameSuffix: "" };
  if (!dated) return { kind: "notify", label: NOTIFY_LABEL, nameSuffix: ` when ${named} has dates` };
  if (status?.kind === "full") return { kind: "notify", label: NOTIFY_LABEL, nameSuffix: ` when ${named} has a spot` };
  if (status?.kind === "approval" || status?.kind === "invite-only") {
    return { kind: "ask", label: ASK_TO_JOIN_LABEL, nameSuffix: ` ${named}` };
  }
  return { kind: "join", label: JOIN_LABEL, nameSuffix: ` ${named}` };
}

/** What the eyebrow reads: the bands, the timetable's days, else the schedule line or the type. */
export type EyebrowSource = Pick<Program, "ageBands" | "timetable" | "schedule" | "type">;

/** The class days a timetable runs on, in timetable order: ["Saturday"] or ["Sunday"]. */
function timetableDays(p: EyebrowSource): string[] {
  return [...new Set((p.timetable ?? []).map((slot) => slot.day))];
}

/**
 * The line above a card's title, so it never repeats the title: "Juniors and
 * teens · Saturdays", "Adults · Sundays", "Any age · By arrangement". A program
 * with no timetable shows its schedule line (or its type) instead of days.
 */
export function programEyebrow(p: EyebrowSource): string {
  const audience = audienceLabel(p.ageBands);
  const days = timetableDays(p);
  const when = days.length > 0 ? days.map((day) => `${day}s`).join(" and ") : p.schedule ?? p.type;
  return [audience, when].filter(Boolean).join(" · ");
}

/** "12:00" from "12:00", "4:00" from "16:00": the start as the timetable states it. */
export function twelveHourStart(time: string): string {
  const [h, m] = time.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return time;
  return `${h % 12 || 12}:${String(m).padStart(2, "0")}`;
}

/**
 * "12:00–1:00 pm" from ("12:00", "13:00"), "9:00–10:00 am" from ("09:00",
 * "10:00"): the class time as every surface prints it, the suffix once, from
 * the end of the class.
 */
export function formatClassTime(start: string, end: string): string {
  const endHour = Number(end.split(":")[0]);
  const suffix = Number.isFinite(endHour) && endHour >= 12 ? "pm" : "am";
  return `${twelveHourStart(start)}–${twelveHourStart(end)} ${suffix}`;
}

/** "Sat 12:00–1:00 pm": the day abbreviated, the time as the timetable states it. */
export function formatSlotWhen(slot: TimetableSlot): string {
  return `${slot.day.slice(0, 3)} ${slot.time}`;
}

/**
 * A one-line price as the amount and what it buys, for a card that stacks
 * the two: PRICE_SUMMARY, the cohort total then "for" and the cohort length,
 * is the total and the rest. A price with no leading amount ("Rates on
 * request") is one part. The words come from the price constants in
 * src/content/programs.ts; nothing is typed here.
 */
export function priceParts(text: string): [string] | [string, string] {
  const match = /^(\$\d[\d,.]*)\s+(.+)$/.exec(text);
  return match ? [match[1], match[2]] : [text];
}

/** "Saturdays 12:00–1:00 pm", or "By arrangement" for a group with no fixed class. */
export function formatGroupWhen(g: ProgramGroup): string {
  if (!g.day || !g.start || !g.end) return "By arrangement";
  return `${g.day}s ${formatClassTime(g.start, g.end)}`;
}

/** "Sat 12:00": the group's day and start, for a one-line timetable. */
export function formatGroupStart(g: ProgramGroup): string {
  if (!g.day || !g.start) return "By arrangement";
  return `${g.day.slice(0, 3)} ${twelveHourStart(g.start)}`;
}

/** "7–10" · "16 and up" · "Any age": the group's ages, for an "Ages" row. */
export function groupAgeLabel(g: Pick<ProgramGroup, "ageMin" | "ageMax">): string {
  if (g.ageMin === null && g.ageMax === null) return "Any age";
  if (g.ageMax === null) return `${g.ageMin} and up`;
  if (g.ageMin === null) return `up to ${g.ageMax}`;
  return `${g.ageMin}–${g.ageMax}`;
}

/**
 * The ages a program takes, from its groups: "7–17" (the youngest and the
 * oldest across every group), "16 and up", "Any age". A program with no
 * groups reads "Any age".
 */
export function programAgeLabel(groups: readonly Pick<ProgramGroup, "ageMin" | "ageMax">[]): string {
  if (groups.length === 0) return "Any age";
  const mins = groups.map((g) => g.ageMin);
  const maxes = groups.map((g) => g.ageMax);
  const ageMin = mins.some((m) => m === null) ? null : Math.min(...(mins as number[]));
  const ageMax = maxes.some((m) => m === null) ? null : Math.max(...(maxes as number[]));
  return groupAgeLabel({ ageMin, ageMax });
}

/** "Ages 7–17" · "Ages 16 and up" · "Any age": the chip under a program's title. */
export function agesChipLabel(groups: readonly Pick<ProgramGroup, "ageMin" | "ageMax">[]): string {
  const label = programAgeLabel(groups);
  return label === "Any age" ? label : `Ages ${label}`;
}

/** "Ages 7–10" · "16 and up" · "Any age": an age label as a plain line, with no "Ages" row label in front. */
function agesLine(label: string): string {
  return /^\d/.test(label) && !label.includes("and up") ? `Ages ${label}` : label.replace(/^up to/, "Ages up to");
}

/** "Ages 7–10" · "16 and up" · "Any age": who a group is for, the first plain line on its card. */
export function groupWhoLabel(g: Pick<ProgramGroup, "ageMin" | "ageMax">): string {
  return agesLine(groupAgeLabel(g));
}

/** "Ages 7–17" · "16 and up" · "Any age": who a program is for, from its groups. */
export function programWhoLabel(groups: readonly Pick<ProgramGroup, "ageMin" | "ageMax">[]): string {
  return agesLine(programAgeLabel(groups));
}

/** "Saturdays" · "Saturdays and Sundays" · "By arrangement": the days a program's groups train. */
export function programDaysLabel(groups: readonly Pick<ProgramGroup, "day">[]): string {
  const days = [...new Set(groups.flatMap((g) => (g.day ? [`${g.day}s`] : [])))];
  return days.length > 0 ? days.join(" and ") : "By arrangement";
}

/**
 * Who and when in one line, for the home page's program card: "Ages 7–17 ·
 * Saturdays", "16 and up · Sundays", "Any age · By arrangement".
 */
export function programWhoWhenLine(groups: readonly Pick<ProgramGroup, "ageMin" | "ageMax" | "day">[]): string {
  return `${programWhoLabel(groups)} · ${programDaysLabel(groups)}`;
}

/**
 * The line beside a program's title on /programs: when, then who, for a
 * program with fixed classes ("Saturdays · ages 7–17", "Sundays · 16 and
 * up"); who and the level for one with none ("Any age · any level").
 */
export function programHeadingLine(
  groups: readonly Pick<ProgramGroup, "ageMin" | "ageMax" | "day" | "level">[]
): string {
  const who = programWhoLabel(groups);
  if (groups.some((g) => g.day !== null)) {
    return `${programDaysLabel(groups)} · ${who.charAt(0).toLowerCase()}${who.slice(1)}`;
  }
  const tags = programLevelTags(groups);
  const level = tags === null || tags.length === 0 ? "any level" : tags.map((id) => tierById(id).name).join(" and ");
  return `${who} · ${level}`;
}

// ─── A group card's dates and class days (owner, 2026-11-20) ────────────────
// "There should also be a date outlined on the card. For example July 15th -
// Aug 15th. Keep in mind also that some groups may run twice a week later."
// The card says when a block runs in the site's short style: the dates from
// the first class to the last ("Jan 11 – Feb 15"), then the class days and
// times ("Sundays 4–5pm", "Sundays and Wednesdays 4–5pm").

/** A session's day as the card names it, in the plural: "Sun" → "Sundays". */
const DAY_PLURAL: Record<SessionSlot["day"], string> = {
  Mon: "Mondays",
  Tue: "Tuesdays",
  Wed: "Wednesdays",
  Thu: "Thursdays",
  Fri: "Fridays",
  Sat: "Saturdays",
  Sun: "Sundays",
};

/** "4" · "4:30" · "12": an hour on the twelve-hour clock, the minutes only when there are some. */
function shortClock(h: number, m: number): string {
  return m === 0 ? `${h % 12 || 12}` : `${h % 12 || 12}:${String(m).padStart(2, "0")}`;
}

/**
 * "4–5pm" · "9–10am" · "11am–12pm" · "4:30–5:30pm": a class's hours, short,
 * am or pm once when both ends share it. Times arrive as "16:00" or, from
 * Postgres, "16:00:00".
 */
export function formatClassHours(start: string, end: string): string {
  const [sh, sm] = start.slice(0, 5).split(":").map(Number);
  const [eh, em] = end.slice(0, 5).split(":").map(Number);
  if (![sh, sm, eh, em].every(Number.isFinite)) return `${start}–${end}`;
  const startSuffix = sh >= 12 ? "pm" : "am";
  const endSuffix = eh >= 12 ? "pm" : "am";
  return startSuffix === endSuffix
    ? `${shortClock(sh, sm)}–${shortClock(eh, em)}${endSuffix}`
    : `${shortClock(sh, sm)}${startSuffix}–${shortClock(eh, em)}${endSuffix}`;
}

/** "Sundays" · "Sundays and Wednesdays" · "Mondays, Wednesdays and Fridays". */
function joinDays(days: readonly string[]): string {
  if (days.length <= 1) return days[0] ?? "";
  return `${days.slice(0, -1).join(", ")} and ${days[days.length - 1]}`;
}

/**
 * The class days and times of a block, short, in the order they first come
 * in a week of the block: "Sundays 4–5pm"; two days at one time, "Sundays and
 * Wednesdays 4–5pm"; different times, each day with its own, "Sundays 4–5pm,
 * Wednesdays 6–7pm". Days that share a time are said once with it.
 */
export function formatClassDays(sessions: readonly Pick<SessionSlot, "day" | "start" | "end">[]): string {
  const byHours = new Map<string, string[]>();
  for (const s of sessions) {
    const hours = formatClassHours(s.start, s.end);
    const days = byHours.get(hours) ?? [];
    const day = DAY_PLURAL[s.day] ?? s.day;
    if (!days.includes(day)) days.push(day);
    byHours.set(hours, days);
  }
  return [...byHours].map(([hours, days]) => `${joinDays(days)} ${hours}`).join(", ");
}

/** A planned group's own class day and time, short: "Saturdays 12–1pm"; "By arrangement" with no fixed class. */
export function groupClassDays(g: Pick<ProgramGroup, "day" | "start" | "end">): string {
  if (!g.day || !g.start || !g.end) return "By arrangement";
  return formatClassDays([{ day: g.day.slice(0, 3) as SessionSlot["day"], start: g.start, end: g.end }]);
}

/**
 * "Jan 11 – Feb 15": a block's dates, from its first class to its last, in
 * the site's short style (the fixed month list in src/lib/cohorts.ts). The
 * year shows only when the block runs into a new year ("Dec 6, 2026 – Jan
 * 10, 2027"); a block of one class is its one date.
 */
export function formatBlockDates(first: string, last: string): string {
  if (!last || first === last) return formatStartDate(first);
  const firstYear = first.slice(0, 4);
  const lastYear = last.slice(0, 4);
  return firstYear === lastYear
    ? `${formatStartDate(first)} – ${formatStartDate(last)}`
    : `${formatStartDate(first)}, ${firstYear} – ${formatStartDate(last)}, ${lastYear}`;
}

/** What a card says where a planned group has no open block (owner, 2026-11-20). */
export const DATES_COMING_SOON = "Dates coming soon";

/** The group's tier (its one level tag), or null for a group built for any level. */
export function groupTier(g: Pick<ProgramGroup, "level">): Tier | null {
  return g.level === null ? null : tierById(g.level);
}

/**
 * The numeric band behind a group's level tag (internal: fit checks and
 * cohort matching). Intermediate is 3.0–3.5, High Performance 5.0–7.0; a
 * group built for any level spans the ladder.
 */
export function groupLevelRange(g: Pick<ProgramGroup, "level">): LevelRange {
  const tier = groupTier(g);
  return tier ? { min: tier.levelMin, max: tier.levelMax } : { min: LEVEL_MIN, max: LEVEL_MAX };
}

/** A class's level band, or null when the slot carries no level. */
export function slotLevelRange(slot: TimetableSlot): LevelRange | null {
  if (slot.level === undefined) return null;
  return groupLevelRange({ level: slot.level });
}

/**
 * The level tags a program's groups carry, one per distinct tier in ladder
 * order (owner, 2026-10-13): Youth Bootcamps reads [Beginner, Novice, High
 * Performance]. `null` when any group takes every level (private lessons),
 * which a card shows as "All levels". [] for a program with no groups.
 */
export function programLevelTags(groups: readonly Pick<ProgramGroup, "level">[]): TierId[] | null {
  if (groups.some((g) => g.level === null)) return null;
  return [...new Set(groups.map((g) => g.level as TierId))].sort((a, b) => a - b);
}

/** The program's numeric span (the union of its groups' tiers), or null when unset: unset renders nothing. */
export function programLevelRange(p: Program): LevelRange | null {
  if (p.levelMin === undefined || p.levelMax === undefined) return null;
  return { min: p.levelMin, max: p.levelMax };
}

/** The groups of one program, in lineup order. */
export function groupsOf(groups: readonly ProgramGroup[], program: Pick<Program, "slug">): ProgramGroup[] {
  return groups.filter((g) => g.programSlug === program.slug);
}

/**
 * Does a cohort train in this group, by its class? The cohort's program and
 * its first session's day and start must match the group's class. A cohort
 * of a program with no fixed class (private lessons) never matches. The
 * enroll page and the payment routes find a cohort's group this way (its
 * ages, and the by-approval step); the group cards match a block to its
 * group by program and level instead (src/lib/groupBlocks.ts).
 */
export function cohortMatchesGroup(cohort: Pick<Cohort, "programId" | "sessions">, g: ProgramGroup): boolean {
  if (cohort.programId !== g.programSlug || !g.day || !g.start) return false;
  const session = cohort.sessions[0];
  if (!session) return false;
  return session.day === g.day.slice(0, 3) && twelveHourStart(session.start) === twelveHourStart(g.start);
}

/** What a card needs to know about one player on an account. */
export type FitPlayer = {
  is_minor: boolean;
  /**
   * The age band the player last answered (migration 0009, audit M31). When
   * known it decides the age fit exactly; null or absent falls back to
   * `is_minor`.
   */
  age_band?: string | null;
  /** Coach-assigned level, or null while unranked. A Postgres numeric string is fine. */
  level: number | string | null | undefined;
};

/** True when the program takes players of this age (juniors and teens are minors). */
export function programFitsAge(p: Pick<Program, "ageBands">, isMinor: boolean): boolean {
  return isMinor
    ? p.ageBands.includes("junior") || p.ageBands.includes("teen")
    : p.ageBands.includes("adult");
}

/**
 * Does the program take a player of this age? The stored band when known
 * (migration 0009), else minor vs adult. The dashboard's open-cohort list
 * reads this too, so a child is never offered an adult group (audit M27).
 */
export function programTakesPlayerAge(
  p: Pick<Program, "ageBands">,
  player: Pick<FitPlayer, "is_minor" | "age_band">
): boolean {
  return isAgeBand(player.age_band)
    ? p.ageBands.includes(player.age_band)
    : programFitsAge(p, player.is_minor);
}

/**
 * Does this program fit this player? Age through the program's bands; level
 * through `levelWithinRange` when the program has a span and the player has
 * a level. An unranked player, or a program with no span, is judged by age
 * alone — never a guess.
 */
export function programFitsPlayer(p: Program, player: FitPlayer): boolean {
  if (!programTakesPlayerAge(p, player)) return false;
  const range = programLevelRange(p);
  if (!range || levelNumber(player.level) === null) return true;
  return levelWithinRange(player.level, range.min, range.max);
}

/** The ranked player a suggested program fits: a first name in a household, null for "you". */
export type ProgramFit = { name: string | null; level: number } | null;

export type SuggestedProgram = { program: Program; fit: ProgramFit };

/** A player as the dashboard holds it, enough to name and place them. */
export type SuggestPlayer = FitPlayer & {
  full_name?: string | null;
  relationship?: string | null;
};

function firstName(player: SuggestPlayer): string | null {
  const name = player.full_name?.trim().split(/\s+/)[0];
  return name ? name : null;
}

/**
 * "Suggested for you" (audit M31): listed, not coming soon, not enrolled, and
 * a fit for at least one player on the account. `fit` names the first fitting
 * ranked player — the account holder reads as "you" (null), anyone else in a
 * household by first name — so the card can mark "Fits Maya" and place her on
 * the rail. In a household, a ranked player who is not the holder counts only
 * with a first name to show: a nameless one would read as "Fits you" and pin
 * a child's level on the holder. Programs with a ranked fit come first, then
 * catalog order. When nothing fits anyone (no players, or every player
 * outside every program), the list falls back to today's behaviour: every
 * eligible program, no fit.
 */
export function suggestProgramsFor(
  players: readonly SuggestPlayer[],
  catalog: readonly Program[],
  enrolledIds: Iterable<string>
): SuggestedProgram[] {
  const enrolled = new Set(enrolledIds);
  const eligible = catalog.filter((p) => !p.unlisted && !p.comingSoon && !enrolled.has(p.id));
  const household = players.length > 1;

  const fitting: SuggestedProgram[] = [];
  for (const program of eligible) {
    const fits = players.filter((player) => programFitsPlayer(program, player));
    if (fits.length === 0) continue;
    const ranked = fits.find(
      (player) =>
        levelNumber(player.level) !== null &&
        (!household || player.relationship === "self" || firstName(player) !== null)
    );
    const fit: ProgramFit = ranked
      ? {
          name: household && ranked.relationship !== "self" ? firstName(ranked) : null,
          level: levelNumber(ranked.level) as number,
        }
      : null;
    fitting.push({ program, fit });
  }

  if (fitting.length === 0) return eligible.map((program) => ({ program, fit: null }));
  return [...fitting.filter((s) => s.fit), ...fitting.filter((s) => !s.fit)];
}

/**
 * The line under "Suggested for you": what the list was filtered by, and
 * nothing it was not. A household with a ranked fit, a single ranked player,
 * an age-only match, or the unfiltered fallback.
 */
export function suggestionsSubCopy(
  players: readonly SuggestPlayer[],
  suggestions: readonly SuggestedProgram[]
): string {
  const anyFit = suggestions.some((s) => s.fit !== null);
  if (anyFit && players.length > 1) return "Programs that fit the players on your account.";
  if (anyFit) return "Programs built for your level.";
  const byAge =
    players.length > 0 &&
    suggestions.length > 0 &&
    suggestions.every((s) => players.some((player) => programFitsAge(s.program, player.is_minor)));
  if (byAge) return "Programs for your age group.";
  return "Programs you're not enrolled in yet.";
}
