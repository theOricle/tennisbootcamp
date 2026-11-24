// Run from project root: npx tsx src/scripts/test-cohort-visibility.ts
//
// Pins the production-cleanup rule (backlog #1): a visitor only ever sees a
// cohort that lives in Supabase, is inviting or confirmed, and has not
// started. Draft, cancelled, running, completed and past cohorts never render.
// "Started" is its first class, in Toronto time (backlog #85, safety review):
// a block whose typed start date is a Monday and whose first class is that
// Saturday stays on the cards all week, until that class begins.
import { firstClassStart, isCohortPublic, isCohortRenderable, todayIso, torontoNow } from "../lib/cohortVisibility";
import { decideEnrollGate } from "../lib/enrollGate";
import type { Cohort, CohortDbStatus } from "../types/cohort";

const TODAY = "2026-09-08";

function cohort(overrides: Partial<Cohort>): Cohort {
  return {
    id: "c",
    programId: "bootcamps",
    locationId: "",
    label: "Test",
    startDate: "2026-10-01",
    endDate: "2026-11-12",
    weeks: 6,
    sessions: [{ day: "Wed", start: "17:00", end: "18:00" }],
    capacityMin: 6,
    capacityMax: 8,
    priceCents: 64900,
    currency: "CAD",
    status: "open",
    visibility: "public",
    dbStatus: "confirmed",
    ...overrides,
  };
}

let failed = 0;
function check(name: string, actual: boolean, expected: boolean) {
  if (actual === expected) {
    console.log(`  ✓ ${name}`);
  } else {
    console.log(`  ✗ ${name} — expected ${expected}, got ${actual}`);
    failed++;
  }
}

console.log("isCohortRenderable");
check("confirmed, future start → renderable", isCohortRenderable(cohort({}), TODAY), true);
check("inviting, future start → renderable", isCohortRenderable(cohort({ dbStatus: "inviting" }), TODAY), true);
check("starts today → renderable", isCohortRenderable(cohort({ startDate: TODAY }), TODAY), true);
check("first class yesterday → never", isCohortRenderable(cohort({ startDate: "2026-09-07", sessions: [{ day: "Mon", start: "17:00", end: "18:00" }] }), TODAY), false);
for (const s of ["draft", "cancelled", "running", "completed"] as CohortDbStatus[]) {
  check(`${s} → never`, isCohortRenderable(cohort({ dbStatus: s }), TODAY), false);
}
check(
  "no dbStatus (not from Supabase) → never",
  isCohortRenderable(cohort({ dbStatus: undefined }), TODAY),
  false
);
check("private confirmed → renderable (invite/tier path)", isCohortRenderable(cohort({ visibility: "private" }), TODAY), true);

console.log("a block stays until its first class has started, in Toronto time");
{
  // The coach typed Monday Jan 11; the class is on Saturdays at 3pm, so the
  // first class is Saturday Jan 16.
  const typedMonday = cohort({ startDate: "2027-01-11", sessions: [{ day: "Sat", start: "15:00", end: "16:00" }] });
  const first = firstClassStart(typedMonday);
  check("the first class is the Saturday after the typed Monday, at its own time", first.date === "2027-01-16" && first.start === "15:00", true);
  check("the day after its typed start date, it still shows", isCohortRenderable(typedMonday, "2027-01-12") && isCohortPublic(typedMonday, "2027-01-12"), true);
  check("…and on every day up to its first class", ["2027-01-13", "2027-01-14", "2027-01-15", "2027-01-16"].every((d) => isCohortRenderable(typedMonday, d)), true);
  check("on the day of its first class, it shows until the class begins", isCohortRenderable(typedMonday, "2027-01-16T09:00") && isCohortRenderable(typedMonday, "2027-01-16T14:59"), true);
  check("once the first class has started, never", isCohortRenderable(typedMonday, "2027-01-16T15:00") || isCohortRenderable(typedMonday, "2027-01-16T15:30"), false);
  check("the day after its first class, never", isCohortRenderable(typedMonday, "2027-01-17") || isCohortRenderable(typedMonday, "2027-01-17T08:00"), false);
  const twice = cohort({ startDate: "2027-01-11", sessions: [{ day: "Sat", start: "15:00", end: "16:00" }, { day: "Wed", start: "18:00", end: "19:00" }] });
  check("twice a week: the first class is the earlier of the two", firstClassStart(twice).date === "2027-01-13" && isCohortRenderable(twice, "2027-01-13T17:59") && !isCohortRenderable(twice, "2027-01-13T18:00"), true);
  check("times stored with seconds read the same", !isCohortRenderable(cohort({ startDate: "2027-01-16", sessions: [{ day: "Sat", start: "15:00:00", end: "16:00:00" }] }), "2027-01-16T15:00"), true);
  const noClass = cohort({ startDate: "2027-01-11", sessions: [] });
  check("a block with no class falls back to its start date, by the day", isCohortRenderable(noClass, "2027-01-11T23:00") && !isCohortRenderable(noClass, "2027-01-12"), true);
  check("the clock is Toronto's: 19:30 UTC on Jan 16 is 2:30pm there, half an hour before the class", torontoNow(new Date("2027-01-16T19:30:00Z")) === "2027-01-16T14:30" && isCohortRenderable(typedMonday, torontoNow(new Date("2027-01-16T19:30:00Z"))) && !isCohortRenderable(typedMonday, torontoNow(new Date("2027-01-16T20:00:00Z"))), true);
  check("…and midnight reads 00:00, never 24:00", torontoNow(new Date("2027-01-16T05:00:00Z")) === "2027-01-16T00:00", true);
  // The sign-up page and both payment routes read the same rule through the gate.
  const gate = (today?: string) => decideEnrollGate({ cohort: typedMonday, tokenSent: false, lookup: null, today });
  check("the sign-up page and payment follow: open the day after the typed start, closed once the first class has started", gate("2027-01-12").allowed && gate("2027-01-16T14:59").allowed && !gate("2027-01-16T15:00").allowed, true);
}

console.log("isCohortPublic");
check("public confirmed future → public", isCohortPublic(cohort({}), TODAY), true);
check("private confirmed future → not public", isCohortPublic(cohort({ visibility: "private" }), TODAY), false);
check("public draft → not public", isCohortPublic(cohort({ dbStatus: "draft" }), TODAY), false);
check("public past → not public", isCohortPublic(cohort({ startDate: "2026-06-07" }), TODAY), false);

console.log("todayIso");
check(
  "formats as YYYY-MM-DD in Toronto",
  /^\d{4}-\d{2}-\d{2}$/.test(todayIso(new Date("2026-09-08T03:30:00Z"))),
  true
);
check(
  "03:30 UTC on Sep 8 is still Sep 7 in Toronto",
  todayIso(new Date("2026-09-08T03:30:00Z")) === "2026-09-07",
  true
);

if (failed > 0) {
  console.log(`\n${failed} cohort visibility check(s) FAILED.`);
  process.exit(1);
}
console.log("\nAll cohort visibility checks passed.");
