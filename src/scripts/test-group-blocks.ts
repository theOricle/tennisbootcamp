// Run from project root: npx tsx src/scripts/test-group-blocks.ts
//
// Pins backlog #85 (owner, 2026-11-19: "you should be able to sign up and pay
// for a group not just ask to join. Also when I am already signed in it just
// tell me I already submitted request."; 2026-11-20: "There should also be a
// date outlined on the card ... some groups may run twice a week later"):
//   1. one group card per open block, matched to its planned group by
//      program and level, never by day or time, through the one rule the
//      sign-up page and both payment routes read too, so a card and its
//      sign-up page always find the same group, with the same ages and the
//      same approval step; a block that matches no planned group still
//      shows, built from its own program and level; two blocks of one group
//      are two cards;
//   2. what a card takes from its block: the dates from the first class to
//      the last ("Jan 11 – Feb 15", the year only across a new year), the
//      class days and times ("Sundays 4–5pm", "Sundays and Wednesdays
//      4–5pm"), the price and length with the class count, once a week or
//      twice, so two cards' prices compare at a glance, and the seats;
//   3. the card's states and its one button: "Enroll" to the block's sign-up
//      page, "Ask to join" by approval, "Notify me" when full, and "Dates
//      coming soon" with "Notify me" for a group with no open block (the
//      owner's decision, 2026-11-20); the dates the strongest of its lines;
//   4. the signed-in screens, rendered: the quiz's already-taken panel and
//      the dashboard's list, with and without open blocks, never a
//      by-approval block, both for the household's ages only; with none
//      listed, the line that is true (no group has dates yet, or none with
//      dates is open to them); the next step that names the groups below
//      only when there are some; no suggestion that repeats a listed block;
//   5. the pages' headings (groups counted once, whatever their blocks),
//      counts, day lists, prices and "next starts" lines, read from the
//      cards they show.
// Checks that read source text accept either line ending (`read`). Exits
// non-zero on any failure. Never spells the cohort length or total.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  COHORT_LENGTH_ADJ,
  COHORT_TOTAL,
  COHORT_TOTAL_CENTS,
  COHORT_WEEKS,
  GROUP_PRICE,
  PRICE_SUMMARY,
  SESSION_PRICE_LABEL,
  cohortLengthFor,
  formatDollars,
  groupById,
  listedPrograms,
  numberInWords,
  priceSummaryFor,
  programGroups,
} from "../content/programs";
import {
  accountOpenCards,
  blockClassCount,
  blockClassDates,
  blockFacts,
  blockLevel,
  blockPrice,
  cardsDaysLabel,
  cardsHeading,
  cardsLevelTags,
  cardsNextStart,
  cardsPrice,
  cardsProgramLine,
  cardsScheduleLine,
  groupCards,
  groupTakesPlayerAge,
  isBootcampBlock,
  openBlockCards,
  plannedGroupForBlock,
  signedInOpenCards,
  suggestionsBesideCards,
  type AgePlayer,
  type GroupCard,
} from "../lib/groupBlocks";
import {
  DATES_COMING_SOON,
  NOTIFY_LABEL,
  cohortMatchesGroup,
  formatBlockDates,
  formatClassDays,
  formatClassHours,
  groupAction,
  groupClassDays,
  groupStatus,
  priceParts,
} from "../lib/programCatalog";
import { approvalGateApplies, approvalRefusal } from "../lib/enrollGate";
import { nextStepFor, type NextStepInput } from "../lib/dashboardState";
import { tierById } from "../lib/tiers";
import { PROGRAMS_DESCRIPTION, PROGRAMS_NO_DATES_LINE } from "../content/site";
import { ProgramGroupCard } from "../components/sections/ProgramGroupCard";
import { NO_DATES_LINE, OPEN_GROUPS_HEADING, OpenGroupsList, noOpenGroupLine } from "../components/sections/OpenGroups";
import { AlreadyTakenPanel, twoPathsLine } from "../components/quiz/AlreadyTakenPanel";
import type { Cohort, SessionSlot } from "../types/cohort";

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
const at = (hay: string, needle: string) => hay.indexOf(needle);
const count = (hay: string, needle: string) => hay.split(needle).length - 1;
const render = (el: React.ReactElement) => renderToStaticMarkup(el);
/** The words a piece of markup shows, in order. */
const words = (html: string) => html.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const ids = (cards: readonly GroupCard[]) => cards.map((c) => c.group.id).join(",");
const g = (id: string) => groupById(id)!;
/** The one link a card or a screen shows for a given href. */
const linkTo = (html: string, href: string) => html.match(new RegExp(`<a [^>]*href="${href}"[^>]*>[\\s\\S]*?</a>`))?.[0] ?? "";
const lime = (link: string) => link.includes("bg-[#B4E655]");

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
const youthBlock = (over: Partial<Cohort> & Pick<Cohort, "id">) => block({ programId: "youth-programs", startDate: "2027-01-09", ...over });

// ── 2. The dates ────────────────────────────────────────────────────────────
console.log("The dates: the first class to the last, in the site's short style");
check("same year: two dates and an en dash", formatBlockDates("2027-01-11", "2027-02-15") === "Jan 11 – Feb 15");
check("across a new year: the year on both dates", formatBlockDates("2026-12-06", "2027-01-10") === "Dec 6, 2026 – Jan 10, 2027");
check("a block of one class: its one date", formatBlockDates("2027-01-11", "2027-01-11") === "Jan 11");
{
  // Starts on a Monday, trains on Sundays: the first class is the Sunday after.
  const monday = block({ id: "mon-start", startDate: "2027-01-11", weeks: 6 });
  const dates = blockClassDates(monday);
  check("from the first class, not the start date the coach typed, to the last class", dates.first === "2027-01-17" && dates.last === "2027-02-21" && blockFacts(monday).dates === "Jan 17 – Feb 21" && blockFacts(monday).firstClass === "2027-01-17", JSON.stringify(dates));
  const twice = block({ id: "twice", startDate: "2027-02-21", weeks: 6, sessions: [{ day: "Sun", start: "16:00", end: "17:00" }, { day: "Wed", start: "16:00", end: "17:00" }] });
  check("twice a week: the last class is the last of either day", blockFacts(twice).dates === "Feb 21 – Mar 31");
  const winter = youthBlock({ id: "winter", startDate: "2026-12-05", weeks: 6, sessions: [{ day: "Sat", start: "15:00", end: "16:00" }] });
  check("a block that runs into a new year names both years", blockFacts(winter).dates === "Dec 5, 2026 – Jan 9, 2027");
  check("a block inside one year names none", blockFacts(block({ id: "jan" })).dates.match(/\d{4}/) === null);
}

