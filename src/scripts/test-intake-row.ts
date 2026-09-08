// Run from project root: npx tsx src/scripts/test-intake-row.ts
// Pins the /api/intake Google Sheet row shape (src/lib/intakeRow.ts):
// 17 columns, headers in the frozen order, and cell values for a wizard
// submission. Exits non-zero on any failure. If this test has to change,
// the column contract changed — that needs an explicit owner decision.

import {
  INTAKE_HEADERS,
  INTAKE_APPEND_RANGE_COLUMNS,
  buildIntakeRow,
  intakeAvailabilitySlots,
} from "../lib/intakeRow";

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

// ─── Header contract ──────────────────────────────────────────────────────────

console.log("headers");
check("17 columns", INTAKE_HEADERS.length, 17);
check("frozen order (1–14) + additive (15–17)", [...INTAKE_HEADERS], [
  "timestamp", "name", "email", "phone", "who", "level",
  "goals", "programs", "area", "notes", "newsletter",
  "priority_score", "lead_type", "follow_up_status",
  "preferred_locations", "availability", "recommended_program",
]);
check("append range covers A–Q", INTAKE_APPEND_RANGE_COLUMNS, "A:Q");

// ─── Wizard submission (what src/app/intake/page.tsx sends today) ─────────────

console.log("wizard row");
const TS = "2026-09-08T14:00:00.000Z";
const wizard = {
  who: "adult",
  level: "rally",
  goals: [],
  programs: [],
  preferredLocationIds: ["balliol", "king"],
  availability: { days: { mon: ["eve"], wed: ["mor", "eve"], sat: ["aft"] }, v: 1 },
  notes: "",
  name: "Jordan Lee",
  phone: "(647) 555-1234",
  email: "jordan@example.com",
  newsletter: true,
  area: "balliol, king",
  recommendedProgram: "bootcamps",
};
const row = buildIntakeRow(wizard, TS);
check("row has 17 cells", row.length, 17);
check("row matches the frozen contract cell for cell", row, [
  TS,
  "Jordan Lee",
  "jordan@example.com",
  "(647) 555-1234",
  "adult",
  "rally",
  "",                       // goals (not collected)
  "",                       // programs (not collected)
  "balliol, king",          // area (legacy col 9)
  "",                       // notes
  "yes",                    // newsletter
  "1",                      // priority_score
  "standard",               // lead_type
  "new",                    // follow_up_status
  "balliol, king",          // preferred_locations
  "v1:mon:eve;wed:mor,eve;sat:aft", // availability (compact v1 string)
  "bootcamps",              // recommended_program
]);
check("row cells line up with headers", row.length, INTAKE_HEADERS.length);

// ─── Scoring branches ─────────────────────────────────────────────────────────

console.log("scoring");
const elite = buildIntakeRow({ ...wizard, level: "elite" }, TS);
check("elite → priority 3 / lead_type elite", [elite[11], elite[12]], ["3", "elite"]);

const highIntent = buildIntakeRow({ ...wizard, programs: ["bootcamp", "private"] }, TS);
check("private program → priority 2 / high-intent", [highIntent[11], highIntent[12]], ["2", "high-intent"]);

const multi = buildIntakeRow({ ...wizard, programs: ["bootcamp", "group"] }, TS);
check("two programs → priority 2 / high-intent", [multi[11], multi[12]], ["2", "high-intent"]);

// ─── Legacy + edge shapes ─────────────────────────────────────────────────────

console.log("legacy and edge shapes");
const legacy = buildIntakeRow(
  { ...wizard, availability: ["weekday-evening", "weekend-morning"], area: undefined },
  TS
);
check("legacy slot array joins with ', '", legacy[15], "weekday-evening, weekend-morning");
check("area falls back to preferredLocationIds", legacy[8], "balliol, king");

const empty = buildIntakeRow({}, TS);
check("empty body still yields 17 cells", empty.length, 17);
check("empty body defaults", empty, [
  TS, "", "", "", "", "", "", "", "", "", "", "1", "standard", "new", "", "", "",
]);

const noNewsletter = buildIntakeRow({ ...wizard, newsletter: false }, TS);
check("newsletter false → 'no'", noNewsletter[10], "no");
const unsetNewsletter = buildIntakeRow({ ...wizard, newsletter: undefined }, TS);
check("newsletter unset → ''", unsetNewsletter[10], "");

check(
  "recommender slots derived from the grid",
  intakeAvailabilitySlots(wizard).sort(),
  ["weekday-daytime", "weekday-evening", "weekend-afternoon"]
);

// ─── Result ───────────────────────────────────────────────────────────────────

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nall checks passed");
