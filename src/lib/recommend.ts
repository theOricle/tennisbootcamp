import type { Program } from "@/types/program";
import { programs as allPrograms } from "@/content/programs";
import type { AgeBand } from "@/lib/ageBand";

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

function buildReason(program: Program, form: IntakeFormSnapshot): string {
  const { who, level, goals } = form;

  if (program.id === "bootcamps") {
    if (level === "elite")
      return "Designed for high-performance players who need structured, benchmarked training blocks.";
    if (level === "competitive")
      return "Built for competitive players — live-ball patterns, match pressure, and real progress tracking every cohort.";
    if (who === "youth")
      return "A serious training block for junior players ready to compete and improve fast.";
    if (goals.includes("competition"))
      return "Matches your competition goals — structured reps, point construction, and real match-play pressure.";
    if (goals.includes("tactics"))
      return "Deep pattern work and point-construction focus, with match-play simulation every week.";
    return "High-intensity group training for athletes who compete or want to.";
  }

  if (program.id === "kids-summer-camp") {
    if (goals.includes("consistency"))
      return "A structured daily environment where kids build real tennis habits through play and daily skill tracking.";
    return "A full-day summer experience with fundamentals, match play, and ability-grouped coaching your kid will want to come back to.";
  }

  if (program.id === "group-lessons") {
    if (level === "new")
      return "The best place to start — structured progressions with real-time feedback in a small group capped at 6.";
    if (level === "rally")
      return "Small groups that move fast — more reps, realistic rally play, and corrections every session.";
    if (goals.includes("technique"))
      return "Focused progressions across every stroke with real-time correction and no filler drills.";
    if (goals.includes("consistency"))
      return "Structured progressions that build on each other, week over week.";
    return "Adult group lessons capped at 6 — more reps, more feedback, less standing around.";
  }

  return "A strong fit based on your level and goals.";
}

export function recommendPrograms(form: IntakeFormSnapshot): Recommendation[] {
  const { who, ageBand, level, goals, programs: selectedPrograms } = form;
  const results: Recommendation[] = [];

  for (const program of allPrograms) {
    let score = 0;

    // ── Hard age gates ────────────────────────────────────────────────────
    // Each program states its own ages: camp is 7–13, bootcamps 14+, group
    // lessons 18+. With an age band we gate on those directly; without one we
    // fall back to the legacy adult/youth split, unchanged.
    if (program.id === "kids-summer-camp") {
      if (ageBand ? ageBand !== "junior" : who !== "youth") continue;
    }
    if (program.id === "bootcamps") {
      if (ageBand === "junior") continue;
      // No band: youth eligible only if competitive/elite (proxy for 14+)
      if (!ageBand && who === "youth" && level !== "competitive" && level !== "elite")
        continue;
    }
    if (program.id === "group-lessons") {
      if (ageBand ? ageBand !== "adult" : who !== "adult") continue;
    }

    // ── Base score (passed gate) ──────────────────────────────────────────
    score = 50;

    // ── Level boosts ──────────────────────────────────────────────────────
    if (program.id === "bootcamps") {
      if (level === "elite") score += 25;
      else if (level === "competitive") score += 15;
      else if (level === "new") score -= 10;
    }
    if (program.id === "group-lessons") {
      if (level === "new") score += 20;
      else if (level === "rally") score += 15;
      else if (level === "elite") score -= 5;
    }
    if (program.id === "kids-summer-camp") {
      if (level === "new" || level === "rally") score += 20;
      else if (level === "competitive" || level === "elite") score -= 10;
    }

    // ── Goal boosts ───────────────────────────────────────────────────────
    if (program.id === "bootcamps") {
      if (goals.includes("competition")) score += 10;
      if (goals.includes("tactics")) score += 8;
      if (goals.includes("match")) score += 8;
    }
    if (program.id === "group-lessons") {
      if (goals.includes("technique")) score += 10;
      if (goals.includes("consistency")) score += 10;
    }
    if (program.id === "kids-summer-camp") {
      if (goals.includes("consistency")) score += 10;
    }

    // ── Explicit program selection boost ──────────────────────────────────
    if (program.id === "bootcamps" && selectedPrograms.includes("bootcamp")) score += 15;
    if (program.id === "group-lessons" && selectedPrograms.includes("group")) score += 15;
    if (program.id === "kids-summer-camp" && selectedPrograms.includes("camp")) score += 15;
    // "Not sure" gives a small undifferentiated boost to all eligible programs
    if (selectedPrograms.includes("not-sure")) score += 5;

    results.push({
      program,
      score,
      reason: buildReason(program, form),
    });
  }

  return results.sort((a, b) => b.score - a.score);
}
