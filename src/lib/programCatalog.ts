import type { Program, ProgramGroup, TimetableSlot } from "@/types/program";
import type { Cohort } from "@/types/cohort";
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
 * A group's status chip (joining flow, owner 2026-10-12): how a player gets
 * in. A by-approval group (High Performance) reads "By approval" whatever its
 * dates, since that is the fact a visitor needs first (the Next row still
 * carries a public cohort), unless it is full or invite only. Otherwise the
 * next public cohort's start, then "Full", "Invite only", and "Open to join"
 * for a group taking players. An arranged group (private lessons) shows no
 * chip: the card's Time row already says so.
 */
export function groupStatus(g: ProgramGroup, nextCohort?: Cohort | null): ProgramStatus | null {
  if (g.joining === "approval" && g.status !== "full" && g.status !== "invite-only") {
    return { kind: "approval", label: "By approval" };
  }
  if (nextCohort) {
    return { kind: "next-cohort", label: `Next cohort ${formatStartDate(nextCohort.startDate)}` };
  }
  if (g.status === "full") return { kind: "full", label: "Full" };
  if (g.status === "invite-only") return { kind: "invite-only", label: "Invite only" };
  if (g.status === "arranged") return null;
  return { kind: "open", label: "Open to join" };
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
 * Does a public cohort train in this group? The cohort's program and its
 * first session's day and start must match the group's class. A cohort of
 * a program with no fixed class (private lessons) never matches.
 */
export function cohortMatchesGroup(cohort: Pick<Cohort, "programId" | "sessions">, g: ProgramGroup): boolean {
  if (cohort.programId !== g.programSlug || !g.day || !g.start) return false;
  const session = cohort.sessions[0];
  if (!session) return false;
  return session.day === g.day.slice(0, 3) && twelveHourStart(session.start) === twelveHourStart(g.start);
}

/** The earliest public cohort that trains in this group, if any. */
export function nextCohortForGroup(publicCohorts: readonly Cohort[], g: ProgramGroup): Cohort | undefined {
  return publicCohorts
    .filter((c) => cohortMatchesGroup(c, g))
    .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
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
