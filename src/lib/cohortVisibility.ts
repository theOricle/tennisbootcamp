import type { Cohort } from "@/types/cohort";
import { generateSessionDates } from "@/lib/makeup";

// What a visitor may see (backlog #1, production cleanup). Client-safe and
// pure so pages, server modules and scripts share one rule:
//
//   renderable → lives in Supabase (dbStatus set), is inviting or confirmed
//                (never draft or cancelled — nor running/completed, which have
//                started), and has not started yet.
//   public     → renderable and listed publicly (program pages, homepage grid).
//
// "Started" is the block's first class, never the start date the coach typed
// (backlog #85, safety review): a block typed to start on a Monday whose
// class is on Saturdays stays until that Saturday's class begins. Dates and
// times are compared as ISO strings in Toronto local time.

const RENDERABLE_DB_STATUS = new Set<NonNullable<Cohort["dbStatus"]>>([
  "inviting",
  "confirmed",
]);

/** Today's date in Toronto as "YYYY-MM-DD". */
export function todayIso(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
}

/** The date and time in Toronto as "YYYY-MM-DDTHH:MM", on the 24-hour clock. */
export function torontoNow(now: Date = new Date()): string {
  const time = now.toLocaleTimeString("en-GB", {
    timeZone: "America/Toronto",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  return `${todayIso(now)}T${time}`;
}

/**
 * When a block's first class begins: its date, and its start time as
 * "HH:MM". The first class is the earliest its weekly classes bring from the
 * start date the coach typed (the same dates the group cards show). A block
 * with no class to date falls back to its start date, with no time.
 */
export function firstClassStart(
  c: Pick<Cohort, "startDate" | "weeks" | "sessions">
): { date: string; start: string | null } {
  const [first] = generateSessionDates(c.startDate, Math.max(1, c.weeks || 0), c.sessions ?? []);
  return first ? { date: first.date, start: first.start.slice(0, 5) } : { date: c.startDate, start: null };
}

/**
 * A cohort a visitor or player may see or enroll in: until its first class
 * has started. `when` is the moment in Toronto, "YYYY-MM-DDTHH:MM"
 * (torontoNow); a bare date, "YYYY-MM-DD", is read by the day, and the block
 * then stays through the day of its first class.
 */
export function isCohortRenderable(c: Cohort, when: string = torontoNow()): boolean {
  if (!c.dbStatus || !RENDERABLE_DB_STATUS.has(c.dbStatus)) return false;
  if (!c.startDate) return false;
  const first = firstClassStart(c);
  const day = when.slice(0, 10);
  if (first.date !== day) return first.date > day;
  const time = when.length > 10 ? when.slice(11, 16) : null;
  return time === null || first.start === null || first.start > time;
}

/** A renderable cohort that is listed publicly. */
export function isCohortPublic(c: Cohort, when: string = torontoNow()): boolean {
  return isCohortRenderable(c, when) && (c.visibility ?? "public") === "public";
}
