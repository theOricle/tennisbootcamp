// Run from project root: npx tsx src/scripts/test-recommend.ts
//
// Catalog (owner, 2026-10-12):
//   junior or teen        → Youth Bootcamps (id "youth-programs"); a competitive
//                           or tournament player's first group is High Performance
//   adult                 → Adult Bootcamps (id "bootcamps")
//   "private" chosen      → Private Lessons first (every surface shows only
//                           the first match), then the group program
//   nothing recommends a retired program (High Performance's old id, Group Lessons)
import { recommendPrograms, recommendationHref, type IntakeFormSnapshot } from "../lib/recommend";
import { AGE_BANDS } from "../lib/ageBand";
import { groupById } from "../content/programs";

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
const topGroups = (form: IntakeFormSnapshot) => recommendPrograms(form)[0]?.groups.map((g) => g.id) ?? [];

const personas: { name: string; form: IntakeFormSnapshot }[] = [
  { name: "Emma — junior beginner", form: { ...base, who: "youth", ageBand: "junior", level: "new" } },
  { name: "Leo — teen rally player", form: { ...base, who: "youth", ageBand: "teen", level: "rally" } },
  { name: "Mia — competitive teen", form: { ...base, who: "youth", ageBand: "teen", level: "competitive" } },
  { name: "David — adult beginner", form: { ...base, who: "adult", ageBand: "adult", level: "new" } },
  { name: "Priya — tournament adult", form: { ...base, who: "adult", ageBand: "adult", level: "elite" } },
];

for (const persona of personas) {
  console.log(`\n=== ${persona.name} ===`);
  for (const [i, rec] of recommendPrograms(persona.form).entries()) {
    console.log(`  ${i === 0 ? "★" : " "} [${rec.score}] ${rec.program.title} — ${rec.groups.map((g) => g.name).join(", ")}`);
    console.log(`        "${rec.reason}"`);
  }
}

console.log("\n=== Assertions ===");

// Juniors and teens → Youth Bootcamps, every level
for (const band of ["junior", "teen"] as const) {
  for (const level of ["new", "rally", "competitive", "elite", undefined] as const) {
    const form: IntakeFormSnapshot = { ...base, who: "youth", ageBand: band, level };
    check(
      `${band} (${level ?? "no level"}) → Youth Bootcamps only`,
      JSON.stringify(ids(form)) === JSON.stringify(["youth-programs"]),
      ids(form)
    );
  }
}

// A competitive or tournament junior or teen → the High Performance group first
for (const band of ["junior", "teen"] as const) {
  for (const level of ["competitive", "elite"] as const) {
    const form: IntakeFormSnapshot = { ...base, who: "youth", ageBand: band, level };
    check(`${band} (${level}) → High Performance group first`, topGroups(form)[0] === "high-performance", topGroups(form));
  }
}

// Adults → Adult Bootcamps, the group by level
for (const level of ["new", "rally", "competitive", "elite", undefined] as const) {
  const form: IntakeFormSnapshot = { ...base, who: "adult", ageBand: "adult", level };
  check(
    `adult (${level ?? "no level"}) → Adult Bootcamps only`,
    JSON.stringify(ids(form)) === JSON.stringify(["bootcamps"]),
    ids(form)
  );
}
check("adult beginner → the newer group", JSON.stringify(topGroups({ ...base, who: "adult", ageBand: "adult", level: "new" })) === JSON.stringify(["adult-newer"]));
check("adult rally → the newer group (Novice)", JSON.stringify(topGroups({ ...base, who: "adult", ageBand: "adult", level: "rally" })) === JSON.stringify(["adult-newer"]));
check("adult competitive → the intermediate group", JSON.stringify(topGroups({ ...base, who: "adult", ageBand: "adult", level: "competitive" })) === JSON.stringify(["adult-intermediate"]));
check("adult tournament → the advanced group", JSON.stringify(topGroups({ ...base, who: "adult", ageBand: "adult", level: "elite" })) === JSON.stringify(["adult-advanced"]));

// Legacy callers without a band (older payloads, the recommendation email)
check("no band, who=youth → Youth Bootcamps", top({ ...base, who: "youth", level: "new" }) === "youth-programs");
check("no band, who=adult → Adult Bootcamps", top({ ...base, who: "adult", level: "rally" }) === "bootcamps");
check("no band, no who → read as an adult", top({ ...base, level: "rally" }) === "bootcamps");

