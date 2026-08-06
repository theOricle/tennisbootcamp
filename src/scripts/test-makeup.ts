// Run from project root: npx tsx src/scripts/test-makeup.ts
// Exercises the pure schedule + make-up planning logic (src/lib/makeup.ts)
// against the Appendix B rules. Exits non-zero on any failure.

import {
  generateSessionDates,
  scheduledEndDate,
  planMakeup,
  currentEndDate,
  type ExistingSession,
} from "../lib/makeup";
import type { SessionSlot } from "../types/cohort";

let failures = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ ${name}\n      expected ${e}\n      got      ${a}`);
  }
}

// ─── Session generation ───────────────────────────────────────────────────────

console.log("generateSessionDates");
const slots: SessionSlot[] = [
  { day: "Tue", start: "18:00", end: "19:00" },
  { day: "Thu", start: "18:00", end: "19:00" },
];
// 2026-09-08 is a Tuesday.
const gen = generateSessionDates("2026-09-08", 2, slots);
check(
  "2 weeks × Tue/Thu from a Tuesday start",
  gen.map((s) => `${s.date} ${s.start}`),
  [
    "2026-09-08 18:00",
    "2026-09-10 18:00",
    "2026-09-15 18:00",
    "2026-09-17 18:00",
  ]
);
check("end date is the last session", scheduledEndDate("2026-09-08", 2, slots), "2026-09-17");

// Start mid-week: week window starts Sunday 2026-06-07; Wed lands 06-10.
const wedFri: SessionSlot[] = [
  { day: "Wed", start: "17:00", end: "18:00" },
  { day: "Fri", start: "17:00", end: "18:00" },
];
check(
  "Sunday start rolls forward to first Wed/Fri",
  generateSessionDates("2026-06-07", 1, wedFri).map((s) => s.date),
  ["2026-06-10", "2026-06-12"]
);

// ─── Make-up planning ─────────────────────────────────────────────────────────

console.log("planMakeup");
const base: ExistingSession[] = generateSessionDates("2026-09-08", 2, slots).map(
  (s) => ({ date: s.date, start: s.start, status: "scheduled" })
);

// Cancel week-1 Tuesday → next free Tuesday slot is the week after the final
// week (week-2 Tuesday is occupied).
const plan1 = planMakeup({
  cancelledDate: "2026-09-08",
  cancelledStart: "18:00",
  cancelledEnd: "19:00",
  startDate: "2026-09-08",
  weeks: 2,
  makeupMaxWeeks: 2,
  slots,
  sessions: base,
});
check("make-up lands in the week after the final week", plan1, {
  ok: true,
  date: "2026-09-22",
  end: "19:00",
});

// Second Tuesday cancellation (the week-2 one) queues into the following week.
const withMakeup: ExistingSession[] = [
  ...base.map((s) =>
    s.date === "2026-09-08" ? { ...s, status: "cancelled" } : s
  ),
  { date: "2026-09-22", start: "18:00", status: "scheduled" },
];
const plan2 = planMakeup({
  cancelledDate: "2026-09-15",
  cancelledStart: "18:00",
  cancelledEnd: "19:00",
  startDate: "2026-09-08",
  weeks: 2,
  makeupMaxWeeks: 2,
  slots,
  sessions: withMakeup,
});
check("second cancellation queues behind the first make-up", plan2, {
  ok: true,
  date: "2026-09-29",
  end: "19:00",
});

// A cancelled make-up recurses to the next week (still inside the cap).
const makeupCancelled: ExistingSession[] = withMakeup.map((s) =>
  s.date === "2026-09-22" ? { ...s, status: "cancelled" } : s
);
const plan3 = planMakeup({
  cancelledDate: "2026-09-22",
  cancelledStart: "18:00",
  cancelledEnd: "19:00",
  startDate: "2026-09-08",
  weeks: 2,
  makeupMaxWeeks: 2,
  slots,
  sessions: makeupCancelled,
});
check("re-cancelled make-up moves one week out", plan3, {
  ok: true,
  date: "2026-09-29",
  end: "19:00",
});

// Over the cap: with a 1-week cap, the second Tuesday cancellation would need
// week +2 → converts to credit.
const plan4 = planMakeup({
  cancelledDate: "2026-09-15",
  cancelledStart: "18:00",
  cancelledEnd: "19:00",
  startDate: "2026-09-08",
  weeks: 2,
  makeupMaxWeeks: 1,
  slots,
  sessions: withMakeup,
});
check("past the cap → overCap (credit fallback)", plan4, {
  ok: false,
  overCap: true,
  capDate: "2026-09-24",
});

// ─── Current end date ─────────────────────────────────────────────────────────

console.log("currentEndDate");
check(
  "make-ups extend the cohort's end",
  currentEndDate("2026-09-08", 2, slots, withMakeup),
  "2026-09-22"
);

if (failures > 0) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log("\nAll make-up logic checks passed.");