// ── 2. The class days and times ─────────────────────────────────────────────
console.log("The class days and times, short");
check("hours: am or pm once when both ends share it", formatClassHours("16:00", "17:00") === "4–5pm" && formatClassHours("09:00", "10:00") === "9–10am" && formatClassHours("12:00", "13:00") === "12–1pm");
check("hours: both when the class crosses noon, minutes only when there are some", formatClassHours("11:00", "12:00") === "11am–12pm" && formatClassHours("16:30", "17:30") === "4:30–5:30pm" && formatClassHours("11:30", "12:30") === "11:30am–12:30pm");
check("hours: Postgres times with seconds read the same", formatClassHours("16:00:00", "17:00:00") === "4–5pm");
check("one day", formatClassDays([{ day: "Sun", start: "16:00", end: "17:00" }]) === "Sundays 4–5pm");
check("two days at one time: the days once, then the time", formatClassDays([{ day: "Sun", start: "16:00", end: "17:00" }, { day: "Wed", start: "16:00", end: "17:00" }]) === "Sundays and Wednesdays 4–5pm");
check("two days at different times: each with its own, kept short", formatClassDays([{ day: "Sun", start: "16:00", end: "17:00" }, { day: "Wed", start: "18:00", end: "19:00" }]) === "Sundays 4–5pm, Wednesdays 6–7pm");
check("three days at one time", formatClassDays([{ day: "Mon", start: "18:00", end: "19:00" }, { day: "Wed", start: "18:00", end: "19:00" }, { day: "Fri", start: "18:00", end: "19:00" }]) === "Mondays, Wednesdays and Fridays 6–7pm");
check("a block's days come in the order its first week brings them, whatever order the coach typed them", blockFacts(block({ id: "order", sessions: [{ day: "Wed", start: "16:00", end: "17:00" }, { day: "Sun", start: "16:00", end: "17:00" }] })).days === "Sundays and Wednesdays 4–5pm");
check("a planned group's own class reads the same way", groupClassDays(g("youth-7-10")) === "Saturdays 12–1pm" && groupClassDays(g("adult-advanced")) === "Sundays 6–7pm");

// ── 2. The price and length ─────────────────────────────────────────────────
console.log("The price: the block's own total over its own length, with its class count, once a week or twice");
check("the whole price from a total and a length, with a class count when one is given", priceSummaryFor(280, 8) === "$280 for eight weeks" && priceSummaryFor(280, 8, 8) === "$280 for 8 classes over eight weeks" && cohortLengthFor(1) === "one week" && cohortLengthFor(13) === "13 weeks");
check("…one class reads in the singular, and no class count reads none", priceSummaryFor(35, 1, 1) === "$35 for 1 class over one week" && priceSummaryFor(280, 8, 0) === "$280 for eight weeks");
check("the planned groups' price is the setting's, with its class count, one a week", GROUP_PRICE === priceSummaryFor(COHORT_TOTAL, COHORT_WEEKS, COHORT_WEEKS) && GROUP_PRICE === `${formatDollars(COHORT_TOTAL)} for ${COHORT_WEEKS} classes over ${numberInWords(COHORT_WEEKS)} weeks` && programGroups.filter((x) => x.day !== null).every((x) => x.price === GROUP_PRICE));
check("the program pages' price with no block open stays the setting's, with no count", PRICE_SUMMARY === priceSummaryFor(COHORT_TOTAL, COHORT_WEEKS) && PRICE_SUMMARY === `${formatDollars(COHORT_TOTAL)} for ${numberInWords(COHORT_WEEKS)} weeks`);
check("a once-a-week block priced at the setting reads the planned groups' words", blockPrice(block({ id: "set" })) === GROUP_PRICE);
check("a block of its own length and total reads its own, with its class count", blockPrice(block({ id: "long", weeks: 8, priceCents: 28000 })) === "$280 for 8 classes over eight weeks" && blockPrice(block({ id: "half", weeks: 3, priceCents: 10500 })) === "$105 for 3 classes over three weeks");
check("a block with no price set says so, never $0", blockPrice(block({ id: "free", priceCents: 0 })) === "Pricing TBA");
{
  const twiceLong = block({ id: "twice-long", weeks: 8, priceCents: 56000, sessions: [{ day: "Sun", start: "16:00", end: "17:00" }, { day: "Wed", start: "16:00", end: "17:00" }] });
  check("twice a week: the class count, counted from the block's sessions, beside the total and the length", blockClassCount(twiceLong) === 16 && blockPrice(twiceLong) === "$560 for 16 classes over eight weeks" && blockFacts(twiceLong).classes === 16 && blockFacts(twiceLong).totalCents === 56000);
  const twiceSet = block({ id: "twice-set", sessions: [{ day: "Sun", start: "16:00", end: "17:00" }, { day: "Wed", start: "16:00", end: "17:00" }] });
  check("…at the setting's length too, so two blocks of one group at different class counts read apart", blockPrice(twiceSet) === `${formatDollars(COHORT_TOTAL)} for ${COHORT_WEEKS * 2} classes over ${cohortLengthFor(COHORT_WEEKS)}` && blockPrice(block({ id: "once" })) === GROUP_PRICE);
  const [, onceRest] = priceParts(blockPrice(block({ id: "once" })));
  const [, twiceRest] = priceParts(blockPrice(twiceSet));
  check("once a week and twice read in parallel: the same words, only the count apart", onceRest === `for ${COHORT_WEEKS} classes over ${cohortLengthFor(COHORT_WEEKS)}` && twiceRest === `for ${COHORT_WEEKS * 2} classes over ${cohortLengthFor(COHORT_WEEKS)}` && onceRest.replace(/\d+/, "N") === twiceRest.replace(/\d+/, "N"));
  const html = render(createElement(ProgramGroupCard, { group: g("adult-newer"), block: blockFacts(twiceLong) }));
  const [lead, rest] = priceParts(blockPrice(twiceLong));
  check("the card shows the total in bold over the class count and length, never a per-session figure", rest === "for 16 classes over eight weeks" && html.includes(`>${lead}</span>`) && html.includes(`>${rest}</span>`) && !/a session|per session|a class\b|per class/i.test(html) && !html.includes(SESSION_PRICE_LABEL) && count(html, "$") === 1);
}