// A ?program= preselection never changes the age rule
check(
  "a teen preselecting bootcamp still gets Youth Bootcamps",
  top({ ...base, who: "youth", ageBand: "teen", level: "competitive", programs: ["bootcamp"] }) === "youth-programs"
);
// A visitor who came from the Private Lessons card or page (?program=private-lessons)
// sees Private Lessons: the result screen, the household screen, the email
// and Sheet column 17 (recommended_program) all read the first match alone.
check(
  "?program=private puts Private Lessons first, the group program second",
  JSON.stringify(ids({ ...base, who: "adult", ageBand: "adult", level: "rally", programs: ["private"] })) === JSON.stringify(["private-lessons", "bootcamps"])
);
check(
  "a tournament adult asking for private lessons still gets Private Lessons first",
  JSON.stringify(ids({ ...base, who: "adult", ageBand: "adult", level: "elite", programs: ["private"] })) === JSON.stringify(["private-lessons", "bootcamps"])
);
check(
  "a teen asking for private lessons gets Private Lessons first, Youth Bootcamps second",
  JSON.stringify(ids({ ...base, who: "youth", ageBand: "teen", level: "competitive", programs: ["private"] })) === JSON.stringify(["private-lessons", "youth-programs"])
);
check(
  "Private Lessons outranks a group program that was chosen as well",
  top({ ...base, who: "adult", ageBand: "adult", level: "elite", programs: ["bootcamp", "private"] }) === "private-lessons"
);
check(
  "a chosen group program still outranks the unchosen one's score",
  recommendPrograms({ ...base, who: "adult", ageBand: "adult", level: "rally", programs: ["bootcamp"] })[0]?.score === 65
);

// Where the match card links: the program, or its one fitting scheduled group's card
const href = (form: IntakeFormSnapshot) => recommendationHref(recommendPrograms(form)[0]);
check("one fitting scheduled group → that group's card", href({ ...base, who: "youth", ageBand: "teen", level: "elite" }) === "/programs/youth-programs#high-performance", href({ ...base, who: "youth", ageBand: "teen", level: "elite" }));
check("several fitting groups → the program page", href({ ...base, who: "youth", ageBand: "junior", level: "new" }) === "/programs/youth-programs", href({ ...base, who: "youth", ageBand: "junior", level: "new" }));
check(
  "private lessons → the program page with no anchor (it has no group card)",
  href({ ...base, who: "adult", ageBand: "adult", level: "rally", programs: ["private"] }) === "/programs/private-lessons",
  href({ ...base, who: "adult", ageBand: "adult", level: "rally", programs: ["private"] })
);

// Nothing ever recommends a retired program
const never = new Set(["kids-summer-camp", "group-lessons", "high-performance"]);
let leaked: string[] = [];
for (const band of AGE_BANDS) {
  for (const level of ["new", "rally", "competitive", "elite", undefined] as const) {
    for (const programs of [[], ["camp"], ["group"], ["high-performance"], ["not-sure"]]) {
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
check("no persona is recommended a retired program", leaked.length === 0, leaked);

// Every player gets at least one recommendation, with at least one group
for (const band of AGE_BANDS) {
  for (const level of ["new", "rally", "competitive", "elite", undefined] as const) {
    const form: IntakeFormSnapshot = {
      ...base,
      who: band === "adult" ? "adult" : "youth",
      ageBand: band,
      level,
    };
    check(`${band} (${level ?? "no level"}) gets a recommendation with groups`, ids(form).length >= 1 && topGroups(form).length >= 1);
  }
}

// Reasons read times and names from src/content/programs.ts
const hp = groupById("high-performance");
const hpReason = recommendPrograms({ ...base, who: "youth", ageBand: "teen", level: "elite" })[0]?.reason;
check(
  "High Performance reason names its day and start from the group",
  !!hp && !!hpReason?.includes(`${hp.day} at 2:00`),
  hpReason
);
const newerReason = recommendPrograms({ ...base, who: "adult", ageBand: "adult", level: "new" })[0]?.reason;
check(
  "adult beginner reason leads with the group, the day and the start",
  !!newerReason?.startsWith("Newer players group, Sunday at 4:00"),
  newerReason
);

console.log(passed ? "\nAll assertions passed." : "\nSome assertions FAILED.");
process.exit(passed ? 0 : 1);
