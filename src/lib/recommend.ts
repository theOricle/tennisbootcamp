import type { Program, ProgramGroup } from "@/types/program";
import {
  COHORT_LENGTH,
  groupsForProgram,
  programs as allPrograms,
} from "@/content/programs";
import { AGE_BAND_QUERIES, groupTakesAge, groupTakesTier } from "@/lib/programFilters";
import { formatGroupWhen, twelveHourStart } from "@/lib/programCatalog";
import { provisionalTierFor } from "@/lib/level";
import type { AgeBand } from "@/lib/ageBand";

// Deterministic, client-side program match for the intake quiz. It ranks
// programs and names the groups inside them that fit the player's age band
// and provisional tier — cohorts live in Supabase and are rendered by the
// program pages, so the tentative-match screen links to the program (and the
// one group when exactly one fits), never to a cohort it cannot verify.

export type IntakeFormSnapshot = {
  who?: "adult" | "youth";
  /**
   * The player's age band, asked per person since backlog #14. Optional: a
   * caller that only knows the legacy adult/youth split (an older payload,
   * the recommendation email) still gets the pre-#14 gating.
   */
  ageBand?: AgeBand;
  level?: "new" | "rally" | "competitive" | "elite";
  goals: string[];
  programs: string[];
  preferredLocationIds: string[];
  availability: string[];
};

export type Recommendation = {
  program: Program;
  /**
   * The program's groups that fit the player, in lineup order (the
   * competitive track first for a competitive or tournament player). Never
   * empty for a program with groups: when the band and tier rule out every
   * group, every group stays, and our coaches decide.
   */
  groups: ProgramGroup[];
  score: number;
  reason: string;
};

// Catalog (owner, 2026-10-12):
//   junior or teen   → Youth Bootcamps (id "youth-programs"); a competitive or
//                      tournament player's first group is High Performance
//   adult            → Adult Bootcamps (id "bootcamps"), the group by level
//   "private" chosen → Private Lessons first, then the group program: every
//                      surface (the result screen, the household screen, the
//                      email, Sheet column 20) reads recommendations[0] alone,
//                      so a visitor who asked about private lessons sees them
// Retired programs are never recommended.

function isYouth(form: IntakeFormSnapshot): boolean {
  return form.ageBand ? form.ageBand !== "adult" : form.who === "youth";
}

function isCompetitive(form: IntakeFormSnapshot): boolean {
  return form.level === "competitive" || form.level === "elite";
}

/**
 * The groups of a program that fit the player: the age band's range
 * overlaps the group's ages, and the provisional tier (when the quiz could
 * name one) sits inside the group's level band. Falls back to every group
 * when nothing fits, so the card never goes blank.
 */
export function groupsFor(program: Program, form: IntakeFormSnapshot): ProgramGroup[] {
  const groups = groupsForProgram(program.slug);
  const age = form.ageBand ? AGE_BAND_QUERIES[form.ageBand] : null;
  const tier = provisionalTierFor(form.level);
  const fitting = groups.filter(
    (g) => (!age || groupTakesAge(g, age)) && (!tier || groupTakesTier(g, tier))
  );
  const list = fitting.length > 0 ? fitting : groups;
  if (isCompetitive(form)) {
    const hp = list.find((g) => g.id === "high-performance");
    if (hp) return [hp, ...list.filter((g) => g !== hp)];
  }
  return list;
}

/** "Ages 7–10 group, Saturday at 12:00". Times and names come from src/content/programs.ts. */
function groupLine(g: ProgramGroup): string {
  return g.day && g.start ? `${g.name} group, ${g.day} at ${twelveHourStart(g.start)}` : g.name;
}

function buildReason(program: Program, groups: ProgramGroup[], form: IntakeFormSnapshot): string {
  const { level, goals } = form;
  const first = groups[0];

  if (program.id === "youth-programs") {
    if (first?.id === "high-performance" && isCompetitive(form)) {
      const when = first.day && first.start ? `, every ${first.day} at ${twelveHourStart(first.start)}` : "";
      return level === "elite"
        ? `The competitive track — pattern play, serve plus the next shot, and match play with the score on${when}.`
        : `Built for players who compete — pattern play and match play with the score on${when}.`;
    }
    if (groups.length === 1 && first) {
      return `${groupLine(first)}, grouped by level — fundamentals built into rally and point play every week.`;
    }
    return "Saturday classes grouped by age and level — fundamentals built into rally and point play every week.";
  }

  if (program.id === "bootcamps") {
    const day = first?.day ?? "Weekend";
    if (level === "new" && first)
      return `${groupLine(first)} — one part of the game each week, with corrections every session.`;
    if (level === "rally")
      return `${day} classes grouped by level — groundstrokes, serve and return, and net play built into rally and point play.`;
    if (goals.includes("technique"))
      return "One part of the game each week, with corrections from the coach every session.";
    return `${day} group classes for adults, grouped by level, ${COHORT_LENGTH} that build on each other.`;
  }

  if (program.id === "private-lessons") {
    return "One player, one coach, at a time arranged with you — built around the parts of your game you want to work on.";
  }

  return "A strong fit based on your level and goals.";
}

export function recommendPrograms(form: IntakeFormSnapshot): Recommendation[] {
  const { programs: selectedPrograms } = form;
  const youth = isYouth(form);
  const results: Recommendation[] = [];

  for (const program of allPrograms) {
    // Never: coming-soon and retired programs.
    if (program.comingSoon || program.unlisted) continue;

    let score: number;
    if (program.id === "youth-programs") {
      if (!youth) continue;
      score = 60;
    } else if (program.id === "bootcamps") {
      if (youth) continue;
      // Without a band or a "who", the player is read as an adult.
      score = 60;
    } else if (program.id === "private-lessons") {
      // Only when asked for: a one-to-one lesson is never the default pitch.
      // Asked for, it outranks the group program (70 against its 60, or 65
      // when that program was chosen too), so the one match every surface
      // shows is the program the visitor clicked through from.
      if (!selectedPrograms.includes("private")) continue;
      score = 70;
    } else {
      continue;
    }

    // ── Explicit program selection (?program=) ────────────────────────────
    if (program.id === "youth-programs" && (selectedPrograms.includes("youth") || selectedPrograms.includes("high-performance")))
      score += 5;
    if (program.id === "bootcamps" && selectedPrograms.includes("bootcamp")) score += 5;

    const groups = groupsFor(program, form);
    results.push({
      program,
      groups,
      score,
      reason: buildReason(program, groups, form),
    });
  }

  return results.sort((a, b) => b.score - a.score);
}

/**
 * Where a match card sends the player: the program page, or the one fitting
 * group's card on it ("/programs/youth-programs#high-performance"). A group
 * with no fixed class (private lessons) has no card on its page, so its link
 * carries no anchor.
 */
export function recommendationHref(rec: Pick<Recommendation, "program" | "groups">): string {
  const page = `/programs/${rec.program.slug}`;
  const [only] = rec.groups;
  return rec.groups.length === 1 && only.day ? `${page}#${only.id}` : page;
}

/** "Saturdays 2:00–3:00 pm · Ages 12–17": one line per fitting group, for the quiz result. */
export function groupSummaryLine(g: ProgramGroup): string {
  const ages = g.ageMin === null && g.ageMax === null ? "Any age" : g.ageMax === null ? `Ages ${g.ageMin} and up` : `Ages ${g.ageMin}–${g.ageMax}`;
  return `${formatGroupWhen(g)} · ${ages}`;
}
