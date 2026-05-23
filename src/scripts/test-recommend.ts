// Run from project root: npx tsx src/scripts/test-recommend.ts
import { recommendPrograms } from "../lib/recommend";

const personas = [
  {
    name: "Emma — 9-year-old beginner",
    form: {
      who: "youth" as const,
      level: "new" as const,
      goals: ["consistency"],
      programs: [] as string[],
      preferredLocationIds: ["balliol"],
      availability: ["weekday-daytime"],
    },
  },
  {
    name: "David — adult beginner",
    form: {
      who: "adult" as const,
      level: "new" as const,
      goals: ["technique", "consistency"],
      programs: ["group"],
      preferredLocationIds: ["king"],
      availability: ["weekday-evening"],
    },
  },
  {
    name: "Mia — competitive teen",
    form: {
      who: "youth" as const,
      level: "competitive" as const,
      goals: ["competition", "tactics", "match"],
      programs: ["bootcamp"],
      preferredLocationIds: ["balliol"],
      availability: ["weekday-evening"],
    },
  },
];

let passed = true;

for (const persona of personas) {
  console.log(`\n=== ${persona.name} ===`);
  const recs = recommendPrograms(persona.form);

  if (recs.length === 0) {
    console.log("  → (no recommendations — no program passed age gate)");
    continue;
  }

  for (const [i, rec] of recs.entries()) {
    const marker = i === 0 ? "★" : " ";
    console.log(`  ${marker} [${rec.score}] ${rec.program.title}`);
    console.log(`        "${rec.reason}"`);
    const cohortIds = rec.cohorts.map((c) => c.id).join(", ") || "(none)";
    console.log(`        Cohorts: ${cohortIds}`);
  }
}

// Assertions
console.log("\n=== Assertions ===");

const emmaRecs = recommendPrograms(personas[0].form);
console.assert(
  emmaRecs.length === 1 && emmaRecs[0].program.id === "kids-summer-camp",
  "FAIL: Emma (9y beginner) should only get Kids Summer Camp"
);
if (emmaRecs.length === 1 && emmaRecs[0].program.id === "kids-summer-camp") {
  console.log("  ✓ Emma → Kids Summer Camp only");
} else {
  console.log("  ✗ Emma assertion failed:", emmaRecs.map((r) => r.program.id));
  passed = false;
}

const davidRecs = recommendPrograms(personas[1].form);
console.assert(
  davidRecs.length >= 1 && davidRecs[0].program.id === "group-lessons",
  "FAIL: David (adult beginner) should rank Group Lessons #1"
);
if (davidRecs.length >= 1 && davidRecs[0].program.id === "group-lessons") {
  console.log("  ✓ David → Group Lessons #1");
} else {
  console.log("  ✗ David assertion failed:", davidRecs.map((r) => r.program.id));
  passed = false;
}

const miaRecs = recommendPrograms(personas[2].form);
console.assert(
  miaRecs.length >= 1 && miaRecs[0].program.id === "bootcamps",
  "FAIL: Mia (competitive teen) should rank Bootcamps #1"
);
if (miaRecs.length >= 1 && miaRecs[0].program.id === "bootcamps") {
  console.log("  ✓ Mia → Bootcamps #1");
} else {
  console.log("  ✗ Mia assertion failed:", miaRecs.map((r) => r.program.id));
  passed = false;
}

// Mia's cohort at balliol should come before king (preferred location)
if (miaRecs.length > 0 && miaRecs[0].cohorts.length >= 2) {
  const firstCohortLocation = miaRecs[0].cohorts[0].locationId;
  console.assert(
    firstCohortLocation === "balliol",
    "FAIL: Mia's first cohort should be at balliol (preferred)"
  );
  if (firstCohortLocation === "balliol") {
    console.log("  ✓ Mia → balliol cohort floats first (preferred location)");
  } else {
    console.log("  ✗ Mia cohort ordering failed, got:", firstCohortLocation);
    passed = false;
  }
}

console.log(passed ? "\nAll assertions passed." : "\nSome assertions FAILED.");
process.exit(passed ? 0 : 1);