// ── 1. One rule for which group a block belongs to ──────────────────────────
console.log("One rule: a block belongs to a group by program and level, never by day or time");
check("a block's level is the tier its band starts in", blockLevel({ levelMin: 3, levelMax: 3.5 }) === 3 && blockLevel({ levelMin: 5, levelMax: 7 }) === 5 && blockLevel({ levelMin: 3, levelMax: 4.5 }) === 3 && blockLevel({ levelMin: 2, levelMax: null }) === 2);
check("a block built for any level has none: no band, or the whole ladder", blockLevel({ levelMin: null, levelMax: null }) === null && blockLevel({ levelMin: 1, levelMax: 7 }) === null);
check("an Intermediate adult block on Wednesday evenings is the Intermediate Adult Bootcamp", plannedGroupForBlock(block({ id: "wed", levelMin: 3, levelMax: 3.5, sessions: [{ day: "Wed", start: "18:00", end: "19:00" }] }), programGroups)?.id === "adult-intermediate");
check("a Novice youth block in the Beginner Junior Bootcamp's Saturday slot is still the Novice Youth Bootcamp", plannedGroupForBlock(youthBlock({ id: "slot", levelMin: 2, levelMax: 2.5, sessions: [{ day: "Sat", start: "12:00", end: "13:00" }] }), programGroups)?.id === "youth-11-15");
check("a block of another program never matches", plannedGroupForBlock(youthBlock({ id: "other", levelMin: 3, levelMax: 3.5 }), programGroups) === undefined && plannedGroupForBlock(block({ id: "adult-hp", levelMin: 5, levelMax: 7 }), programGroups) === undefined);
check("private lessons, a group with no fixed class, never match", !programGroups.some((x) => x.day === null && cohortMatchesGroup(block({ id: "p", programId: "private-lessons", levelMin: null, levelMax: null }), x)));
check("only the bootcamp programs' blocks with a class show as cards", isBootcampBlock(block({ id: "a" })) && isBootcampBlock(youthBlock({ id: "y" })) && !isBootcampBlock(block({ id: "p", programId: "private-lessons" })) && !isBootcampBlock(block({ id: "r", programId: "high-performance" })) && !isBootcampBlock(block({ id: "s", sessions: [] })) && !isBootcampBlock(block({ id: "t", programId: "toString" })));
{
  // The sign-up page (src/app/enroll/[cohortId]/page.tsx) finds a cohort's
  // group with programGroups.find((g) => cohortMatchesGroup(cohort, g)), and
  // both payment routes run approvalRefusal (src/lib/enrollGate.ts) with it.
  // Each block below must read the same group on its card and its page.
  const pub = { allowed: true as const, via: "public" as const };
  const pageGroup = (b: Cohort) => programGroups.find((x) => cohortMatchesGroup(b, x)) ?? null;
  const cardFor = (b: Cohort) => groupCards(programGroups, [b]).find((c) => c.block?.cohortId === b.id)!;
  const hp = { levelMin: 5, levelMax: 7 };
  const samples: [string, Cohort][] = [
    ["a High Performance block on Sunday 10am", youthBlock({ id: "hp-sun", ...hp, sessions: [{ day: "Sun", start: "10:00", end: "11:00" }] })],
    ["a High Performance block on Saturday 12pm", youthBlock({ id: "hp-noon", ...hp, sessions: [{ day: "Sat", start: "12:00", end: "13:00" }] })],
    ["a High Performance block on Wednesday and Saturday, Wednesday stored first", youthBlock({ id: "hp-wed-sat", ...hp, sessions: [{ day: "Wed", start: "18:00", end: "19:00" }, { day: "Sat", start: "14:00", end: "15:00" }] })],
    ["a Beginner youth block on Saturday 2pm", youthBlock({ id: "beg-2pm", levelMin: 1, levelMax: 1.5, sessions: [{ day: "Sat", start: "14:00", end: "15:00" }] })],
    ["an Intermediate youth block on Saturday 12pm", youthBlock({ id: "int-noon", levelMin: 3, levelMax: 3.5, sessions: [{ day: "Sat", start: "12:00", end: "13:00" }] })],
    ...programGroups
      .filter((x) => x.day !== null && x.level !== null)
      .map((x): [string, Cohort] => [
        `the ${x.name} in its own slot`,
        block({ id: `own-${x.id}`, programId: x.programSlug, levelMin: tierById(x.level!).levelMin, levelMax: tierById(x.level!).levelMax, sessions: [{ day: x.day!.slice(0, 3) as SessionSlot["day"], start: x.start!, end: x.end! }] }),
      ]),
  ];
  for (const [name, b] of samples) {
    const page = pageGroup(b);
    const card = cardFor(b).group;
    const planned = plannedGroupForBlock(b, programGroups) ?? null;
    // The same group, so the same ages; a block that matches no planned
    // group has none on its page either, so no other group's ages or step.
    const same = (page?.id ?? null) === (planned?.id ?? null) && (page === null || (card.name === page.name && card.ageMin === page.ageMin && card.ageMax === page.ageMax && card.joining === page.joining));
    check(`${name}: the card and the sign-up page find the same group, with the same ages`, same, `page ${page?.id ?? "none"}, card ${card.name} ${card.ageMin}–${card.ageMax}`);
    const byApproval = card.joining === "approval";
    const atPayment = approvalRefusal(b, { decision: pub, lookup: null }) !== null;
    const onPage = approvalGateApplies({ group: page, decision: pub, claimed: null });
    const button = groupAction(card, groupStatus(card));
    check(
      `${name}: ${byApproval ? "Ask to join, and its approval step on the page and at payment" : "Enroll, and no approval step anywhere"}`,
      atPayment === byApproval && onPage === byApproval && button.label === (byApproval ? "Ask to join" : "Enroll")
    );
  }
  check("every High Performance block is by approval, wherever its classes sit", samples.filter(([, b]) => blockLevel(b) === 5 && b.programId === "youth-programs").every(([, b]) => approvalRefusal(b, { decision: pub, lookup: null }) !== null));
}

