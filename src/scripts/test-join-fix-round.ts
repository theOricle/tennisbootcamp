// Run from project root: npx tsx src/scripts/test-join-fix-round.ts
//
// Pins the safety review's fix round on backlog #85 (join a group and pay).
// One section per point; each check failed before its fix:
//   3. one rule for the group a block trains in, planned or not: the card, the
//      sign-up page and the payment routes' approval check all read
//      groupForBlock, so a block off the planned lineup has its ages checked
//      on its sign-up page as on its card.
// Checks that read source text accept either line ending (`read`). Exits
// non-zero on any failure. Never spells the cohort length or total.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { COHORT_TOTAL_CENTS, COHORT_WEEKS, programGroups } from "../content/programs";
import { groupCards, groupForBlock, plannedGroupForBlock } from "../lib/groupBlocks";
import { ageBandBlock, dobAgeError } from "../lib/enrollPlayers";
import type { Cohort } from "../types/cohort";

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    console.log(`  ✓ ${name}`);
  } else {
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

const ROOT = process.cwd();
/** A source file, its line endings normalised (this computer checks files out with CRLF). */
const read = (path: string) => readFileSync(join(ROOT, path), "utf8").replace(/\r\n/g, "\n");

/** A public block as the coach builds one, priced from the setting unless a test says otherwise. */
const block = (over: Partial<Cohort> & Pick<Cohort, "id">): Cohort => ({
  programId: "bootcamps",
  locationId: "",
  label: over.id,
  startDate: "2027-01-10",
  endDate: "",
  weeks: COHORT_WEEKS,
  sessions: [{ day: "Sun", start: "16:00", end: "17:00" }],
  capacityMin: 3,
  capacityMax: 8,
  priceCents: COHORT_TOTAL_CENTS,
  currency: "CAD",
  status: "open",
  levelMin: 1,
  levelMax: 1.5,
  visibility: "public",
  dbStatus: "inviting",
  ...over,
});
const youthBlock = (over: Partial<Cohort> & Pick<Cohort, "id">) =>
  block({ programId: "youth-programs", startDate: "2027-01-09", sessions: [{ day: "Sat", start: "15:00", end: "16:00" }], ...over });
const cardFor = (b: Cohort) => groupCards(programGroups, [b]).find((c) => c.block?.cohortId === b.id);

const enrollPage = read("src/app/enroll/[cohortId]/page.tsx");
const gateSrc = read("src/lib/enrollGate.ts");

// ── 3. One rule for a block off the planned lineup ──────────────────────────
console.log("3. One rule for the group a block trains in, on the planned lineup or off it");
{
  const offLineup = youthBlock({ id: "int-youth", levelMin: 3, levelMax: 3.5 });
  const group = groupForBlock(offLineup);
  const card = cardFor(offLineup)?.group;
  check("an Intermediate youth block matches no planned group", plannedGroupForBlock(offLineup, programGroups) === undefined);
  check("…and still has a group: Intermediate Youth Bootcamp, ages 7–17", group?.name === "Intermediate Youth Bootcamp" && group?.ageMin === 7 && group?.ageMax === 17, JSON.stringify(group));
  check("…the same one its card shows: name, ages, level, program, joining", !!group && !!card && card.name === group.name && card.ageMin === group.ageMin && card.ageMax === group.ageMax && card.level === group.level && card.programSlug === group.programSlug && card.joining === group.joining);
  check("…so its sign-up page stops an adult: by age band, and by date of birth", !!group && ageBandBlock(group, "adult") !== null && dobAgeError(group, 34) !== null && ageBandBlock(group, "teen") === null && dobAgeError(group, 12) === null);
  const offAdult = block({ id: "adult-hp", levelMin: 5, levelMax: 7 });
  check("an adult block off the lineup reads its program's ages too: a child is stopped", ageBandBlock(groupForBlock(offAdult)!, "junior") !== null && dobAgeError(groupForBlock(offAdult), 9) !== null);
  for (const g of programGroups.filter((x) => x.day !== null && x.level !== null)) {
    const own = block({ id: `own-${g.id}`, programId: g.programSlug, levelMin: g.level, levelMax: g.level! + 0.5 });
    check(`a block of the ${g.name} is that planned group`, groupForBlock(own)?.name === g.name && groupForBlock(own)?.ageMin === g.ageMin && groupForBlock(own)?.ageMax === g.ageMax);
  }
  check("a block of a program with no group bootcamps has no group", groupForBlock(block({ id: "p", programId: "private-lessons", levelMin: null, levelMax: null })) === null && groupForBlock(block({ id: "r", programId: "high-performance" })) === null && groupForBlock(block({ id: "t", programId: "toString" })) === null);
  check("the sign-up page finds its group by that one rule", enrollPage.includes("const group = groupForBlock(cohort);") && !enrollPage.includes("cohortMatchesGroup"));
  check("…and so does the payment routes' approval check", gateSrc.includes("const group = groupForBlock(cohort, groups);") && !gateSrc.includes("groups.find((g) => cohortMatchesGroup"));
  check("the cards build an off-lineup block's group through it", read("src/lib/groupBlocks.ts").includes("groupForBlock(block, lineup)"));
}

if (failed > 0) {
  console.log(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll join fix round checks passed.");
