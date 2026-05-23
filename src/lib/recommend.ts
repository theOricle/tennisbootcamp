import type { Program } from "@/types/program";
import type { Cohort } from "@/types/cohort";
import { programs as allPrograms } from "@/content/programs";
import { cohortsForProgram } from "@/lib/cohorts";

export type IntakeFormSnapshot = {
  who?: "adult" | "youth";
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
  cohorts: Cohort[];
};

const WEEKEND = new Set(["Sat", "Sun"]);
const WEEKDAY = new Set(["Mon", "Tue", "Wed", "Thu", "Fri"]);

function matchesSlot(cohort: Cohort, slot: string): boolean {
  for (const s of cohort.sessions) {
    const hour = parseInt(s.start.split(":")[0], 10);
    if (slot === "weekday-evening" && WEEKDAY.has(s.day) && hour >= 17) return true;
    if (slot === "weekday-daytime" && WEEKDAY.has(s.day) && hour < 17) return true;
    if (slot === "weekend-morning" && WEEKEND.has(s.day) && hour < 12) return true;
    if (slot === "weekend-afternoon" && WEEKEND.has(s.day) && hour >= 12) return true;
  }
  return false;
}

function rankCohorts(
  cohorts: Cohort[],
  preferredLocationIds: string[],
  availability: string[]
): Cohort[] {
  return [...cohorts]
    .filter((c) => c.status === "open" || c.status === "upcoming")
    .sort((a, b) => {
      // Preferred location floats to top
      const aLoc =
        preferredLocationIds.length === 0 || preferredLocationIds.includes(a.locationId) ? 0 : 1;
      const bLoc =
        preferredLocationIds.length === 0 || preferredLocationIds.includes(b.locationId) ? 0 : 1;
      if (aLoc !== bLoc) return aLoc - bLoc;

      // Availability match next
      const aAvail =
        availability.length === 0 || availability.some((s) => matchesSlot(a, s)) ? 0 : 1;
      const bAvail =
        availability.length === 0 || availability.some((s) => matchesSlot(b, s)) ? 0 : 1;
      if (aAvail !== bAvail) return aAvail - bAvail;

      return a.startDate.localeCompare(b.startDate);
    });
}

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
      return "Small groups that move fast — more reps, live-ball patterns, and corrections every session.";
    if (goals.includes("technique"))
      return "Focused progressions across every stroke with real-time correction and no filler drills.";
    if (goals.includes("consistency"))
      return "Weekly structured progressions that build on each other — you'll feel the difference.";
    return "Adult group lessons capped at 6 — more reps, more feedback, less standing around.";
  }

  return "A strong fit based on your level and goals.";
}

export function recommendPrograms(form: IntakeFormSnapshot): Recommendation[] {
  const {
    who,
    level,
    goals,
    programs: selectedPrograms,
    preferredLocationIds,
    availability,
  } = form;
  const results: Recommendation[] = [];

  for (const program of allPrograms) {
    let score = 0;

    // ── Hard age / who gates ─────────────────────────────────────────────
    if (program.id === "kids-summer-camp") {
      if (who !== "youth") continue;
    }
    if (program.id === "bootcamps") {
      // Youth eligible only if competitive/elite (proxy for 14+)
      if (who === "youth" && level !== "competitive" && level !== "elite") continue;
    }
    if (program.id === "group-lessons") {
      if (who !== "adult") continue;
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
      cohorts: rankCohorts(cohortsForProgram(program.id), preferredLocationIds, availability),
    });
  }

  return results.sort((a, b) => b.score - a.score);
}