// ── 1. The cards ────────────────────────────────────────────────────────────
console.log("One card per open block, one per planned group with none");
{
  const none = groupCards(programGroups, []);
  check("no open block: one card per planned group, in lineup order, each with no block", ids(none) === programGroups.map((x) => x.id).join(",") && none.every((c) => c.block === null) && openBlockCards(none).length === 0);
  const sunday = block({ id: "beg-sun", startDate: "2027-01-10" });
  const twice = block({ id: "beg-sun-wed", startDate: "2027-02-21", sessions: [{ day: "Sun", start: "16:00", end: "17:00" }, { day: "Wed", start: "16:00", end: "17:00" }] });
  const cards = groupCards(programGroups, [twice, sunday]);
  const beg = cards.filter((c) => c.group.name === "Beginner Adult Bootcamp");
  check("two blocks of one group are two cards, the earliest first, and the group has no card of its own", beg.length === 2 && beg[0].block?.cohortId === "beg-sun" && beg[1].block?.cohortId === "beg-sun-wed" && beg[0].group.id === "adult-newer" && beg[1].group.id === "adult-newer-2" && !cards.some((c) => c.group.name === "Beginner Adult Bootcamp" && c.block === null));
  check("each reads its own dates, days and price", beg[0].block?.dates === "Jan 10 – Feb 14" && beg[0].block?.days === "Sundays 4–5pm" && beg[1].block?.days === "Sundays and Wednesdays 4–5pm" && beg[0].block?.price === GROUP_PRICE && beg[1].block?.price === blockPrice(twice) && beg[1].block?.price !== GROUP_PRICE);
  check("card ids are unique on a page, so each anchor lands on one card", new Set(cards.map((c) => c.group.id)).size === cards.length);
  check("the rest of the lineup keeps its cards in order, around them", ids(cards) === "youth-7-10,youth-11-15,high-performance,adult-newer,adult-newer-2,adult-intermediate,adult-advanced,private-lessons");
  check("from the lineup a card takes the program, the level tag, the title and the ages", beg.every((c) => c.group.programSlug === "bootcamps" && c.group.level === 1 && c.group.ageMin === 16 && c.group.ageMax === null));
  check("from the block it takes its class day and time, its location and its price", beg[0].group.day === "Sunday" && beg[0].group.start === "16:00" && beg[0].group.locationId === "newtonbrook" && beg[0].group.price === GROUP_PRICE && beg[1].group.price === blockPrice(twice));

  const intermediateYouth = youthBlock({ id: "int-youth", startDate: "2026-12-05", levelMin: 3, levelMax: 3.5, sessions: [{ day: "Sat", start: "15:00", end: "16:00" }, { day: "Wed", start: "18:00", end: "19:00" }] });
  const built = groupCards(programGroups, [intermediateYouth]);
  const card = built.find((c) => c.block?.cohortId === "int-youth");
  check("a block that fits no planned group still shows, titled from its program and level", !!card && card.group.name === "Intermediate Youth Bootcamp" && card.group.level === 3 && card.group.programSlug === "youth-programs");
  check("…with the ages its program's groups take, open to join (by approval is the High Performance Youth Bootcamp's own rule)", !!card && card.group.ageMin === 7 && card.group.ageMax === 17 && card.group.joining === "open" && card.group.status === "forming");
  check("…in its program's run by level, between Novice and High Performance", ids(built) === "youth-7-10,youth-11-15,youth-programs-intermediate,high-performance,adult-newer,adult-intermediate,adult-advanced,private-lessons");
  check("…and reads its own dates and days", card?.block?.dates === "Dec 5, 2026 – Jan 13, 2027" && card?.block?.days === "Saturdays 3–4pm, Wednesdays 6–7pm");
  const adultHp = groupCards(programGroups, [block({ id: "adult-hp", levelMin: 5, levelMax: 7 })]).find((c) => c.block?.cohortId === "adult-hp");
  check("an adult block at the High Performance tier is the High Performance Adult Bootcamp, open to join", adultHp?.group.name === "High Performance Adult Bootcamp" && adultHp?.group.joining === "open" && adultHp?.group.ageMin === 16);
  const anyLevel = groupCards(programGroups, [block({ id: "any", levelMin: null, levelMax: null })]).find((c) => c.block?.cohortId === "any");
  check("a block built for any level reads its program's audience and All levels", anyLevel?.group.name === "Adult Bootcamp" && anyLevel?.group.level === null);
  check("blocks the cards cannot show are left out: private lessons, a retired program, no class", openBlockCards(groupCards(programGroups, [block({ id: "p", programId: "private-lessons" }), block({ id: "r", programId: "high-performance" }), block({ id: "s", sessions: [] })])).length === 0);
  check("seats come by the block's id", groupCards(programGroups, [sunday], { "beg-sun": 2 }).find((c) => c.block?.cohortId === "beg-sun")?.block?.seatsLeft === 2 && groupCards(programGroups, [sunday]).find((c) => c.block)?.block?.seatsLeft === null);
  check("the cards are plain data, so a server page can hand them to a client one", JSON.stringify(JSON.parse(JSON.stringify(cards))) === JSON.stringify(cards));
}

// ── 3. The states ───────────────────────────────────────────────────────────
console.log("Each card state, rendered");
{
  const card = (id: string, b: Cohort | null, seats?: number, quiet = false) =>
    render(createElement(ProgramGroupCard, { group: g(id), block: b ? { ...blockFacts(b), seatsLeft: seats ?? null } : null, quiet }));
  const button = (html: string) => html.match(/<a [^>]*>[\s\S]*?<\/a>/)?.[0] ?? "";

  const open = card("adult-newer", block({ id: "open" }));
  check("open: Open to join, and a lime Enroll to the block's sign-up page, named Enroll in the group", open.includes("Open to join</span>") && lime(button(open)) && /href="\/enroll\/open"/.test(button(open)) && />Enroll<span class="sr-only"> in the Beginner Adult Bootcamp<\/span><\/a>$/.test(button(open)));
  check("open: its four lines read who, the dates, the class days, where", words(open).includes("16 and up Jan 10 – Feb 14 Sundays 4–5pm Newtonbrook Tennis Club"));
  check("the dates are the strongest line, white and medium; who stays a step softer", open.includes('<li id="adult-newer-dates" class="flex items-start gap-2 font-medium text-white">') && open.includes('<li class="flex items-start gap-2 text-white/90">'));
  const twice = card("adult-newer", block({ id: "twice", sessions: [{ day: "Sun", start: "16:00", end: "17:00" }, { day: "Wed", start: "16:00", end: "17:00" }] }));
  check("twice a week: one card, both days on its days line, the class count with the price", words(twice).includes("Sundays and Wednesdays 4–5pm") && count(twice, "<li") === 4 && twice.includes(` classes over ${cohortLengthFor(COHORT_WEEKS)}</span>`));
  const low = card("youth-11-15", youthBlock({ id: "low", levelMin: 2, levelMax: 2.5, sessions: [{ day: "Sat", start: "13:00", end: "14:00" }] }), 2);
  check("last spots: the warn chip with the count, and Enroll", low.includes(">2 spots left</span>") && low.includes("text-yellow-200") && lime(button(low)) && />Enroll</.test(button(low)));
  const full = card("adult-intermediate", block({ id: "full", levelMin: 3, levelMax: 3.5 }), 0);
  check("full: Full, and an outline Notify me to the newsletter line, never the sign-up page", full.includes(">Full</span>") && !lime(button(full)) && /href="#notify"/.test(button(full)) && />Notify me<span class="sr-only"> when the Intermediate Adult Bootcamp has a spot<\/span>/.test(button(full)) && !full.includes("/enroll"));
  const hp = card("high-performance", youthBlock({ id: "hp", levelMin: 5, levelMax: 7, sessions: [{ day: "Sat", start: "14:00", end: "15:00" }] }));
  check("by approval: By approval, and an outline Ask to join to the same sign-up page", hp.includes("By approval</span>") && !lime(button(hp)) && /href="\/enroll\/hp"/.test(button(hp)) && />Ask to join<span class="sr-only"> the High Performance Youth Bootcamp<\/span>/.test(button(hp)));
  const dateless = card("youth-7-10", null);
  check("no open block: Dates coming soon where the dates go", DATES_COMING_SOON === "Dates coming soon" && dateless.includes(`</svg>${DATES_COMING_SOON}</li>`) && words(dateless).includes("Ages 7–10 Dates coming soon Saturdays 12–1pm Newtonbrook Tennis Club"));
  check("…its button names the group and what it waits for", !lime(button(dateless)) && /href="#notify"/.test(button(dateless)) && />Notify me<span class="sr-only"> when the Beginner Junior Bootcamp has dates<\/span>/.test(button(dateless)) && !dateless.includes("Open to join") && !dateless.includes("/enroll"));
  check("every button is named for its group and a dated one is described by its dates", /aria-describedby="adult-newer-dates"/.test(button(open)) && !/aria-describedby/.test(button(dateless)));
  check("one link per card in every state", [open, twice, low, full, hp, dateless].every((html) => count(html, "<a ") === 1));
  const quiet = card("adult-newer", block({ id: "open" }), undefined, true);
  check("drawn quiet (the dashboard), Enroll is an outline, the same words to the same page", !lime(button(quiet)) && /href="\/enroll\/open"/.test(button(quiet)) && />Enroll</.test(button(quiet)));
}

