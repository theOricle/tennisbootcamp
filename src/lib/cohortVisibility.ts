import type { Cohort } from "@/types/cohort";

// What a visitor may see (backlog #1, production cleanup). Client-safe and
// pure so pages, server modules and scripts share one rule:
//
//   renderable → lives in Supabase (dbStatus set), is inviting or confirmed
//                (never draft or cancelled — nor running/completed, which have
//                started), and has not started yet.
//   public     → renderable and listed publicly (program pages, homepage grid).
//
// Dates are compared as ISO "YYYY-MM-DD" strings in Toronto local time.

const RENDERABLE_DB_STATUS = new Set<NonNullable<Cohort["dbStatus"]>>([
  "inviting",
  "confirmed",
]);

/** Today's date in Toronto as "YYYY-MM-DD". */
export function todayIso(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
}

/** A cohort a visitor or player may see or enroll in. */
export function isCohortRenderable(c: Cohort, today: string = todayIso()): boolean {
  if (!c.dbStatus || !RENDERABLE_DB_STATUS.has(c.dbStatus)) return false;
  if (!c.startDate || c.startDate < today) return false;
  return true;
}

/** A renderable cohort that is listed publicly. */
export function isCohortPublic(c: Cohort, today: string = todayIso()): boolean {
  return isCohortRenderable(c, today) && (c.visibility ?? "public") === "public";
}
