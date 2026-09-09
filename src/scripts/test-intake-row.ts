// Run from project root: npx tsx src/scripts/test-intake-row.ts
// Pins the /api/intake Google Sheet row shape (src/lib/intakeRow.ts):
// 17 columns, headers in the frozen order, and cell values for a wizard
// submission. Exits non-zero on any failure. If this test has to change,
// the column contract changed — that needs an explicit owner decision.

import {
  INTAKE_HEADERS,
  INTAKE_HOUSEHOLD_HEADERS,
  INTAKE_ALL_HEADERS,
  INTAKE_APPEND_RANGE_COLUMNS,
  INTAKE_APPEND_RANGE_ALL,
  buildIntakeRow,
  buildIntakeHouseholdCells,
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

// ─── Appended household block (cols 18–22, backlog #11) ──────────────────────

console.log("household headers");
check("5 appended columns", INTAKE_HOUSEHOLD_HEADERS.length, 5);
check("appended in order", [...INTAKE_HOUSEHOLD_HEADERS], [
  "account_email", "account_name", "participant_name",
  "participant_relationship", "participant_id",
]);
check("22 columns in total", INTAKE_ALL_HEADERS.length, 22);
check(
  "the frozen 17 are still the first 17 of the full header row",
  INTAKE_ALL_HEADERS.slice(0, 17),
  [...INTAKE_HEADERS]
);
check("full append range covers A–V", INTAKE_APPEND_RANGE_ALL, "A:V");

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

// ─── Household rows (the frozen 17 must not move) ────────────────────────────

console.log("household rows");
const HOUSEHOLD = {
  accountEmail: "dana@example.com",
  accountName: "Dana Chen",
  participantName: "Maya Chen",
  participantRelationship: "child",
  participantId: "11111111-2222-3333-4444-555555555555",
};
const childRow = buildIntakeRow({ ...wizard, name: "Maya Chen" }, TS, HOUSEHOLD);
check("household row has 22 cells", childRow.length, 22);
check(
  "cells 1–17 are byte-identical to the frozen contract",
  childRow.slice(0, 17),
  buildIntakeRow({ ...wizard, name: "Maya Chen" }, TS)
);
check("cells 18–22 carry the household", childRow.slice(17), [
  "dana@example.com",
  "Dana Chen",
  "Maya Chen",
  "child",
  "11111111-2222-3333-4444-555555555555",
]);

// A second player under the same account: same account columns, different
// participant — this is what makes two identical names distinguishable.
const siblingRow = buildIntakeRow({ ...wizard, name: "Maya Chen" }, TS, {
  ...HOUSEHOLD,
  participantId: "99999999-8888-7777-6666-555555555555",
});
check(
  "two players share the account email",
  [childRow[17], siblingRow[17]],
  ["dana@example.com", "dana@example.com"]
);
check(
  "identical names are still distinguishable by participant_id",
  childRow[21] === siblingRow[21],
  false
);

// Each player answers their own age and level (backlog #14), so cols 5–6
// describe the row's player. The columns themselves do not move.
const junior = buildIntakeRow(
  { ...wizard, name: "Maya Chen", who: "youth", level: "new" },
  TS,
  HOUSEHOLD
);
const teen = buildIntakeRow(
  { ...wizard, name: "Noah Chen", who: "youth", level: "competitive" },
  TS,
  { ...HOUSEHOLD, participantName: "Noah Chen" }
);
check("two players in one household still write 22 cells each",
  [junior.length, teen.length], [22, 22]);
check("each row carries its own who / level",
  [junior[4], junior[5], teen[4], teen[5]],
  ["youth", "new", "youth", "competitive"]);
check(
  "differing who / level never shifts the household block",
  [junior.slice(17, 19), teen.slice(17, 19)],
  [["dana@example.com", "Dana Chen"], ["dana@example.com", "Dana Chen"]]
);

// No household → exactly the pre-#11 row, unchanged.
check(
  "omitting the household yields exactly 17 cells",
  buildIntakeRow(wizard, TS).length,
  17
);
check(
  "an empty household object still defaults from the body",
  buildIntakeHouseholdCells(wizard, {}),
  ["jordan@example.com", "Jordan Lee", "Jordan Lee", "", ""]
);
check(
  "a body with no name or email leaves the household cells blank",
  buildIntakeHouseholdCells({}, {}),
  ["", "", "", "", ""]
);

// ─── Result ───────────────────────────────────────────────────────────────────

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nall checks passed");
