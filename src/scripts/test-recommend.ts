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
      preferredLocationIds: [],
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
      preferredLocationIds: [],
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
      preferredLocationIds: [],
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

// ─── Age bands, asked per person (backlog #14) ────────────────────────────────
// The intake now knows each player's band, so two children on one submission
// get different reads. Without a band the legacy adult/youth gating stands.

console.log("\n=== Age bands ===");

function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    console.log(`  ✓ ${name}`);
  } else {
    console.log(`  ✗ ${name}`, detail ?? "");
    passed = false;
  }
}

const base = {
  goals: [] as string[],
  programs: [] as string[],
  preferredLocationIds: [] as string[],
  availability: ["weekday-evening"],
};

// A parent adding a Junior 9 and a Teen 15 — the case the shared "who is
// training?" step could never answer twice.
const junior9 = recommendPrograms({
  ...base,
  who: "youth",
  ageBand: "junior",
});
const teen15 = recommendPrograms({
  ...base,
  who: "youth",
  ageBand: "teen",
});
check(
  "junior 7–13 → Kids' Summer Camp only",
  junior9.length === 1 && junior9[0].program.id === "kids-summer-camp",
  junior9.map((r) => r.program.id)
);
check(
  "teen 14–17 → Bootcamps, never the 7–13 camp",
  teen15.length === 1 && teen15[0].program.id === "bootcamps",
  teen15.map((r) => r.program.id)
);
check(
  "the two children get different top programs",
  junior9[0]?.program.id !== teen15[0]?.program.id
);

// An elite teen keeps the high-performance track the deleted step used to
// carry as its own option.
const eliteTeen = recommendPrograms({
  ...base,
  who: "youth",
  ageBand: "teen",
  level: "elite",
});
check(
  "elite teen → Bootcamps, top-scored",
  eliteTeen[0]?.program.id === "bootcamps" && eliteTeen[0].score >= 75,
  eliteTeen.map((r) => `${r.program.id}:${r.score}`)
);

// An adult alone must read exactly as before the bands existed.
for (const level of ["new", "rally", "competitive", "elite"] as const) {
  const withBand = recommendPrograms({ ...base, who: "adult", ageBand: "adult", level });
  const withoutBand = recommendPrograms({ ...base, who: "adult", level });
  check(
    `adult (${level}) is unchanged by the band`,
    JSON.stringify(withBand.map((r) => [r.program.id, r.score, r.reason])) ===
      JSON.stringify(withoutBand.map((r) => [r.program.id, r.score, r.reason]))
  );
}

console.log(passed ? "\nAll assertions passed." : "\nSome assertions FAILED.");
process.exit(passed ? 0 : 1);
