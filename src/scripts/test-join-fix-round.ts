// Run from project root: npx tsx src/scripts/test-join-fix-round.ts
//
// Pins the safety review's fix round on backlog #85 (join a group and pay).
// One section per point; each check failed before its fix:
//   1. by approval never depends on how the coach typed the level band: a
//      Youth block is by approval when its band is blank or reaches the High
//      Performance tier, on its card, on its sign-up page and on a direct
//      request to either payment route (blockByApproval);
//   2. a block with no price is nobody's to enroll in: no card, so its group
//      falls back to "Dates coming soon" and "Notify me", and its sign-up
//      page refuses plainly (payment already refused it);
//   3. one rule for the group a block trains in, planned or not: the card, the
//      sign-up page and the payment routes' approval check all read
//      groupForBlock, so a block off the planned lineup has its ages checked
//      on its sign-up page as on its card.
// Checks that read source text accept either line ending (`read`). Exits
// non-zero on any failure. Never spells the cohort length or total.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { COHORT_TOTAL_CENTS, COHORT_WEEKS, programGroups } from "../content/programs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { accountOpenCards, blockByApproval, blockFacts, blockHasPrice, groupCards, groupForBlock, openBlockCards, plannedGroupForBlock, signedInOpenCards } from "../lib/groupBlocks";
import { groupAction, groupStatus } from "../lib/programCatalog";
import { APPROVAL_ONLY_ERROR, approvalGateApplies, approvalRefusal, priceRefusal } from "../lib/enrollGate";
import { tierById } from "../lib/tiers";
import { ProgramGroupCard } from "../components/sections/ProgramGroupCard";
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

// ── 1. By approval, however the band is typed ───────────────────────────────
console.log("1. By approval never depends on how the level band is typed");
{
  const pub = { allowed: true as const, via: "public" as const };
  const top = tierById(5).levelMin;
  const routes = ["src/app/api/checkout/route.ts", "src/app/api/enroll/etransfer/route.ts"].map(read);
  check("both payment routes run the approval check on the cohort they were sent, before anything is created", routes.every((r) => r.includes("approvalRefusal(cohort, gate)")) && routes[0].indexOf("approvalRefusal(cohort, gate)") < routes[0].indexOf("createCheckoutSession(") && routes[1].indexOf("approvalRefusal(cohort, gate)") < routes[1].indexOf("recordEtransferIntent("));
  check("the sign-up page puts the approval step on the block's own group", enrollPage.includes("const group = groupForBlock(cohort);") && enrollPage.includes("if (group && approvalGateApplies({ group, decision: gate.decision, claimed }))"));

  const byApproval: [string, number | null, number | null][] = [
    ["its levels left blank (the admin form's default)", null, null],
    ["4.0–7.0", 4, 7],
    ["4.5–7.0", 4.5, 7],
    ["1.0–7.0", 1, 7],
    ["5.0–7.0", top, 7],
    ["5.0 alone", top, null],
    ["2.0–5.0", 2, top],
    ["only a top level of 5.5", null, 5.5],
  ];
  for (const [name, levelMin, levelMax] of byApproval) {
    const b = youthBlock({ id: "y", levelMin, levelMax });
    const card = cardFor(b)!;
    const status = groupStatus(card.group, card.block!.seatsLeft);
    const html = renderToStaticMarkup(createElement(ProgramGroupCard, { group: card.group, block: blockFacts(b) }));
    check(`a Youth block with ${name}: its card reads By approval and Ask to join, never Open to join or Enroll`, blockByApproval(b) && card.group.joining === "approval" && status?.label === "By approval" && groupAction(card.group, status).label === "Ask to join" && html.includes("By approval</span>") && />Ask to join</.test(html) && !html.includes("Open to join") && !/>Enroll</.test(html), `${card.group.name} ${card.group.joining}`);
    check("…its sign-up page stops a walk-in at the approval step, and lets the invitee holding the link through", approvalGateApplies({ group: groupForBlock(b), decision: pub, claimed: null }) && !approvalGateApplies({ group: groupForBlock(b), decision: pub, claimed: { id: "inv" } }));
    const refusal = approvalRefusal(b, { decision: pub, lookup: null });
    check("…a direct request to /api/checkout or /api/enroll/etransfer is refused, 403, with the by-approval line", refusal?.status === 403 && refusal.error === APPROVAL_ONLY_ERROR && approvalRefusal(b, { decision: pub, lookup: { state: "valid", invite: { id: "inv", cohort_id: "y" } } }) === null);
    check("…and no signed-in list offers it", signedInOpenCards(groupCards(programGroups, [b])).length === 0);
  }

  const open: [string, number | null, number | null][] = [
    ["1.0–1.5", 1, 1.5],
    ["2.0–2.5", 2, 2.5],
    ["3.0–3.5", 3, 3.5],
    ["4.0–4.5", 4, 4.5],
    ["only a top level of 4.5", null, 4.5],
  ];
  for (const [name, levelMin, levelMax] of open) {
    const b = youthBlock({ id: "y", levelMin, levelMax });
    const card = cardFor(b)!;
    check(`a Youth block at ${name}, below High Performance, stays open: Enroll, and no approval step anywhere`, !blockByApproval(b) && card.group.joining === "open" && groupAction(card.group, groupStatus(card.group)).label === "Enroll" && !approvalGateApplies({ group: groupForBlock(b), decision: pub, claimed: null }) && approvalRefusal(b, { decision: pub, lookup: null }) === null);
  }
  // The owner has not ruled on adults: an adult block at the High Performance
  // tier, or with no band, stays open to join, as before this round.
  for (const [name, levelMin, levelMax] of [["5.0–7.0", top, 7], ["its levels left blank", null, null], ["1.0–7.0", 1, 7]] as [string, number | null, number | null][]) {
    const b = block({ id: "a", levelMin, levelMax });
    check(`an adult block with ${name} is unchanged: open to join`, !blockByApproval(b) && cardFor(b)!.group.joining === "open" && approvalRefusal(b, { decision: pub, lookup: null }) === null);
  }
  check("the rule reads the lineup: a program is by approval from the lowest level of its by-approval group", !blockByApproval(youthBlock({ id: "y", levelMin: null, levelMax: null }), programGroups.filter((g) => g.joining !== "approval")) && blockByApproval(block({ id: "a", levelMin: 4, levelMax: 7 }), programGroups.map((g) => (g.id === "adult-advanced" ? { ...g, joining: "approval" as const } : g))));
  check("a block of a program with no group bootcamps is nobody's to approve here", !blockByApproval(block({ id: "p", programId: "private-lessons", levelMin: null, levelMax: null })));
}