// ── 4. Signed in, rendered ──────────────────────────────────────────────────
console.log("Signed in: the open blocks, never a by-approval one, or one plain line");
{
  const open = block({ id: "beg-sun" });
  const hpBlock = youthBlock({ id: "hp", levelMin: 5, levelMax: 7, sessions: [{ day: "Sat", start: "14:00", end: "15:00" }] });
  const all = groupCards(programGroups, [open, hpBlock]);
  check("a by-approval block is left out of the signed-in list: its Ask to join would lead back to it", ids(signedInOpenCards(all)) === "adult-newer");

  // The quiz's already-taken panel.
  const panel = (cards: readonly GroupCard[], playerCount = 1, players: AgePlayer[] = []) =>
    render(createElement(AlreadyTakenPanel, { playerCount, cards, players, onAdd: () => {}, onRetake: () => {} }));
  const withBlocks = panel(all);
  check("the quiz panel with open blocks: one line with the two paths, then Groups with dates and the cards", twoPathsLine("you") === "Pick a group with dates and enroll now, or our coaches place you from your quiz answers." && withBlocks.includes(`>${twoPathsLine("you")}</p>`) && withBlocks.includes(`>${OPEN_GROUPS_HEADING}</h2>`) && count(withBlocks, "<article") === 1 && />Enroll</.test(linkTo(withBlocks, "/enroll/beg-sun")));
  check("…never the by-approval block", !withBlocks.includes("High Performance Youth Bootcamp") && !withBlocks.includes("/enroll/hp"));
  check("…no card inside a card: the panel drops its own card while it lists cards", !withBlocks.includes("md:rounded-3xl"));
  check("…Enroll leads: the dashboard button is an outline beside it", lime(linkTo(withBlocks, "/enroll/beg-sun")) && linkTo(withBlocks, "/intake") !== "" && !lime(linkTo(withBlocks, "/intake")));
  check("…and nothing says there is nothing else to do", !/nothing else you need to do/.test(withBlocks));
  check("a household reads by its count", panel(all, 3).includes(`>${twoPathsLine("your 3 players")}</p>`));
  const noBlocks = panel([]);
  const onlyHp = panel(groupCards(programGroups, [hpBlock]));
  check("with none listed: the panel keeps its card, its sentence and one plain line", [noBlocks, onlyHp].every((html) => html.includes("md:rounded-3xl") && html.includes("There is nothing else you need to do unless something changed.") && !html.includes("border-dashed") && !html.includes("<article")));
  check("…No group has dates yet only when no block is open at all", noBlocks.includes(`>${NO_DATES_LINE}</p>`) && !onlyHp.includes(NO_DATES_LINE));
  check("…blocks open but none for them (a by-approval one alone): it says so, for one player or a household", onlyHp.includes(`>${noOpenGroupLine("you")}</p>`) && panel(groupCards(programGroups, [hpBlock]), 2).includes(`>${noOpenGroupLine("your players")}</p>`));
  // The household's ages, as the dashboard reads them (accountOpenCards).
  const novicePanel = youthBlock({ id: "nov-panel", levelMin: 2, levelMax: 2.5, sessions: [{ day: "Sat", start: "13:00", end: "14:00" }] });
  const mixed = groupCards(programGroups, [open, novicePanel]);
  const adultOnly = panel(mixed, 1, [{ age_band: "adult", is_minor: false }]);
  const juniorOnly = panel(mixed, 1, [{ age_band: "junior", is_minor: true }]);
  check("the quiz panel lists only the blocks whose ages take one of the household's players", count(adultOnly, "<article") === 1 && adultOnly.includes("/enroll/beg-sun") && !adultOnly.includes("/enroll/nov-panel") && count(juniorOnly, "<article") === 1 && juniorOnly.includes("/enroll/nov-panel") && !juniorOnly.includes("/enroll/beg-sun"));
  const adultsNoFit = panel(groupCards(programGroups, [novicePanel]), 1, [{ age_band: "adult", is_minor: false }]);
  check("…and with blocks open for other ages only, the panel says none is open to them", adultsNoFit.includes(`>${noOpenGroupLine("you")}</p>`) && !adultsNoFit.includes(NO_DATES_LINE) && !adultsNoFit.includes("<article") && /<a [^>]*href="\/programs"[^>]*>Browse Programs →<\/a>/.test(adultsNoFit));
  check("…a link to the groups, and the dashboard button the one lime action", /<a [^>]*href="\/programs"[^>]*>Browse Programs →<\/a>/.test(noBlocks) && lime(linkTo(noBlocks, "/intake")));
  check("…promising nothing the site does not do: no email when a block opens", !/email|notify|tell you|we&#x27;ll|we will|let you know/i.test(words(noBlocks).replace("Retake the quiz", "")));

  // The dashboard's list, as the dashboard draws it (quiet: its one primary is the next step).
  const dash = render(createElement(OpenGroupsList, { cards: all, quiet: true }));
  const links = dash.match(/<a [^>]*>/g) ?? [];
  check("the dashboard's list: the same cards, every button an outline, never the by-approval block", count(dash, "<article") === 1 && links.length > 0 && links.every((a) => !a.includes("bg-[#B4E655]")) && />Enroll</.test(linkTo(dash, "/enroll/beg-sun")) && !dash.includes("/enroll/hp"));
  const dashEmpty = render(createElement(OpenGroupsList, { cards: [], quiet: true }));
  check("…with none: the dashed box, the one line and the link to the groups", dashEmpty.includes("border-dashed") && dashEmpty.includes(`>${NO_DATES_LINE}</p>`) && /<a [^>]*href="\/programs"[^>]*>Browse Programs →<\/a>/.test(dashEmpty) && !/email|tell you|let you know/i.test(dashEmpty));
  const dashNoFit = render(createElement(OpenGroupsList, { cards: [], quiet: true, blocksOpen: true, whom: "Maya" }));
  check("…with blocks open but none for the account: the line that is true, by name, and the link", dashNoFit.includes("border-dashed") && dashNoFit.includes(`>${noOpenGroupLine("Maya")}</p>`) && !dashNoFit.includes(NO_DATES_LINE) && /<a [^>]*href="\/programs"[^>]*>Browse Programs →<\/a>/.test(dashNoFit));
  check("the heading over the open blocks, and the two lines with none listed", OPEN_GROUPS_HEADING === "Groups with dates" && NO_DATES_LINE === "No group has dates yet." && noOpenGroupLine("you") === "No group with dates is open to you right now." && noOpenGroupLine("your players") === "No group with dates is open to your players right now.");

  // Which open blocks an account sees: not one it is in; ages only.
  const novice = youthBlock({ id: "nov-sat", levelMin: 2, levelMax: 2.5, sessions: [{ day: "Sat", start: "13:00", end: "14:00" }] });
  const advanced = block({ id: "adv-sun", levelMin: 4, levelMax: 4.5, sessions: [{ day: "Sun", start: "18:00", end: "19:00" }] });
  const pool = groupCards(programGroups, [open, hpBlock, novice, advanced]);
  const adult = { age_band: "adult", is_minor: false };
  const teen = { age_band: "teen", is_minor: true };
  const junior = { age_band: "junior", is_minor: true };
  const seen = (players: { age_band?: string | null; is_minor: boolean }[], enrolled: string[] = []) =>
    accountOpenCards(pool, { enrolledCohortIds: enrolled, players }).map((c) => c.block!.cohortId).join(",");
  check("an adult-only household sees no youth group, and every adult block whatever its level", seen([adult]) === "beg-sun,adv-sun", seen([adult]));
  const beginnerAdult = { ...adult, level: 1 };
  check("…the level never filters: a Beginner adult still sees the Advanced block", seen([beginnerAdult]) === "beg-sun,adv-sun");
  check("a junior sees the youth blocks whose ages take juniors, and no adult group", seen([junior]) === "nov-sat", seen([junior]));
  check("a teen sees the youth block that takes 14 and 15, and the 16-and-up adult blocks", seen([teen]) === "nov-sat,beg-sun,adv-sun", seen([teen]));
  check("a household sees what fits any of its players; a player with no band reads as under 18 (so 16 and up still fits) or 18 and up", seen([adult, junior]) === "nov-sat,beg-sun,adv-sun" && seen([{ is_minor: true }]) === "nov-sat,beg-sun,adv-sun" && seen([{ is_minor: false }]) === "beg-sun,adv-sun" && !groupTakesPlayerAge(g("youth-7-10"), { is_minor: false }));
  check("a block the account is already in drops out", seen([adult], ["beg-sun"]) === "adv-sun");
  check("by approval stays out, whoever fits it", !seen([teen]).includes("hp") && !seen([]).includes("hp"));
  check("an account with no player on file sees every open block but the by-approval one", seen([]) === "nov-sat,beg-sun,adv-sun");

  const dashPage = read("src/app/dashboard/page.tsx");
  check("the dashboard page: the account's open blocks, by its enrollments and its players", dashPage.includes("const allOpenGroups = openBlockCards(groupCards(programGroups, publicBlocks, blockSeats));") && dashPage.includes("accountOpenCards(allOpenGroups, {") && dashPage.includes("    enrolledCohortIds,") && dashPage.includes("players: roster.length > 0 ? roster : players,"));
  check("…whether any block is open at all, for the line with none listed, and whether the list shows one, for the next step", dashPage.includes("anyGroupOpen={allOpenGroups.length > 0}") && dashPage.includes("groupsBelow: openGroups.length > 0,"));
  const view = read("src/app/dashboard/DashboardView.tsx");
  check("the dashboard view draws them quiet under Groups with dates, under My programs", view.includes('<SectionHeading id="open-groups" title={OPEN_GROUPS_HEADING} />') && /<OpenGroupsList\s+cards=\{openGroups\}\s+quiet\s+blocksOpen=\{anyGroupOpen\}\s+whom=\{several \? "your players" : \(names\[0\] \?\? "you"\)\}\s+\/>/.test(view) && at(view, 'id="my-programs"') < at(view, 'id="open-groups"') && at(view, 'id="open-groups"') < at(view, 'id="open-for-tier"'));

  // Suggested for you never repeats a listed block (fix round 2).
  const suggestions = listedPrograms.map((program) => ({ program, fit: null }));
  const listed = accountOpenCards(groupCards(programGroups, [open, hpBlock]), { enrolledCohortIds: [], players: [] });
  const kept = suggestionsBesideCards(suggestions, listed).map((s) => s.program.id).join(",");
  check("a program whose groups with dates are listed is left out of Suggested for you; every other stays", kept === listedPrograms.filter((p) => p.id !== "bootcamps").map((p) => p.id).join(","), kept);
  check("…with none listed, every suggestion stays, and a group with no block lists nothing", suggestionsBesideCards(suggestions, []).length === suggestions.length && suggestionsBesideCards(suggestions, groupCards(programGroups, [])).length === suggestions.length && suggestionsBesideCards(suggestions, groupCards(programGroups, [hpBlock]).filter((c) => c.block === null)).length === suggestions.length);
  check("the dashboard page takes them out beside the list it shows", /suggestionsBesideCards\(\s*suggestProgramsFor\(roster, listedPrograms, enrolledProgramIds\),\s*openGroups\s*\)/.test(dashPage));
  const suggested = view.slice(at(view, 'aria-labelledby="suggested"'));
  check("…and its cards carry no block in the old format: no Next row, no Next cohort chip", suggested.includes("<ProgramCardList") && !suggested.includes("publicCohorts") && !view.includes("isCohortPublic"));

  // The next step above them names the groups below only when the list
  // shows one (fix round 2); with none, it keeps the old sentence.
  const player = (id: string, level: number | null) => ({ id, relationship: id === "self" ? "self" : "child", full_name: id === "self" ? "Dana Reyes" : "Maya Reyes", level });
  const step = (roster: ReturnType<typeof player>[], voice: "you" | "named", groupsBelow?: boolean) =>
    nextStepFor({ selfId: "self", roster, voice, enrollments: [], cohorts: [], sessionsByCohort: {}, programs: [], invites: [], bookings: [], recipientEmail: "info@tennisbootcamp.ca", today: "2026-11-20", now: "2026-11-20T12:00:00Z", groupsBelow } as NextStepInput);
  const rosters: [ReturnType<typeof player>[], "you" | "named"][] = [[[player("self", null)], "you"], [[player("self", 3)], "you"], [[player("self", null), player("kid", null)], "named"], [[player("self", 3), player("kid", 2)], "named"]];
  const withGroups = rosters.map(([r, v]) => step(r, v, true));
  const withoutGroups = rosters.map(([r, v]) => step(r, v, false));
  const unflagged = rosters.map(([r, v]) => step(r, v));
  check("with groups listed below, the next step offers them instead of saying there is nothing else to do, in every placing state", withGroups.every((s) => s.detail.startsWith("Or pick a group with dates below.") && !/nothing else you need to do/i.test(s.detail)) && withGroups.map((s) => s.kind).join() === "placing,placed,placing,placed");
  check("with none listed, it keeps the old sentence, word for word", [...withoutGroups, ...unflagged].every((s) => s.detail.startsWith("There is nothing else you need to do. ") && !s.detail.includes("pick a group")) && withoutGroups.every((s, i) => s.detail === unflagged[i].detail && s.detail === withGroups[i].detail.replace("Or pick a group with dates below.", "There is nothing else you need to do.")) && withoutGroups[1].detail === "There is nothing else you need to do. Your group, dates and price land here once they are set." && withoutGroups[3].detail === "There is nothing else you need to do. Groups, dates and prices land here once they are set.");
}

// ── 5. What the pages say about their cards ─────────────────────────────────
console.log("Every heading, count, day list and next-start line reads the cards shown");
{
  const youthPlanned = programGroups.filter((x) => x.programSlug === "youth-programs");
  const adultPlanned = programGroups.filter((x) => x.programSlug === "bootcamps");
  const ordinaryYouth = groupCards(youthPlanned, []);
  check("the ordinary lineup reads as before", cardsHeading(ordinaryYouth) === "Three groups on Saturdays" && cardsScheduleLine(ordinaryYouth) === `${COHORT_LENGTH_ADJ.charAt(0).toUpperCase()}${COHORT_LENGTH_ADJ.slice(1)} cohorts · Saturdays 12:00, 1:00 and 2:00` && cardsProgramLine(ordinaryYouth) === "Saturdays · ages 7–17" && cardsNextStart(ordinaryYouth) === null);
  const intermediateYouth = youthBlock({ id: "int-youth", startDate: "2026-12-05", levelMin: 3, levelMax: 3.5, sessions: [{ day: "Sat", start: "15:00", end: "16:00" }, { day: "Wed", start: "18:00", end: "19:00" }] });
  const novice = youthBlock({ id: "nov", levelMin: 2, levelMax: 2.5, sessions: [{ day: "Sat", start: "13:00", end: "14:00" }] });
  const youth = groupCards(youthPlanned, [novice, intermediateYouth]);
  check("a block off the lineup counts, and its days join the list", cardsHeading(youth) === "Four groups on Saturdays and Wednesdays" && cardsDaysLabel(youth) === "Saturdays and Wednesdays" && cardsProgramLine(youth) === "Saturdays and Wednesdays · ages 7–17");
  check("the next start is the earliest first class the cards show", cardsNextStart(youth) === "2026-12-05");
  check("the schedule line lists each day's starts, earliest first", cardsScheduleLine(youth).endsWith(" · Saturdays 12:00, 1:00, 2:00 and 3:00 · Wednesdays 6:00"), cardsScheduleLine(youth));
  check("the level tags follow the cards: a block at a level the lineup lacks adds its tag", JSON.stringify(cardsLevelTags(youth)) === "[1,2,3,5]" && JSON.stringify(cardsLevelTags(ordinaryYouth)) === "[1,2,5]");
  const adult = groupCards(adultPlanned, [block({ id: "a1" }), block({ id: "a2", startDate: "2027-02-21", sessions: [{ day: "Sun", start: "16:00", end: "17:00" }, { day: "Wed", start: "16:00", end: "17:00" }] })]);
  check("two blocks of one group are one group with two date options: three groups over four cards", adult.length === 4 && cardsHeading(adult) === "Three groups on Sundays and Wednesdays" && cardsNextStart(adult) === "2027-01-10");
  check("one group reads in the singular, with one block or two", cardsHeading(groupCards([g("adult-newer")], [])) === "One group on Sundays" && cardsHeading(groupCards([g("adult-newer")], [block({ id: "b1" }), block({ id: "b2", startDate: "2027-03-07" })])) === "One group on Sundays");

  // The price above the cards (fix rounds 2 and 3): every card the page
  // shows counts, with dates or without; one price when they all share it,
  // "from" the lowest when they differ, each short, with its class count.
  const settingShort = `${formatDollars(COHORT_TOTAL)} for ${COHORT_WEEKS} classes`;
  check("no open block: every card at the setting's price, so that price, short, with its class count", cardsPrice(groupCards(adultPlanned, []), PRICE_SUMMARY) === settingShort);
  check("every card at one price, blocks and cards with no dates alike: that price", cardsPrice(groupCards(adultPlanned, [block({ id: "s1" }), block({ id: "s2", levelMin: 3, levelMax: 3.5 })]), PRICE_SUMMARY) === settingShort);
  const dearer = groupCards(adultPlanned, [block({ id: "dear", weeks: 8, priceCents: 28000 })]);
  check("one open block at $280 beside cards with no dates at the setting's price: from the lowest, never the block's price alone", dearer.filter((c) => c.block === null).length === 2 && cardsPrice(dearer, PRICE_SUMMARY) === `from ${settingShort}`, cardsPrice(dearer, PRICE_SUMMARY));
  check("blocks at different prices: from the lowest, with its class count", cardsPrice(adult, PRICE_SUMMARY) === `from ${settingShort}` && cardsPrice(groupCards([g("adult-newer")], [block({ id: "p1", weeks: 8, priceCents: 28000 }), block({ id: "p2", weeks: 8, priceCents: 56000, sessions: [{ day: "Sun", start: "16:00", end: "17:00" }, { day: "Wed", start: "16:00", end: "17:00" }] })]), PRICE_SUMMARY) === "from $280 for 8 classes");
  check("…a block with no price set never makes the lowest, and no amount at all reads the setting's line", cardsPrice(groupCards([g("adult-newer")], [block({ id: "tba", priceCents: 0 }), block({ id: "p3", weeks: 8, priceCents: 28000 })]), PRICE_SUMMARY) === "$280 for 8 classes" && cardsPrice(groupCards([g("adult-newer")], [block({ id: "tba2", priceCents: 0 })]), PRICE_SUMMARY) === PRICE_SUMMARY);
  check("…one class reads in the singular, and the price box stays short: no length, no per-session figure", cardsPrice(groupCards([g("adult-newer")], [block({ id: "one", weeks: 1, priceCents: 3500 })]), PRICE_SUMMARY) === "$35 for 1 class" && ![settingShort, cardsPrice(dearer, PRICE_SUMMARY)].some((t) => / over |week|session/i.test(t)));

  const detail = read("src/app/programs/[slug]/page.tsx");
  check("program pages: the heading, the summary days, the schedule line, the next start and the level tags read the cards", detail.includes('const groupsHeading = cards.length > 0 ? cardsHeading(cards) : "Groups";') && detail.includes("const days = cardsDaysLabel(cards);") && detail.includes("const scheduleLine = cards.length > 0 ? cardsScheduleLine(cards) : program.schedule;") && detail.includes("const nextStart = cardsNextStart(cards);") && detail.includes("Next cohort starts {formatStartDate(nextStart)}") && detail.includes("cardsLevelTags(cards)") && !detail.includes("scheduledGroups.length === 3") && !detail.includes("nextOpenCohort"));
  check("program pages: no list under the groups repeats the open blocks", !detail.includes("openCohorts.map((cohort)") && !detail.includes("Spots open") && detail.includes("{!arranged && !hasOpenCohorts && ("));
  check("program pages: the phone line and the panel's price sentence read the cards' price", detail.includes("cardsPrice(cards, program.priceSummary)") && detail.includes("priceLineFor(") && detail.includes("const summary = summaryFacts(program, cards);"));
  // /programs with no block open anywhere (fix round 3): every card reads
  // "Notify me", so the lead says dates are coming and what the button does,
  // promising what the newsletter line promises and nothing more.
  const programsSrc = read("src/app/programs/page.tsx");
  check("/programs: with an open block the lead says Pick your group and enroll, as the card's button does; with none it says dates are coming", programsSrc.includes("const anyOpen = openBlockCards(cards).length > 0;") && programsSrc.includes('{anyOpen ? "Pick your group and enroll." : PROGRAMS_NO_DATES_LINE}'));
  check("…in one plain line: the next dates are coming, and Notify me brings an email when a new cohort opens", PROGRAMS_NO_DATES_LINE === `The next dates are coming. Choose ${NOTIFY_LABEL} and we'll email you when a new cohort opens.`);
  check("…in words for any screen, with no tap and no click, and a promise exactly as narrow as the newsletter line it leads to", !/\b(tap|click|press)\b/i.test(PROGRAMS_NO_DATES_LINE) && PROGRAMS_NO_DATES_LINE.endsWith(" when a new cohort opens.") && read("src/components/sections/EmailCapture.tsx").includes("Be first to know when a new cohort opens."));
  check("…naming the cohort, not the block, and promising no spot, no hold and no date", !/\bblock\b|spot|hold|first|guarantee|soon/i.test(PROGRAMS_NO_DATES_LINE));
  // The programs' own words never contradict the cards (fix round 2): no
  // weekday and no count of groups or levels in a description, a search
  // line, a long description, a level line or a caption, nor in the
  // /programs search line. The cards say which groups are open, and when.
  const WEEKDAY = /\b(mon|tues|wednes|thurs|fri|satur|sun)days?\b/i;
  const GROUP_COUNT = /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d+)\s+(?:[a-z]+\s+)?(groups?|levels?)\b/i;
  const programWords = listedPrograms.flatMap((p) => [p.description, p.metaDescription ?? "", p.longDescription, p.levelNote ?? "", p.plateCaption ?? ""]).concat(PROGRAMS_DESCRIPTION);
  check("no program description names a weekday or a count of groups", programWords.every((w) => !WEEKDAY.test(w) && !GROUP_COUNT.test(w)), programWords.find((w) => WEEKDAY.test(w) || GROUP_COUNT.test(w)));
  check("…and the check catches the old lines", ["Tennis and fitness in every class: three Saturday groups for ages 7–17.", "three levels back to back", "youth on Saturdays, adults on Sundays."].every((w) => WEEKDAY.test(w) || GROUP_COUNT.test(w)));
  const catalog = read("src/components/sections/ProgramCatalog.tsx");
  check("/programs: each program's line reads its cards", catalog.includes("{cardsProgramLine(cards)}") && catalog.includes("all: cards.filter((c) => c.group.programSlug === program.slug),") && !catalog.includes("programHeadingLine("));
}

