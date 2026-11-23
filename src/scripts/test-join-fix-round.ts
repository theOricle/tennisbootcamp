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
//   4. the sign-up page says what its card says: the class days and times,
//      the dates from the first class to the last, and the group's ages;
//   5. signed in, no loop: the dashboard's "Open for your tier" lists private
//      blocks only (the public ones are the cards above it), and the approval
//      step's link takes a signed-in invitee to the dashboard, not the login;
//   7. words that are true: /programs promises no automatic email, the
//      dashboard points at the groups below only when one can be enrolled in,
//      and the Youth page's paragraph names no fixed list of groups;
//   9. the e-transfer amount on the sign-up page waits for the chosen player:
//      the $20 comes off for the player it belongs to, by the payment routes'
//      own rule, never for whoever the account's first credit names;
// Checks that read source text accept either line ending (`read`). Exits
// non-zero on any failure. Never spells the cohort length or total.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { COHORT_TOTAL_CENTS, COHORT_WEEKS, programGroups } from "../content/programs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cardTakesEnrollment, cardsHeading, privateTierMatches, accountOpenCards, blockByApproval, blockFacts, blockHasPrice, groupCards, groupForBlock, openBlockCards, plannedGroupForBlock, signedInOpenCards } from "../lib/groupBlocks";
import { groupAction, groupStatus } from "../lib/programCatalog";
import { invitedAlreadyLink, APPROVAL_ONLY_ERROR, approvalGateApplies, approvalRefusal, priceRefusal } from "../lib/enrollGate";
import { tierById } from "../lib/tiers";
import { ProgramGroupCard } from "../components/sections/ProgramGroupCard";
import { EnrollWizard } from "../app/enroll/[cohortId]/EnrollWizard";
import { programs } from "../content/programs";
import { PROGRAMS_NO_DATES_LINE } from "../content/site";
import { ageBandBlock, dobAgeError } from "../lib/enrollPlayers";
import { accountCredits, chosenCreditCents, decideCredits, readyCreditsForSeats, type CreditBooking } from "../lib/creditRules";
import { amountDueCents } from "../lib/paymentTransitions";
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

/** The words a piece of markup shows, in order. */
const words = (html: string) => html.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
/** The sign-up page's first screen for a block, as a walk-in sees it. */
const signUpPage = (b: Cohort) =>
  words(renderToStaticMarkup(createElement(EnrollWizard, { cohort: b, program: programs.find((p) => p.id === b.programId), group: groupForBlock(b), seatsRemaining: null, signInHref: "/login" })));

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

// ── 4. The sign-up page and its card say the same ───────────────────────────
console.log("4. The sign-up page reads its card's own dates, class days and ages");
{
  const twoTimes = youthBlock({ id: "two", startDate: "2027-01-09", levelMin: 2, levelMax: 2.5, sessions: [{ day: "Sat", start: "15:00", end: "16:00" }, { day: "Wed", start: "18:00", end: "19:00" }] });
  const mondayStart = block({ id: "mon", startDate: "2027-01-11" });
  const adult = block({ id: "adult" });
  for (const [name, b] of [["two class times a week", twoTimes], ["a start date typed on a Monday", mondayStart], ["an adult block", adult]] as [string, Cohort][]) {
    const card = cardFor(b)!;
    const page = signUpPage(b);
    const cardHtml = words(renderToStaticMarkup(createElement(ProgramGroupCard, { group: card.group, block: card.block })));
    check(`${name}: the page shows the card's dates, word for word`, page.includes(`Dates ${card.block!.dates} `) && cardHtml.includes(card.block!.dates), page.slice(page.indexOf("Dates"), page.indexOf("Dates") + 60));
    check("…the card's class days and times", page.includes(`Sessions ${card.block!.days} `) && cardHtml.includes(card.block!.days), page.slice(page.indexOf("Sessions"), page.indexOf("Sessions") + 70));
  }
  check("two class times read each day with its own time, never the first time for both", signUpPage(twoTimes).includes("Saturdays 3–4pm, Wednesdays 6–7pm") && !signUpPage(twoTimes).includes("Sat & Wed"));
  check("a start date typed on a Monday reads from the first class, the Sunday after", signUpPage(mondayStart).includes("Jan 17 – Feb 21") && !signUpPage(mondayStart).includes("Jan 11"));
  check("an adult group reads its own ages, 16 and up, as its card does", signUpPage(adult).includes("Ages 16 and up") && !signUpPage(adult).includes("18+") && words(renderToStaticMarkup(createElement(ProgramGroupCard, { group: cardFor(adult)!.group, block: cardFor(adult)!.block }))).includes("Ages 16 and up"));
  check("a youth group reads its own ages too, never its program's whole range", signUpPage(twoTimes).includes("Ages 11–15") && !signUpPage(twoTimes).includes("7–17"));
  const wizard = read("src/app/enroll/[cohortId]/EnrollWizard.tsx");
  check("the page types no date or time format of its own: it reads the card's facts", wizard.includes("const facts = blockFacts(cohort);") && !wizard.includes("formatDateRange") && !wizard.includes("formatDaysTimes"));
}