// ── 2. A block with no price ────────────────────────────────────────────────
console.log("2. A block with no price offers no Enroll");
{
  const unpriced: [string, Cohort][] = [
    ["a price of zero", block({ id: "free", priceCents: 0 })],
    ["no price at all", block({ id: "none", priceCents: undefined as unknown as number })],
    ["a price that is not a number", block({ id: "nan", priceCents: Number.NaN })],
    ["a price below zero", block({ id: "neg", priceCents: -100 })],
  ];
  for (const [name, b] of unpriced) {
    const cards = groupCards(programGroups, [b]);
    const own = cards.find((c) => c.group.id === "adult-newer");
    const html = own ? renderToStaticMarkup(createElement(ProgramGroupCard, { group: own.group, block: own.block })) : "";
    check(`a block with ${name} is no card: its group reads Dates coming soon and Notify me, never Enroll`, !blockHasPrice(b) && !cards.some((c) => c.block?.cohortId === b.id) && openBlockCards(cards).length === 0 && !!own && own.block === null && html.includes("Dates coming soon") && />Notify me</.test(html) && !/>Enroll</.test(html) && !html.includes("/enroll/") && !html.includes("Pricing TBA"));
    check("…no signed-in list offers it", accountOpenCards(cards, { enrolledCohortIds: [], players: [] }).length === 0);
    check("…and payment refuses it by the same rule, 409", priceRefusal(b)?.status === 409);
  }
  const offLineup = groupCards(programGroups, [youthBlock({ id: "int", levelMin: 3, levelMax: 3.5, priceCents: 0 })]);
  check("off the planned lineup, a block with no price shows nowhere", offLineup.length === programGroups.length && offLineup.every((c) => c.block === null));
  const priced = block({ id: "priced" });
  check("a priced block keeps its card and Enroll, beside an unpriced one of the same group", blockHasPrice(priced) && priceRefusal(priced) === null && openBlockCards(groupCards(programGroups, [priced, unpriced[0][1]])).map((c) => c.block!.cohortId).join() === "priced");
  const gateAt = enrollPage.indexOf("if (priceRefusal(cohort))");
  check("the sign-up page refuses a block with no price before the wizard, by payment's own rule", gateAt !== -1 && gateAt < enrollPage.indexOf("<EnrollWizard") && enrollPage.indexOf("resolveEnrollGate(cohort, tokenParam)") < gateAt && enrollPage.includes("<PriceGate"));
  const gate = enrollPage.slice(enrollPage.indexOf("function PriceGate"), enrollPage.indexOf("/** The signed-in player's email"));
  check("…plainly: what is true, and the way out, with no amount and no promise of one", gate.includes("Enrollment isn&apos;t open for this group yet") && gate.includes("Its price isn&apos;t set, so we can&apos;t take payment for it.") && gate.includes("mailto:info@tennisbootcamp.ca") && gate.includes("Browse Programs") && !/\$\d|soon|!/.test(gate));
}

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
