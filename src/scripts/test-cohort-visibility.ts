// Run from project root: npx tsx src/scripts/test-cohort-visibility.ts
//
// Pins the production-cleanup rule (backlog #1): a visitor only ever sees a
// cohort that lives in Supabase, is inviting or confirmed, and has not
// started. Draft, cancelled, running, completed and past cohorts never render.
import { isCohortPublic, isCohortRenderable, todayIso } from "../lib/cohortVisibility";
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
check("started yesterday → never", isCohortRenderable(cohort({ startDate: "2026-09-07" }), TODAY), false);
for (const s of ["draft", "cancelled", "running", "completed"] as CohortDbStatus[]) {
  check(`${s} → never`, isCohortRenderable(cohort({ dbStatus: s }), TODAY), false);
}
check(
  "no dbStatus (not from Supabase) → never",
  isCohortRenderable(cohort({ dbStatus: undefined }), TODAY),
  false
);
check("private confirmed → renderable (invite/tier path)", isCohortRenderable(cohort({ visibility: "private" }), TODAY), true);

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