// ── 5. Signed-in loops ──────────────────────────────────────────────────────
console.log("5. Signed in, no loop");
{
  const top = tierById(5).levelMin;
  const hpPublic = youthBlock({ id: "hp-public", levelMin: top, levelMax: 7 });
  const openPublic = block({ id: "open-public", levelMin: 4, levelMax: 4.5 });
  const privateBlock = block({ id: "private", levelMin: 4, levelMax: 4.5, visibility: "private" });
  const legacy = block({ id: "legacy", visibility: undefined });
  const player = { id: "p1", level: 5.5 };
  const matches = [hpPublic, openPublic, privateBlock, legacy].map((cohort) => ({ cohort, players: [player] }));
  check("Open for your tier keeps only private blocks: a public one is a card under Groups with dates already", privateTierMatches(matches).map((m) => m.cohort.id).join() === "private");
  check("…so a high-level player is never offered Enroll on a public by-approval block, whose page would send them back to the dashboard", !privateTierMatches(matches).some((m) => m.cohort.id === "hp-public") && approvalGateApplies({ group: groupForBlock(hpPublic), decision: { allowed: true, via: "public" }, claimed: null }));
  check("…and a block with no visibility set reads as public, as everywhere else", !privateTierMatches(matches).some((m) => m.cohort.id === "legacy"));
  const dash = read("src/app/dashboard/page.tsx");
  check("the dashboard builds that list through it", dash.includes("const openForTier = privateTierMatches(tierMatches)"));

  const out = invitedAlreadyLink(false, "/login?next=%2Fenroll%2Fhp");
  const signedIn = invitedAlreadyLink(true, "/login?next=%2Fenroll%2Fhp");
  check("signed out, the approval step's link is Sign in, back to this page", out.href === "/login?next=%2Fenroll%2Fhp" && out.label === "Sign in" && out.rest === " and your invitation is on your dashboard.");
  check("signed in, it opens the dashboard, never the login form", signedIn.href === "/dashboard" && signedIn.label === "Open your dashboard" && signedIn.rest === " and your invitation is there." && !signedIn.href.includes("login"));
  check("the approval step draws that link, told whether the visitor is signed in", enrollPage.includes("invitedAlreadyLink(signedIn, signInHref)") && enrollPage.includes("signedIn={Boolean(sessionEmail)}") && !/Invited already\?[\s\S]{0,80}<Link href=\{signInHref\}/.test(enrollPage));
}