// ── The pages and the quiz's data ───────────────────────────────────────────
console.log("The pages build their cards from the open blocks");
{
  const programsPage = read("src/app/programs/page.tsx");
  const detail = read("src/app/programs/[slug]/page.tsx");
  check("/programs: every card from groupCards", programsPage.includes("groupCards(programGroups, publicCohorts, seats)") && programsPage.includes("cards={cards}"));
  check("program pages: the program's cards, with their blocks", detail.includes("groupCards(groups, openCohorts, seatCounts)") && detail.includes("block={block}"));
  check("the home page shows no group card and no price", !read("src/app/page.tsx").includes("ProgramGroupCard"));
  const layout = read("src/app/intake/layout.tsx");
  check("the quiz's layout reads the public blocks on the server and hands every open one to the page", layout.includes("await getPublicCohorts()") && layout.includes("await readBlockSeats(publicCohorts)") && layout.includes("openBlockCards(groupCards(programGroups, publicCohorts, seats))") && layout.includes("<OpenGroupsProvider cards={cards}>{children}</OpenGroupsProvider>") && /export const revalidate = 60;/.test(layout));
  const intake = read("src/app/intake/page.tsx");
  check("the quiz page hands the panel the blocks and the household's ages, and reads none over the network", intake.includes("const openGroups = useOpenGroups();") && intake.includes("cards={openGroups}") && intake.includes("players={household.participants.map((p) => ({ age_band: p.ageBand ?? null, is_minor: p.isMinor }))}") && !/fetch\(["'`]\/api\/(cohorts|blocks|groups|open)/.test(intake));
  const panelSrc = read("src/components/quiz/AlreadyTakenPanel.tsx");
  check("the panel filters them as the dashboard does", panelSrc.includes("accountOpenCards(cards, { enrolledCohortIds: [], players })"));
  const card = read("src/components/sections/ProgramGroupCard.tsx");
  check("the card types no amount, no length and no day name of its own", !/\$\d/.test(card) && !/\b(Sundays|Saturdays|Wednesdays)\b/.test(card.replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, "")));
  const pkg = JSON.parse(read("package.json")) as { scripts: { test: string } };
  check("npm test runs this file", pkg.scripts.test.includes("npx tsx src/scripts/test-group-blocks.ts"));
}

if (failed > 0) {
  console.log(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll group block checks passed.");
