// Run from project root: npx tsx src/scripts/test-group-blocks.ts
//
// Pins backlog #85 (owner, 2026-11-19: "you should be able to sign up and pay
// for a group not just ask to join. Also when I am already signed in it just
// tell me I already submitted request."; 2026-11-20: "There should also be a
// date outlined on the card ... some groups may run twice a week later"):
//   1. one group card per open block, matched to its planned group by
//      program and level, never by day or time; a block that matches no
//      planned group still shows, built from its own program and level; two
//      blocks of one group are two cards;
//   2. what a card takes from its block: the dates from the first class to
//      the last ("Jan 11 – Feb 15", the year only across a new year), the
//      class days and times ("Sundays 4–5pm", "Sundays and Wednesdays
//      4–5pm"), the price and length, the seats;
//   3. the card's states and its one button: "Join" to the block's sign-up
//      page, "Ask to join" by approval, "Notify me" when full, and "Dates
//      coming soon" with "Notify me" for a group with no open block (the
//      owner's decision, 2026-11-20);
//   4. the signed-in screens, the quiz's already-taken panel and the
//      dashboard, with and without open blocks.
// Checks that read source text accept either line ending (`read`). Exits
// non-zero on any failure. Never spells the cohort length or total.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  COHORT_TOTAL,
  COHORT_TOTAL_CENTS,
  COHORT_WEEKS,
  PRICE_SUMMARY,
  SESSION_PRICE_LABEL,
  cohortLengthFor,
  formatDollars,
  groupById,
  numberInWords,
  priceSummaryFor,
  programGroups,
} from "../content/programs";
import {
  blockClassDates,
  blockFacts,
  blockLevel,
  blockPrice,
  groupCards,
  isBootcampBlock,
  openBlockCards,
  plannedGroupForBlock,
  type GroupCard,
} from "../lib/groupBlocks";
import {
  DATES_COMING_SOON,
  formatBlockDates,
  formatClassDays,
  formatClassHours,
  groupClassDays,
  priceParts,
} from "../lib/programCatalog";
import { ProgramGroupCard } from "../components/sections/ProgramGroupCard";
import { NO_DATES_LINE, OPEN_GROUPS_HEADING, OpenGroupsList } from "../components/sections/OpenGroups";
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
const at = (hay: string, needle: string) => hay.indexOf(needle);
const count = (hay: string, needle: string) => hay.split(needle).length - 1;
const render = (el: React.ReactElement) => renderToStaticMarkup(el);
/** The words a piece of markup shows, in order. */
const words = (html: string) => html.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const ids = (cards: readonly GroupCard[]) => cards.map((c) => c.group.id).join(",");
const g = (id: string) => groupById(id)!;

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

