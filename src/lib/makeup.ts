// Cohort schedule + make-up planning — pure, deterministic, unit-testable.
//
// Encodes the Appendix B rules from ops/plans/assessment-restructure.md:
// sessions cancelled by the business become make-up sessions at the same
// weekday and time, appended in the week(s) after the cohort's final scheduled
// week, queued in the order they were missed and recursive if a make-up is
// itself cancelled. Make-ups extend a cohort by at most `makeupMaxWeeks`
// (cohorts.makeup_max_weeks, default 2); past the cap the session converts to
// a credit instead (the caller flags the cohort for follow-up).
//
// Everything here works on ISO date strings ("2026-06-07") and "HH:MM" times in
// UTC date math — no timezones, no Date.now(), no database.

import type { SessionSlot } from "@/types/cohort";

export type PlannedSession = {
  date: string; // ISO
  day: SessionSlot["day"];
  start: string; // "17:00"
  end: string;   // "18:00"
};

const DAY_INDEX: Record<SessionSlot["day"], number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const DAY_NAMES: SessionSlot["day"][] = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
];

export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dayOfWeek(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function dayNameForDate(iso: string): SessionSlot["day"] {
  return DAY_NAMES[dayOfWeek(iso)];
}

/** "17:00:00" | "17:00" → "17:00" (Postgres time columns come back with seconds). */
export function normTime(t: string): string {
  return t.slice(0, 5);
}

/**
 * Concrete session dates for a cohort: `weeks` seven-day windows starting at
 * `startDate`; each weekly slot lands on the first occurrence of its weekday
 * on/after the window start. Sorted by date then start time.
 */
export function generateSessionDates(
  startDate: string,
  weeks: number,
  slots: SessionSlot[]
): PlannedSession[] {
  const out: PlannedSession[] = [];
  for (let w = 0; w < weeks; w++) {
    const windowStart = addDaysISO(startDate, w * 7);
    for (const slot of slots) {
      const offset = (DAY_INDEX[slot.day] - dayOfWeek(windowStart) + 7) % 7;
      out.push({
        date: addDaysISO(windowStart, offset),
        day: slot.day,
        start: normTime(slot.start),
        end: normTime(slot.end),
      });
    }
  }
  return out.sort(
    (a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start)
  );
}

/** The last originally-scheduled session date (make-ups append after this). */
export function scheduledEndDate(
  startDate: string,
  weeks: number,
  slots: SessionSlot[]
): string {
  const sessions = generateSessionDates(startDate, weeks, slots);
  return sessions.length ? sessions[sessions.length - 1].date : startDate;
}

export type ExistingSession = {
  date: string;   // ISO
  start: string;  // "17:00" (or "17:00:00" — normalized here)
  status: string; // scheduled | completed | cancelled
};

export type MakeupPlan =
  | { ok: true; date: string; end: string }
  | { ok: false; overCap: true; capDate: string };

/**
 * Plan the make-up for a cancelled session: same weekday and time, in the first
 * week after the cancelled date that doesn't already hold a live session at
 * that weekday+time. Because existing make-ups occupy their slots, multiple
 * cancellations queue up week by week in the order they were missed, and a
 * cancelled make-up recurses to the next week naturally.
 *
 * Over the cap (`scheduledEndDate + makeupMaxWeeks × 7`) there is no make-up —
 * the session converts to credit and the caller flags the cohort.
 */
export function planMakeup(params: {
  cancelledDate: string;
  cancelledStart: string;
  cancelledEnd: string;
  startDate: string;
  weeks: number;
  makeupMaxWeeks: number;
  slots: SessionSlot[];
  /** Every session row of the cohort, including make-ups and cancellations. */
  sessions: ExistingSession[];
}): MakeupPlan {
  const start = normTime(params.cancelledStart);
  const occupied = new Set(
    params.sessions
      .filter((s) => s.status !== "cancelled")
      .map((s) => `${s.date}|${normTime(s.start)}`)
  );

  const capDate = addDaysISO(
    scheduledEndDate(params.startDate, params.weeks, params.slots),
    params.makeupMaxWeeks * 7
  );

  let candidate = addDaysISO(params.cancelledDate, 7);
  while (occupied.has(`${candidate}|${start}`)) {
    candidate = addDaysISO(candidate, 7);
  }

  if (candidate > capDate) {
    return { ok: false, overCap: true, capDate };
  }
  return { ok: true, date: candidate, end: normTime(params.cancelledEnd) };
}

/**
 * The cohort's current final session date once make-ups are in play: the latest
 * non-cancelled session row, falling back to the original schedule.
 */
export function currentEndDate(
  startDate: string,
  weeks: number,
  slots: SessionSlot[],
  sessions: ExistingSession[]
): string {
  const live = sessions.filter((s) => s.status !== "cancelled");
  const latest = live.reduce(
    (max, s) => (s.date > max ? s.date : max),
    ""
  );
  return latest || scheduledEndDate(startDate, weeks, slots);
}
