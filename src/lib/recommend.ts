import type { Program, TimetableSlot } from "@/types/program";
import { COHORT_LENGTH, programs as allPrograms } from "@/content/programs";
import { AGE_BAND_LABELS, type AgeBand } from "@/lib/ageBand";

// Deterministic, client-side program match for the intake quiz. It ranks
// programs only — cohorts live in Supabase and are rendered by the program
// pages, so the tentative-match screen links to the program, never to a
// cohort it cannot verify.

export type IntakeFormSnapshot = {
  who?: "adult" | "youth";
  /**
   * The player's age band, asked per person since backlog #14. Optional: a
   * caller that only knows the legacy adult/youth split (an older payload,
   * the recommendation email) still gets exactly the pre-#14 gating.
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
  score: number;
  reason: string;
};

// Weekend catalog (backlog #20):
//   junior or teen                   → Youth Programs
//   competitive or elite, any age    → High Performance
//   adult                            → Adult Bootcamps (id "bootcamps")
// The coming-soon camp and retired programs are never recommended.

function isYouth(form: IntakeFormSnapshot): boolean {
  return form.ageBand ? form.ageBand !== "adult" : form.who === "youth";
}

function isCompetitive(form: IntakeFormSnapshot): boolean {
  return form.level === "competitive" || form.level === "elite";
}

/** "12:00–1:00 pm" → "12:00" — the class start as the timetable states it. */
function startOf(slot: TimetableSlot): string {
  return slot.time.split("–")[0];
}

/** Times and group labels come from src/content/programs.ts, never from here. */
function classLine(slot: TimetableSlot | undefined): string | null {
  return slot ? `${slot.group} class, ${slot.day} at ${startOf(slot)}` : null;
}

function buildReason(program: Program, form: IntakeFormSnapshot): string {
  const { level, goals } = form;
  const timetable = program.timetable ?? [];

  if (program.id === "high-performance") {
    const slot = timetable[0];
    const when = slot ? `, every ${slot.day} at ${startOf(slot)}` : "";
    if (level === "elite")
      return `The competitive track — pattern play, serve plus the next shot, and match play with the score on${when}.`;
    return `Built for players who compete — pattern play and match play with the score on${when}.`;
  }

  if (program.id === "youth-programs") {
    const band = form.ageBand === "junior" || form.ageBand === "teen" ? form.ageBand : null;
    const line = band
      ? classLine(timetable.find((s) => s.group === AGE_BAND_LABELS[band]))
      : null;
    if (line && band === "junior")
      return `${line}, grouped by level — fundamentals, movement, and rally play every week.`;
    if (line)
      return `${line}, grouped by level — fundamentals built into rally and point play every week.`;
    return "Weekend classes for juniors and teens, grouped by age and level.";
  }

  if (program.id === "bootcamps") {
    // Timetable order is newer → intermediate → advanced.
    const newer = classLine(timetable[0]);
    const day = timetable[0]?.day ?? "Weekend";
    if (level === "new" && newer)
      return `${newer} — one part of the game each week, with corrections every session.`;
    if (level === "rally")
      return `${day} classes grouped by level — groundstrokes, serve and return, and net play built into rally and point play.`;
    if (goals.includes("technique"))
      return "One part of the game each week, with corrections from the coach every session.";
    return `${day} group classes for adults, grouped by level, ${COHORT_LENGTH} that build on each other.`;
  }

  return "A strong fit based on your level and goals.";
}

export function recommendPrograms(form: IntakeFormSnapshot): Recommendation[] {
  const { programs: selectedPrograms } = form;
  const youth = isYouth(form);
  const competitive = isCompetitive(form);
  const results: Recommendation[] = [];

  for (const program of allPrograms) {
    // Never: coming-soon and retired programs.
    if (program.comingSoon || program.unlisted) continue;

    let score: number;
    if (program.id === "high-performance") {
      if (!competitive) continue;
      // Competitive or elite at any age ranks High Performance first.
      score = form.level === "elite" ? 80 : 70;
    } else if (program.id === "youth-programs") {
      if (!youth) continue;
      score = 60;
    } else if (program.id === "bootcamps") {
      if (youth) continue;
      // Without a band or a "who", the player is read as an adult.
      score = 60;
    } else {
      continue;
    }

    // ── Explicit program selection (?program=) ────────────────────────────
    if (program.id === "high-performance" && selectedPrograms.includes("high-performance"))
      score += 5;
    if (program.id === "youth-programs" && selectedPrograms.includes("youth")) score += 5;
    if (program.id === "bootcamps" && selectedPrograms.includes("bootcamp")) score += 5;

    results.push({
      program,
      score,
      reason: buildReason(program, form),
    });
  }

  return results.sort((a, b) => b.score - a.score);
}