// ── 7. Words that are true ──────────────────────────────────────────────────
console.log("7. Words that are true");
{
  check("/programs with no block open: Notify me joins the email list, and nothing says an email is sent when a block opens", PROGRAMS_NO_DATES_LINE === "Dates for the next cohort are coming. Choose Notify me to join our email list, where our coaches announce new dates." && !/we'll email|we will email|email you|when it opens|as soon as|automatic/i.test(PROGRAMS_NO_DATES_LINE));
  check("…it still says dates are coming and names the button, in words for any screen", PROGRAMS_NO_DATES_LINE.startsWith("Dates for the next cohort are coming. Choose Notify me ") && !/\b(tap|click|press)\b|!/i.test(PROGRAMS_NO_DATES_LINE));

  const open = block({ id: "open" });
  const one = (b: Cohort, seats: number | null) => groupCards(programGroups, [b], { [b.id]: seats }).filter((c) => c.block !== null);
  check("a listed card with room can be enrolled in: seats unknown, plenty, or the last one", [null, 8, 1].every((n) => one(open, n).every(cardTakesEnrollment)));
  check("a Full card cannot, nor a by-approval one, nor a group with no open block", !one(open, 0).some(cardTakesEnrollment) && !one(youthBlock({ id: "hp", levelMin: 5, levelMax: 7 }), 4).some(cardTakesEnrollment) && !groupCards(programGroups, []).some(cardTakesEnrollment));
  const dash = read("src/app/dashboard/page.tsx");
  check("the dashboard says Or pick a group with dates below only when a listed card can be enrolled in, never for a Full card alone", dash.includes("groupsBelow: openGroups.some(cardTakesEnrollment),") && !dash.includes("groupsBelow: openGroups.length > 0"));

  const youth = programs.find((p) => p.id === "youth-programs")!;
  const youthGroups = programGroups.filter((g) => g.programSlug === "youth-programs");
  const fourCards = groupCards(youthGroups, [youthBlock({ id: "int", levelMin: 3, levelMax: 3.5 })]);
  check("the Youth page can head its cards Four groups (a block off the planned lineup)", cardsHeading(fourCards).startsWith("Four groups"));
  check("…so its paragraph names no list of groups to contradict the heading", youthGroups.every((g) => !youth.longDescription.includes(g.name)) && !/\(ages \d/.test(youth.longDescription), youth.longDescription);
  check("…and still says how the groups go, and where each one's dates are", youth.longDescription.includes("The groups go by age and level, from juniors in their first season to the competitive track for players who compete, or are training to. Each group below shows its dates and class times. "));
}

// ── 9. The e-transfer amount waits for the chosen player ────────────────────
console.log("9. The e-transfer amount waits for the chosen player");
{
  const ACCOUNT = "acct-1";
  const FIRST = "player-first";
  const SECOND = "player-second";
  const booking = (over: Partial<CreditBooking> & Pick<CreditBooking, "id">): CreditBooking => ({
    user_id: ACCOUNT,
    participant_id: null,
    email: "holder@example.com",
    name: "Player",
    status: "completed",
    paid: true,
    credit_status: "unused",
    created_at: "2026-11-01T12:00:00Z",
    ...over,
  });
  const price = COHORT_TOTAL_CENTS;
  const readyFor = (bookings: CreditBooking[]) =>
    accountCredits({ accountId: ACCOUNT, email: "holder@example.com", playerIds: [FIRST, SECOND], bookings }).ready.map((c) => ({ participantId: c.participantId, creditCents: c.creditCents }));
  /** What the screen shows for the chosen players. */
  const shown = (bookings: CreditBooking[], seats: (string | null)[]) => {
    const credit = chosenCreditCents({ ready: readyFor(bookings), seats, priceCents: price });
    return { credit, due: amountDueCents(price * Math.max(1, seats.length), credit) };
  };
  /** What /api/enroll/etransfer takes off: one player at a time, each lookup told what the earlier ones used. */
  const charged = (bookings: CreditBooking[], seats: (string | null)[]) => {
    const claimed: string[] = [];
    return seats.map((seat) => {
      const [credit] = decideCredits({ accountId: ACCOUNT, seats: [seat], bookings, claimed });
      if (credit) claimed.push(credit.bookingId);
      return Math.min(credit?.creditCents ?? 0, price);
    });
  };

  // Two players on one account; the $20 belongs to the second.
  const secondsCredit = [booking({ id: "b-second", participant_id: SECOND })];
  check("the account's first credit is the second player's", readyFor(secondsCredit).length === 1 && readyFor(secondsCredit)[0].participantId === SECOND);
  check("before a player is chosen, nothing comes off", shown(secondsCredit, []).credit === 0 && shown(secondsCredit, []).due === price);
  check("choosing the first player shows the full price", shown(secondsCredit, [FIRST]).credit === 0 && shown(secondsCredit, [FIRST]).due === price);
  check("choosing the second shows $20 off", shown(secondsCredit, [SECOND]).credit === 2000 && shown(secondsCredit, [SECOND]).due === price - 2000);
  check("choosing both shows one $20 off the two", shown(secondsCredit, [FIRST, SECOND]).credit === 2000 && shown(secondsCredit, [FIRST, SECOND]).due === price * 2 - 2000);

  const stories: [string, CreditBooking[]][] = [
    ["the second player's own credit", secondsCredit],
    ["a credit on the account, for whoever enrolls next", [booking({ id: "b-acct" })]],
    ["one each", [booking({ id: "b1", participant_id: FIRST }), booking({ id: "b2", participant_id: SECOND, created_at: "2026-11-02T12:00:00Z" })]],
    ["the first player's own and one on the account", [booking({ id: "b1", participant_id: FIRST }), booking({ id: "b-acct", created_at: "2026-11-03T12:00:00Z" })]],
    ["two for one player", [booking({ id: "b1", participant_id: SECOND }), booking({ id: "b2", participant_id: SECOND, created_at: "2026-11-02T12:00:00Z" })]],
    ["one that is used, one not paid, one for another account's player", [booking({ id: "u", participant_id: FIRST, credit_status: "applied" }), booking({ id: "n", participant_id: SECOND, paid: false }), booking({ id: "o", participant_id: "someone-else", user_id: "acct-2" })]],
    ["none", []],
  ];
  const seatings: (string | null)[][] = [[FIRST], [SECOND], [FIRST, SECOND], [SECOND, FIRST]];
  for (const [name, bookings] of stories) {
    const same = seatings.every((seats) => JSON.stringify(readyCreditsForSeats(readyFor(bookings), seats)) === JSON.stringify(charged(bookings, seats)));
    check(`${name}: the amount shown is the amount the payment route takes off, for every choice of players`, same, seatings.map((seats) => `${JSON.stringify(readyCreditsForSeats(readyFor(bookings), seats))} vs ${JSON.stringify(charged(bookings, seats))}`).join("; "));
  }
  check("a credit never takes off more than the price", chosenCreditCents({ ready: [{ participantId: SECOND, creditCents: 2000 }], seats: [SECOND], priceCents: 1500 }) === 1500);

  const wizard = read("src/app/enroll/[cohortId]/EnrollWizard.tsx");
  check("the sign-up page hands the wizard the account's credits and names no amount of its own for a signed-in account", enrollPage.includes("ready = creditView.ready.map((c) => ({ participantId: c.participantId, creditCents: c.creditCents }));") && !enrollPage.includes("creditView.ready[0]"));
  check("the wizard works the amount out from the players chosen, by that rule", wizard.includes("chosenCreditCents({") && wizard.includes("seats: players.map((p) => p.participantId),") && wizard.includes("creditCents={etransferCreditCents}") && !wizard.includes("amountDueCents(total, info.creditCents)"));
  check("the wizard is sent no booking id, name or email of a credit", !/ready\.map\(\(c\) => \(\{[^}]*(bookingId|playerName|email)/.test(enrollPage));
}

if (failed > 0) {
  console.log(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll join fix round checks passed.");
