import type { Program, TimetableSlot } from "@/types/program";
import type { Cohort } from "@/types/cohort";
import { audienceLabel, isAgeBand } from "@/lib/ageBand";
import { formatStartDate } from "@/lib/cohorts";
import { levelNumber, levelWithinRange } from "@/lib/tiers";

// The program catalog's decision data (audit H7, M31; design specs §5.2):
// what a card says about a program's status, who it is for and when it runs,
// and whether a player on an account fits it. Pure and server-safe — no React,
// no database — so the dashboard, the cards and the tests read one rule.

export type LevelRange = { min: number; max: number };

export type ProgramStatusKind = "coming-soon" | "next-cohort" | "invite-only" | "forming";

export type ProgramStatus = { kind: ProgramStatusKind; label: string };

/**
 * This season's status chip. Precedence: coming soon, then the next public
 * cohort's start, then "Invite only", else "Groups forming" (owner D11).
 */
export function programStatus(p: Program, nextCohort?: Cohort | null): ProgramStatus {
  if (p.comingSoon) return { kind: "coming-soon", label: "Coming Soon" };
  if (nextCohort) {
    return { kind: "next-cohort", label: `Next cohort ${formatStartDate(nextCohort.startDate)}` };
  }
  if (p.enrollmentStatus === "invite-only") return { kind: "invite-only", label: "Invite only" };
  return { kind: "forming", label: "Groups forming" };
}

/** The class days a timetable runs on, in timetable order: ["Saturday"] or ["Sunday"]. */
function timetableDays(p: Program): string[] {
  return [...new Set((p.timetable ?? []).map((slot) => slot.day))];
}

/**
 * The line above a card's title, so it never repeats the title: "Juniors and
 * teens · Saturdays", "Adults · Sundays", "Any age · Saturdays", "Juniors ·
 * Summer Camp". A program with no timetable shows its type instead of days.
 */
export function programEyebrow(p: Program): string {
  const audience = audienceLabel(p.ageBands);
  const days = timetableDays(p);
  const when = days.length > 0 ? days.map((day) => `${day}s`).join(" and ") : p.type;
  return [audience, when].filter(Boolean).join(" · ");
}

/** "Sat 12:00–1:00 pm": the day abbreviated, the time as the timetable states it. */
export function formatSlotWhen(slot: TimetableSlot): string {
  return `${slot.day.slice(0, 3)} ${slot.time}`;
}

/** A class's level band, or null when the slot is not banded (owner D3). */
export function slotLevelRange(slot: TimetableSlot): LevelRange | null {
  if (slot.levelMin === undefined || slot.levelMax === undefined) return null;
  return { min: slot.levelMin, max: slot.levelMax };
}

/** The program's tier span, or null when unset (owner D2): unset renders nothing. */
export function programLevelRange(p: Program): LevelRange | null {
  if (p.levelMin === undefined || p.levelMax === undefined) return null;
  return { min: p.levelMin, max: p.levelMax };
}

/** What a card needs to know about one player on an account. */
export type FitPlayer = {
  is_minor: boolean;
  /**
   * The age band the player last answered (migration 0009, audit M31). When
   * known it decides the age fit exactly (a teen is not a Kids' Camp
   * junior); null or absent falls back to `is_minor`.
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
