// Run from project root: npx tsx src/scripts/test-recommend.ts
//
// Weekend catalog (backlog #20):
//   junior or teen                → Youth Programs
//   competitive or elite, any age → High Performance
//   adult                         → Adult Bootcamps (id "bootcamps")
//   nothing recommends the coming-soon camp or the retired Group Lessons
import { recommendPrograms, type IntakeFormSnapshot } from "../lib/recommend";
import { AGE_BANDS } from "../lib/ageBand";

let passed = true;

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
  availability: ["weekend-daytime"],
};

const ids = (form: IntakeFormSnapshot) => recommendPrograms(form).map((r) => r.program.id);
const top = (form: IntakeFormSnapshot) => recommendPrograms(form)[0]?.program.id;

const personas: { name: string; form: IntakeFormSnapshot }[] = [
  { name: "Emma — junior beginner", form: { ...base, who: "youth", ageBand: "junior", level: "new" } },
  { name: "Leo — teen rally player", form: { ...base, who: "youth", ageBand: "teen", level: "rally" } },
  { name: "Mia — competitive teen", form: { ...base, who: "youth", ageBand: "teen", level: "competitive" } },
  { name: "David — adult beginner", form: { ...base, who: "adult", ageBand: "adult", level: "new" } },
  { name: "Priya — elite adult", form: { ...base, who: "adult", ageBand: "adult", level: "elite" } },
];

for (const persona of personas) {
  console.log(`\n=== ${persona.name} ===`);
  for (const [i, rec] of recommendPrograms(persona.form).entries()) {
    console.log(`  ${i === 0 ? "★" : " "} [${rec.score}] ${rec.program.title}`);
    console.log(`        "${rec.reason}"`);
  }
}

console.log("\n=== Assertions ===");

// Juniors and teens → Youth Programs
for (const band of ["junior", "teen"] as const) {
  for (const level of ["new", "rally"] as const) {
    const form: IntakeFormSnapshot = { ...base, who: "youth", ageBand: band, level };
    check(
      `${band} (${level}) → Youth Programs only`,
      JSON.stringify(ids(form)) === JSON.stringify(["youth-programs"]),
      ids(form)
    );
  }
}

// Competitive or elite at any age → High Performance first
for (const band of AGE_BANDS) {
  for (const level of ["competitive", "elite"] as const) {
    const form: IntakeFormSnapshot = {
      ...base,
      who: band === "adult" ? "adult" : "youth",
      ageBand: band,
      level,
    };
    check(`${band} (${level}) → High Performance #1`, top(form) === "high-performance", ids(form));
  }
}

// Adults → Adult Bootcamps
for (const level of ["new", "rally"] as const) {
  const form: IntakeFormSnapshot = { ...base, who: "adult", ageBand: "adult", level };
  check(
    `adult (${level}) → Adult Bootcamps only`,
    JSON.stringify(ids(form)) === JSON.stringify(["bootcamps"]),
    ids(form)
  );
}
const adultHp = ids({ ...base, who: "adult", ageBand: "adult", level: "competitive" });
check(
  "competitive adult → High Performance, then Adult Bootcamps",
  JSON.stringify(adultHp) === JSON.stringify(["high-performance", "bootcamps"]),
  adultHp
);
const teenHp = ids({ ...base, who: "youth", ageBand: "teen", level: "elite" });
check(
  "elite teen → High Performance, then Youth Programs",
  JSON.stringify(teenHp) === JSON.stringify(["high-performance", "youth-programs"]),
  teenHp
);

// Legacy callers without a band (older payloads, the recommendation email)
check(
  "no band, who=youth → Youth Programs",
  top({ ...base, who: "youth", level: "new" }) === "youth-programs"
);
check(
  "no band, who=adult → Adult Bootcamps",
  top({ ...base, who: "adult", level: "rally" }) === "bootcamps"
);

// A ?program= preselection never outranks the level rule
check(
  "competitive teen preselecting Youth Programs still gets High Performance #1",
  top({ ...base, who: "youth", ageBand: "teen", level: "competitive", programs: ["youth"] }) ===
    "high-performance"
);

// Nothing ever recommends the coming-soon camp or retired Group Lessons
const never = new Set(["kids-summer-camp", "group-lessons"]);
let leaked: string[] = [];
for (const band of AGE_BANDS) {
  for (const level of ["new", "rally", "competitive", "elite", undefined] as const) {
    for (const programs of [[], ["camp"], ["group"], ["not-sure"]]) {
      const got = ids({
        ...base,
        who: band === "adult" ? "adult" : "youth",
        ageBand: band,
        level,
        programs,
      });
      leaked = leaked.concat(got.filter((id) => never.has(id)));
    }
  }
}
check("no persona is recommended Kids' Summer Camp or Group Lessons", leaked.length === 0, leaked);

// Every player gets at least one recommendation
for (const band of AGE_BANDS) {
  for (const level of ["new", "rally", "competitive", "elite", undefined] as const) {
    const form: IntakeFormSnapshot = {
      ...base,
      who: band === "adult" ? "adult" : "youth",
      ageBand: band,
      level,
    };
    check(`${band} (${level ?? "no level"}) gets a recommendation`, ids(form).length >= 1);
  }
}

console.log(passed ? "\nAll assertions passed." : "\nSome assertions FAILED.");
process.exit(passed ? 0 : 1);