// ── 2. The dates ────────────────────────────────────────────────────────────
console.log("The dates: the first class to the last, in the site's short style");
check("same year: two dates and an en dash", formatBlockDates("2027-01-11", "2027-02-15") === "Jan 11 – Feb 15");
check("across a new year: the year on both dates", formatBlockDates("2026-12-06", "2027-01-10") === "Dec 6, 2026 – Jan 10, 2027");
check("a block of one class: its one date", formatBlockDates("2027-01-11", "2027-01-11") === "Jan 11");
{
  // Starts on a Monday, trains on Sundays: the first class is the Sunday after.
  const monday = block({ id: "mon-start", startDate: "2027-01-11", weeks: 6 });
  const dates = blockClassDates(monday);
  check("from the first class, not the start date the coach typed, to the last class", dates.first === "2027-01-17" && dates.last === "2027-02-21" && blockFacts(monday).dates === "Jan 17 – Feb 21", JSON.stringify(dates));
  const twice = block({ id: "twice", startDate: "2027-02-21", weeks: 6, sessions: [{ day: "Sun", start: "16:00", end: "17:00" }, { day: "Wed", start: "16:00", end: "17:00" }] });
  check("twice a week: the last class is the last of either day", blockFacts(twice).dates === "Feb 21 – Mar 31");
  const winter = block({ id: "winter", programId: "youth-programs", startDate: "2026-12-05", weeks: 6, sessions: [{ day: "Sat", start: "15:00", end: "16:00" }] });
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
console.log("The price: the block's own total over its own length");
check("the whole price from a total and a length", priceSummaryFor(280, 8) === "$280 for eight weeks" && cohortLengthFor(1) === "one week" && cohortLengthFor(13) === "13 weeks");
check("the planned groups' price is the same sentence from the setting", PRICE_SUMMARY === priceSummaryFor(COHORT_TOTAL, COHORT_WEEKS) && PRICE_SUMMARY === `${formatDollars(COHORT_TOTAL)} for ${numberInWords(COHORT_WEEKS)} weeks`);
check("a block priced at the setting reads the setting's words", blockPrice(block({ id: "set" })) === PRICE_SUMMARY);
check("a block of its own length and total reads its own", blockPrice(block({ id: "long", weeks: 8, priceCents: 28000 })) === "$280 for eight weeks" && blockPrice(block({ id: "half", weeks: 3, priceCents: 10500 })) === "$105 for three weeks");
check("a block with no price set says so, never $0", blockPrice(block({ id: "free", priceCents: 0 })) === "Pricing TBA");
{
  const html = render(createElement(ProgramGroupCard, { group: g("adult-newer"), block: blockFacts(block({ id: "long", weeks: 8, priceCents: 28000 })) }));
  const [lead, rest] = priceParts("$280 for eight weeks");
  check("the card shows the block's total in bold over its length, never a per-session figure", html.includes(`>${lead}</span>`) && html.includes(`>${rest}</span>`) && !html.includes(PRICE_SUMMARY.split(" ")[0] + "<") && !/a session|per session/i.test(html) && !html.includes(SESSION_PRICE_LABEL) && count(html, "$") === 1);
}

// ── 1. Matching a block to its group ────────────────────────────────────────
console.log("A block matches its group by program and level, never by day or time");
check("a block's level is the tier its band starts in", blockLevel({ levelMin: 3, levelMax: 3.5 }) === 3 && blockLevel({ levelMin: 5, levelMax: 7 }) === 5 && blockLevel({ levelMin: 3, levelMax: 4.5 }) === 3 && blockLevel({ levelMin: 2, levelMax: null }) === 2);
check("a block built for any level has none: no band, or the whole ladder", blockLevel({ levelMin: null, levelMax: null }) === null && blockLevel({ levelMin: 1, levelMax: 7 }) === null);
check("an Intermediate adult block on Wednesday evenings is the Intermediate Adult Bootcamp", plannedGroupForBlock(block({ id: "wed", levelMin: 3, levelMax: 3.5, sessions: [{ day: "Wed", start: "18:00", end: "19:00" }] }), programGroups)?.id === "adult-intermediate");
check("a Novice youth block in the Beginner Junior Bootcamp's Saturday slot is still the Novice Youth Bootcamp", plannedGroupForBlock(block({ id: "slot", programId: "youth-programs", levelMin: 2, levelMax: 2.5, sessions: [{ day: "Sat", start: "12:00", end: "13:00" }] }), programGroups)?.id === "youth-11-15");
check("a block of another program never matches", plannedGroupForBlock(block({ id: "other", programId: "youth-programs", levelMin: 3, levelMax: 3.5 }), programGroups) === undefined && plannedGroupForBlock(block({ id: "adult-hp", levelMin: 5, levelMax: 7 }), programGroups) === undefined);
check("only the bootcamp programs' blocks with a class show as cards", isBootcampBlock(block({ id: "a" })) && isBootcampBlock(block({ id: "y", programId: "youth-programs" })) && !isBootcampBlock(block({ id: "p", programId: "private-lessons" })) && !isBootcampBlock(block({ id: "r", programId: "high-performance" })) && !isBootcampBlock(block({ id: "s", sessions: [] })) && !isBootcampBlock(block({ id: "t", programId: "toString" })));

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
  check("each reads its own dates and days", beg[0].block?.dates === "Jan 10 – Feb 14" && beg[0].block?.days === "Sundays 4–5pm" && beg[1].block?.days === "Sundays and Wednesdays 4–5pm");
  check("card ids are unique on a page, so each anchor lands on one card", new Set(cards.map((c) => c.group.id)).size === cards.length);
  check("the rest of the lineup keeps its cards in order, around them", ids(cards) === "youth-7-10,youth-11-15,high-performance,adult-newer,adult-newer-2,adult-intermediate,adult-advanced,private-lessons");
  check("from the lineup a card takes the program, the level tag, the title and the ages", beg.every((c) => c.group.programSlug === "bootcamps" && c.group.level === 1 && c.group.ageMin === 16 && c.group.ageMax === null));
  check("from the block it takes its class day and time, its location and its price", beg[0].group.day === "Sunday" && beg[0].group.start === "16:00" && beg[0].group.locationId === "newtonbrook" && beg[0].group.price === PRICE_SUMMARY);
  check("the cards that show a block are what the signed-in screens list", ids(openBlockCards(cards)) === "adult-newer,adult-newer-2");

  const intermediateYouth = block({ id: "int-youth", programId: "youth-programs", startDate: "2026-12-05", levelMin: 3, levelMax: 3.5, sessions: [{ day: "Sat", start: "15:00", end: "16:00" }, { day: "Wed", start: "18:00", end: "19:00" }] });
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
  const card = (id: string, b: Cohort | null, seats?: number) =>
    render(createElement(ProgramGroupCard, { group: g(id), block: b ? { ...blockFacts(b), seatsLeft: seats ?? null } : null }));
  const button = (html: string) => html.match(/<a [^>]*>[\s\S]*?<\/a>/)?.[0] ?? "";
  const lime = (html: string) => /bg-\[#B4E655\]/.test(button(html));

  const open = card("adult-newer", block({ id: "open" }));
  check("open: Open to join, and a lime Join to the block's sign-up page", open.includes("Open to join</span>") && lime(open) && /href="\/enroll\/open"/.test(button(open)) && />Join<span class="sr-only"> the Beginner Adult Bootcamp<\/span><\/a>$/.test(button(open)));
  check("open: its four lines read who, the dates, the class days, where", words(open).includes("16 and up Jan 10 – Feb 14 Sundays 4–5pm Newtonbrook Tennis Club"));
  const twice = card("adult-newer", block({ id: "twice", sessions: [{ day: "Sun", start: "16:00", end: "17:00" }, { day: "Wed", start: "16:00", end: "17:00" }] }));
  check("twice a week: one card, both days on its days line", words(twice).includes("Sundays and Wednesdays 4–5pm") && count(twice, "<li") === 4);
  const low = card("youth-11-15", block({ id: "low", programId: "youth-programs", levelMin: 2, levelMax: 2.5, sessions: [{ day: "Sat", start: "13:00", end: "14:00" }] }), 2);
  check("last spots: the warn chip with the count, and Join", low.includes(">2 spots left</span>") && low.includes("text-yellow-200") && lime(low) && />Join</.test(button(low)));
  const full = card("adult-intermediate", block({ id: "full", levelMin: 3, levelMax: 3.5 }), 0);
  check("full: Full, and an outline Notify me to the newsletter line, never the sign-up page", full.includes(">Full</span>") && !lime(full) && /href="#notify"/.test(button(full)) && />Notify me<span class="sr-only"> when the Intermediate Adult Bootcamp has a spot<\/span>/.test(button(full)) && !full.includes("/enroll"));
  const hp = card("high-performance", block({ id: "hp", programId: "youth-programs", levelMin: 5, levelMax: 7, sessions: [{ day: "Sat", start: "14:00", end: "15:00" }] }));
  check("by approval: By approval, and an outline Ask to join to the same sign-up page", hp.includes("By approval</span>") && !lime(hp) && /href="\/enroll\/hp"/.test(button(hp)) && />Ask to join<span class="sr-only"> the High Performance Youth Bootcamp<\/span>/.test(button(hp)));
  const dateless = card("youth-7-10", null);
  check("no open block: Dates coming soon where the dates go", DATES_COMING_SOON === "Dates coming soon" && dateless.includes(`</svg>${DATES_COMING_SOON}</li>`) && words(dateless).includes("Ages 7–10 Dates coming soon Saturdays 12–1pm Newtonbrook Tennis Club"));
  check("…its button names the group and what it waits for", !lime(dateless) && /href="#notify"/.test(button(dateless)) && />Notify me<span class="sr-only"> when the Beginner Junior Bootcamp has dates<\/span>/.test(button(dateless)) && !dateless.includes("Open to join") && !dateless.includes("/enroll"));
  check("every button is named for its group and a dated one is described by its dates", /aria-describedby="adult-newer-dates"/.test(button(open)) && open.includes('<li id="adult-newer-dates"') && !/aria-describedby/.test(button(dateless)));
  check("one link per card in every state", [open, twice, low, full, hp, dateless].every((html) => count(html, "<a ") === 1));
}

// ── 4. The signed-in screens ────────────────────────────────────────────────
console.log("Signed in: the open blocks, or one plain line");
{
  const cards = openBlockCards(groupCards(programGroups, [block({ id: "beg-sun" }), block({ id: "hp", programId: "youth-programs", levelMin: 5, levelMax: 7, sessions: [{ day: "Sat", start: "14:00", end: "15:00" }] })]));
  const list = render(createElement(OpenGroupsList, { cards }));
  check("with open blocks: the same cards, each with its button", count(list, "<article") === 2 && list.includes(">High Performance Youth Bootcamp</h3>") && />Join<span class="sr-only"> the Beginner Adult Bootcamp<\/span>/.test(list) && list.includes('href="/enroll/beg-sun"'));
  check("…and no no-dates line", !list.includes(NO_DATES_LINE));
  const empty = render(createElement(OpenGroupsList, { cards: [] }));
  check("with none: one line that says no group has dates yet, and a link to the groups", NO_DATES_LINE === "No group has dates yet." && empty.includes(`>${NO_DATES_LINE}</p>`) && /<a [^>]*href="\/programs"[^>]*>Browse Programs →<\/a>/.test(empty) && !empty.includes("<article"));
  check("…promising nothing the site does not do: no email when a block opens", !/email|notify|tell you|we&#x27;ll|we will|let you know/i.test(empty));
  check("the heading over the open blocks", OPEN_GROUPS_HEADING === "Groups with dates");

  // The dashboard view reads the players module, which is server-only, so it
  // is checked as source: it renders the same list, with or without blocks.
  const view = read("src/app/dashboard/DashboardView.tsx");
  check("the dashboard: Groups with dates, the same list of cards (or the one line), under My programs", view.includes('<SectionHeading id="open-groups" title={OPEN_GROUPS_HEADING} />') && view.includes("<OpenGroupsList cards={openGroups} />") && view.includes("openGroups = [],") && at(view, 'id="my-programs"') < at(view, 'id="open-groups"') && at(view, 'id="open-groups"') < at(view, 'id="open-for-tier"'));

  const intake = read("src/app/intake/page.tsx");
  const panel = intake.slice(at(intake, "function AlreadyTakenPanel("), at(intake, "/** The result screen's chrome"));
  check("the quiz's already-taken panel lists the open blocks from the layout, as the same list", panel.includes("const openGroups = useOpenGroups();") && panel.includes("<OpenGroupsList cards={openGroups}"));
  check("…under the heading when any is open, the one line when none is", /\{anyOpen \? \(\s*<section aria-labelledby="open-groups"[\s\S]*?\{OPEN_GROUPS_HEADING\}[\s\S]*?\) : \(\s*<OpenGroupsList cards=\{openGroups\}/.test(panel));
  check("…and stops saying there is nothing else to do while it offers Join", panel.includes('{!anyOpen && " There is nothing else you need to do unless something changed."}'));
  check("…its dashboard button an outline beside open blocks, the lime one otherwise", panel.includes('<TrackedButton variant={anyOpen ? "secondary" : "primary"}'));
  const layout = read("src/app/intake/layout.tsx");
  check("the quiz's layout reads the public blocks on the server and hands the open ones to the page", layout.includes("await getPublicCohorts()") && layout.includes("await readBlockSeats(publicCohorts)") && layout.includes("openBlockCards(groupCards(programGroups, publicCohorts, seats))") && layout.includes("<OpenGroupsProvider cards={cards}>{children}</OpenGroupsProvider>") && /export const revalidate = 60;/.test(layout));
  check("no new route: the quiz reads no block over the network", !/fetch\(["'`]\/api\/(cohorts|blocks|groups|open)/.test(intake) && !intake.includes("useEffect(() => { fetch"));
  const dashPage = read("src/app/dashboard/page.tsx");
  check("the dashboard reads the open blocks from the cohorts it already has, with one seat read", dashPage.includes("const publicBlocks = cohorts.filter((c) => isCohortPublic(c, today));") && dashPage.includes("readBlockSeats(publicBlocks)") && dashPage.includes("openBlockCards(groupCards(programGroups, publicBlocks, blockSeats))") && dashPage.includes("openGroups={openGroups}"));
}

// ── The pages ───────────────────────────────────────────────────────────────
console.log("The pages build their cards from the open blocks");
{
  const programsPage = read("src/app/programs/page.tsx");
  const detail = read("src/app/programs/[slug]/page.tsx");
  check("/programs: every card from groupCards", programsPage.includes("groupCards(programGroups, publicCohorts, seats)") && programsPage.includes("cards={cards}"));
  check("program pages: the program's cards, with their blocks", detail.includes("groupCards(groups, openCohorts, seatCounts)") && detail.includes("block={block}"));
  check("the home page shows no group card and no price", !read("src/app/page.tsx").includes("ProgramGroupCard"));
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
