// Run from project root: npx tsx src/scripts/test-program-groups.ts
//
// Pins audit PR K (owner decisions 2026-10-12, "Program catalog rebuild"),
// as reshaped by audit PR P (owner 2026-10-13: one level tag per group,
// level-led titles, exact level filter with a Closest fit):
// the group lineup, the /programs age and level filters and their URL, the
// group card and the catalog rendered to markup, the quiz's group-aware
// recommendations and links, the old program URLs' redirects, and the
// program photographs (free licence, credited, 16:10, under the size cap).
// The card and the catalog are pinned as rebuilt for the simpler site
// (backlog #69, owner-approved design 2026-11-17): the short card with one
// button and four states, the seat count behind "Full" and "{n} spots left",
// three dropdowns, a heading row per program, and one row for private lessons.
// Since backlog #85 (owner, 2026-11-19 and 2026-11-20) a card shows one open
// block, with its dates and class days, and its button opens the block's
// sign-up page ("Enroll", owner 2026-11-20); a group with no open block reads "Dates coming soon".
// Exits non-zero on any failure. Never spells the cohort length or total.

import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  COHORT_LENGTH,
  COHORT_TOTAL_CENTS,
  COHORT_TOTAL_LABEL,
  COHORT_WEEKS,
  GROUP_PRICE,
  PRICE_SUMMARY,
  PRIVATE_LESSONS_PRICE,
  SESSION_PRICE_LABEL,
  bootcampTitle,
  groupById,
  groupsForProgram,
  listedPrograms,
  programGroups,
} from "../content/programs";
import { LEGACY_PROGRAM_REDIRECTS } from "../lib/programRedirects";
import {
  AGE_BAND_QUERIES,
  EMPTY_QUERY,
  EXACT_AGES,
  ageQueryFor,
  catalogHref,
  catalogQueryString,
  closestGroups,
  describeQuery,
  filterGroups,
  groupTakesAge,
  groupTakesTier,
  groupTakesTierNear,
  isEmptyQuery,
  parseCatalogQuery,
  quizCatalogHref,
  resultsLine,
  tierDistance,
  tierQueryFor,
} from "../lib/programFilters";
import { groupSummaryLine, groupsFor, matchGroupsLabel, recommendPrograms, recommendationHref } from "../lib/recommend";
import { TIERS, tierById } from "../lib/tiers";
import { ArrangedGroupRow, ProgramGroupCard } from "../components/sections/ProgramGroupCard";
import { ProgramCatalogView, type CatalogProgram } from "../components/sections/ProgramCatalog";
import { ASK_TO_JOIN_LABEL, DATES_COMING_SOON, ENROLL_LABEL, LOW_SEATS_THRESHOLD, groupAction, groupClassDays, groupStatus, groupWhoLabel, priceParts, programHeadingLine } from "../lib/programCatalog";
import { blockSeatsFromSnapshot, readBlockSeats } from "../lib/groupSeats";
import { blockFacts, groupCards, type GroupCard } from "../lib/groupBlocks";
import nextConfig from "../../next.config";
import sitemap from "../app/sitemap";
import type { Cohort } from "../types/cohort";
import type { ProgramGroup } from "../types/program";

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
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const at = (hay: string, needle: string) => hay.indexOf(needle);
const count = (hay: string, needle: string) => hay.split(needle).length - 1;
const ids = (list: { id: string }[]) => list.map((g) => g.id).join(",");
const tier = (slug: string) => TIERS.find((t) => t.slug === slug)!;

// ── The lineup (owner, 2026-10-12) ──────────────────────────────────────────
console.log("Group lineup (owner, 2026-10-12)");
check("seven groups, in lineup order", ids(programGroups) === "youth-7-10,youth-11-15,high-performance,adult-newer,adult-intermediate,adult-advanced,private-lessons", ids(programGroups));
check("ids are unique", new Set(programGroups.map((g) => g.id)).size === programGroups.length);
check("every group belongs to a listed program", programGroups.every((g) => listedPrograms.some((p) => p.slug === g.programSlug)));
check("every listed program has a group", listedPrograms.every((p) => groupsForProgram(p.slug).length > 0));
for (const g of programGroups) {
  check(`${g.id}: one level tag (a tier id) or any level`, g.level === null || TIERS.some((t) => t.id === g.level));
  check(`${g.id}: ages make sense`, (g.ageMin === null || g.ageMax === null || g.ageMin <= g.ageMax) && (g.ageMin === null || g.ageMin >= 4));
  check(`${g.id}: a class has a day, a start and an end together`, (g.day === null) === (g.start === null) && (g.start === null) === (g.end === null));
  // Re-pinned for backlog #85 (owner, 2026-11-20): a group card names its class count.
  check(`${g.id}: price from the constant`, g.price === (g.day ? GROUP_PRICE : PRIVATE_LESSONS_PRICE));
}
const pin = (id: string, want: Partial<ProgramGroup>) => {
  const g = groupById(id);
  check(`${id}: ${JSON.stringify(want)}`, !!g && Object.entries(want).every(([k, v]) => (g as unknown as Record<string, unknown>)[k] === v), JSON.stringify(g));
};
pin("youth-7-10", { name: "Beginner Junior Bootcamp", ageMin: 7, ageMax: 10, level: 1, day: "Saturday", start: "12:00", end: "13:00", status: "forming" });
pin("youth-11-15", { name: "Novice Youth Bootcamp", ageMin: 11, ageMax: 15, level: 2, day: "Saturday", start: "13:00", end: "14:00" });
pin("high-performance", { name: "High Performance Youth Bootcamp", ageMin: 12, ageMax: 17, level: 5, day: "Saturday", start: "14:00", end: "15:00" });
pin("adult-newer", { name: "Beginner Adult Bootcamp", ageMin: 16, ageMax: null, level: 1, day: "Sunday", start: "16:00", end: "17:00" });
pin("adult-intermediate", { name: "Intermediate Adult Bootcamp", ageMin: 16, ageMax: null, level: 3, day: "Sunday", start: "17:00", end: "18:00" });
pin("adult-advanced", { name: "Advanced Adult Bootcamp", ageMin: 16, ageMax: null, level: 4, day: "Sunday", start: "18:00", end: "19:00" });
pin("private-lessons", { name: "One-to-one coaching", ageMin: null, ageMax: null, level: null, day: null, status: "arranged" });
check("bootcamp titles are built from the tier names, level first", bootcampTitle(3, "Adult") === "Intermediate Adult Bootcamp" && bootcampTitle(5, "Youth") === "High Performance Youth Bootcamp" && programGroups.filter((g) => g.day).every((g) => g.level !== null && g.name.startsWith(tierById(g.level).name) && g.name.endsWith("Bootcamp")));
check("no title or eyebrow carries a day or a time", programGroups.every((g) => !/(Saturday|Sunday|\d{1,2}:\d{2})/.test(g.name)));
check("the High Performance group carries the competitive note, no tier names", !!groupById("high-performance")?.note?.includes("competitive track") && !TIERS.some((t) => groupById("high-performance")!.note!.includes(t.name)));
check("the High Performance group's tag is the High Performance tier", groupById("high-performance")?.level === 5 && tierById(5).name === "High Performance");
check("the youth and adult groups are three each, Saturday and Sunday", groupsForProgram("youth-programs").every((g) => g.day === "Saturday") && groupsForProgram("bootcamps").every((g) => g.day === "Sunday") && groupsForProgram("youth-programs").length === 3 && groupsForProgram("bootcamps").length === 3);

// ── Filters ─────────────────────────────────────────────────────────────────
console.log("Catalog filters: parsing and the URL");
const params = (s: string) => new URLSearchParams(s);
check("an exact age", parseCatalogQuery(params("age=14")).age?.min === 14 && parseCatalogQuery(params("age=14")).age?.max === 14);
check("a band", parseCatalogQuery(params("age=teen")).age === AGE_BAND_QUERIES.teen && AGE_BAND_QUERIES.junior.min === 7 && AGE_BAND_QUERIES.junior.max === 13 && AGE_BAND_QUERIES.adult.max === null);
check("a level by its slug", parseCatalogQuery(params("level=intermediate")).tier?.name === "Intermediate");
check("unknown values read as any", isEmptyQuery(parseCatalogQuery(params("age=bogus&level=deuce"))) && ageQueryFor("3") === null && ageQueryFor("100") === null && tierQueryFor("") === null);
check("the exact ages offered are 7 to 17", EXACT_AGES.join() === "7,8,9,10,11,12,13,14,15,16,17");
const q = parseCatalogQuery(params("level=intermediate&age=14"));
check("the query string has a fixed key order", catalogQueryString(q) === "age=14&level=intermediate");
check("catalogHref", catalogHref(EMPTY_QUERY) === "/programs" && catalogHref(q) === "/programs?age=14&level=intermediate");
check("parse ∘ serialise is stable", catalogQueryString(parseCatalogQuery(params(catalogQueryString(q)))) === catalogQueryString(q));
check("quizCatalogHref: band and provisional tier from the self-estimate; the band alone for a competitive youth", quizCatalogHref("teen", "competitive") === "/programs?age=teen" && quizCatalogHref("adult", "competitive") === "/programs?age=adult&level=intermediate" && quizCatalogHref("teen", "rally") === "/programs?age=teen&level=novice" && quizCatalogHref("junior", undefined) === "/programs?age=junior" && quizCatalogHref(undefined, undefined) === "/programs");

console.log("Catalog filters: matching");
const g = (id: string) => groupById(id)!;
check("an age inside the range", groupTakesAge(g("youth-7-10"), ageQueryFor("9")!) && !groupTakesAge(g("youth-7-10"), ageQueryFor("11")!));
check("an open top takes any older age", groupTakesAge(g("adult-newer"), ageQueryFor("16")!) && groupTakesAge(g("adult-newer"), ageQueryFor("60")!) && !groupTakesAge(g("adult-newer"), ageQueryFor("15")!));
check("a band overlaps", groupTakesAge(g("high-performance"), AGE_BAND_QUERIES.junior) && groupTakesAge(g("adult-newer"), AGE_BAND_QUERIES.teen) && !groupTakesAge(g("youth-7-10"), AGE_BAND_QUERIES.teen));
check("no age bounds take everyone", groupTakesAge(g("private-lessons"), AGE_BAND_QUERIES.adult) && groupTakesAge(g("private-lessons"), ageQueryFor("5")!));
check("a tier matches the tag exactly; any-level groups take every tier", groupTakesTier(g("high-performance"), tier("high-performance")) && !groupTakesTier(g("high-performance"), tier("intermediate")) && !groupTakesTier(g("high-performance"), tier("advanced")) && groupTakesTier(g("private-lessons"), tier("novice")));
check("tierDistance and the one-tier reach", tierDistance(g("adult-intermediate"), tier("advanced")) === 1 && tierDistance(g("private-lessons"), tier("advanced")) === 0 && groupTakesTierNear(g("adult-intermediate"), tier("advanced"), 1) && !groupTakesTierNear(g("adult-intermediate"), tier("high-performance"), 1));
const filtered = (s: string) => ids(filterGroups(programGroups, parseCatalogQuery(params(s))));
const closest = (s: string) => ids(closestGroups(programGroups, parseCatalogQuery(params(s))));
check("no filter → every group", filtered("") === ids(programGroups));
check("age 9 → the Beginner Junior Bootcamp and private lessons", filtered("age=9") === "youth-7-10,private-lessons", filtered("age=9"));
check("age 14 at Novice → the Novice Youth Bootcamp and private lessons", filtered("age=14&level=novice") === "youth-11-15,private-lessons", filtered("age=14&level=novice"));
check("age 14 at Intermediate → private lessons only, exactly", filtered("age=14&level=intermediate") === "private-lessons", filtered("age=14&level=intermediate"));
check("…and Closest fit offers the Novice Youth Bootcamp (one tier away), not High Performance (two)", closest("age=14&level=intermediate") === "youth-11-15", closest("age=14&level=intermediate"));
check("age 16 → High Performance, the three adult groups, private lessons", filtered("age=16") === "high-performance,adult-newer,adult-intermediate,adult-advanced,private-lessons", filtered("age=16"));
check("teens → the Novice Youth Bootcamp, High Performance, the adult groups, private lessons", filtered("age=teen") === "youth-11-15,high-performance,adult-newer,adult-intermediate,adult-advanced,private-lessons", filtered("age=teen"));
check("adults at Beginner → the Beginner Adult Bootcamp and private lessons", filtered("age=adult&level=beginner") === "adult-newer,private-lessons", filtered("age=adult&level=beginner"));
check("adults at High Performance → private lessons, with Closest fit the Advanced Adult Bootcamp", filtered("age=adult&level=high-performance") === "private-lessons" && closest("age=adult&level=high-performance") === "adult-advanced", closest("age=adult&level=high-performance"));
check("a retired slug reads as any level", filtered("level=pro") === ids(programGroups) && filtered("level=elite") === ids(programGroups));
check("Closest fit is empty without a level filter, or when a tagged group matches exactly", closest("age=9") === "" && closest("age=adult&level=beginner") === "" && closest("") === "");
check("Closest fit keeps ties: age 9 at Novice has only the Beginner group; an adult at Novice has Beginner and Intermediate", closest("age=9&level=novice") === "youth-7-10" && closest("age=adult&level=novice") === "adult-newer,adult-intermediate", closest("age=adult&level=novice"));

console.log("Catalog filters: the results line");
check("no filter", resultsLine(7, EMPTY_QUERY) === "7 groups" && resultsLine(1, EMPTY_QUERY) === "1 group");
check("age and level", resultsLine(3, q) === "3 groups for age 14 at Intermediate" && describeQuery(q) === "for age 14 at Intermediate");
check("a band alone", resultsLine(2, parseCatalogQuery(params("age=junior"))) === "2 groups for juniors (7–13)");
check("none", resultsLine(0, parseCatalogQuery(params("age=7&level=high-performance"))) === "No groups for age 7 at High Performance yet.");

// ── The group card, rendered ────────────────────────────────────────────────
console.log("ProgramGroupCard markup");
const render = (el: React.ReactElement) => renderToStaticMarkup(el);
/** The words a card shows, in order, with the markup gone. */
const words = (html: string) => html.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const youth = listedPrograms.find((p) => p.slug === "youth-programs")!;
// Backlog #70 (owner, 2026-11-17): the card shows the whole price, the cohort total over the cohort length.
// Re-pinned for backlog #85 (owner, 2026-11-20): with its class count, once a week or twice.
const [TOTAL_LINE, LENGTH_LINE] = priceParts(GROUP_PRICE);
// Re-pinned for backlog #85 (owner, 2026-11-19 and 2026-11-20): a card shows
// one open block, its dates, class days, price and seats, and its button
// opens the block's sign-up page. The fixtures are blocks a coach could
// open, priced at the setting's own total over its own length, so the card
// reads the same price words as the lineup.
const cohort: Cohort = {
  id: "hp-winter", programId: "youth-programs", locationId: "", label: "Winter HP", startDate: "2027-01-09", endDate: "2027-02-13", weeks: COHORT_WEEKS,
  sessions: [{ day: "Sat", start: "14:00", end: "15:00" }], capacityMin: 4, capacityMax: 8, priceCents: COHORT_TOTAL_CENTS, currency: "CAD", status: "open", levelMin: 5, levelMax: 7,
};
const openCohort: Cohort = { ...cohort, id: "y710-winter", label: "Winter 7–10", sessions: [{ day: "Sat", start: "12:00", end: "13:00" }], levelMin: 1, levelMax: 1.5 };
const hpBlock = blockFacts(cohort);
const openBlock = blockFacts(openCohort);
const hpCard = render(createElement(ProgramGroupCard, { group: g("high-performance"), block: hpBlock }));
check("one interactive element per card: its button, a link named for the group, to the block's sign-up page", count(hpCard, "<a ") === 1 && count(hpCard, "<button") === 0 && count(hpCard, "<input") === 0 && count(hpCard, "<select") === 0 && /<a [^>]*href="\/enroll\/hp-winter"[^>]*>Ask to join<span class="sr-only"> the High Performance Youth Bootcamp, Jan 9 – Feb 13<\/span><\/a>/.test(hpCard), hpCard.match(/<a [^>]*>[\s\S]*?<\/a>/)?.[0]);
check("the article carries the id anchor and its scroll margin, and the card itself is no longer a link", hpCard.includes('<article id="high-performance"') && hpCard.includes("scroll-mt-24") && !hpCard.includes("after:absolute after:inset-0"));
check("top row: the one level tag, then the status chip; no eyebrow", at(hpCard, ", tier 5 of 5, levels 5.0–7.0") > 0 && at(hpCard, ", tier 5 of 5, levels 5.0–7.0") < at(hpCard, "By approval</span>") && at(hpCard, "By approval</span>") < at(hpCard, "<h3") && youth.type === "Group bootcamp" && !hpCard.includes(youth.type) && !hpCard.includes("uppercase"));
check("the title leads with the level", hpCard.includes(">High Performance Youth Bootcamp</h3>"));
check("the status chip reads By approval, with the hollow ring (joining flow)", hpCard.includes("By approval</span>") && hpCard.includes("rounded-full border border-white/70") && !hpCard.includes("Groups forming"));
// Re-pinned for backlog #85: four lines, the dates (first class to last) and
// the class days and times where the one when line was. It may grow by one
// line, no more.
check("four plain lines, each with an icon and no label: who, the dates, the class days and times, where", count(hpCard, "<li") === 4 && count(hpCard, "<svg") >= 4 && hpCard.includes("Ages 12–17</li>") && words(hpCard).includes("Ages 12–17 Jan 9 – Feb 13 Saturdays 2–3pm Newtonbrook Tennis Club") && hpCard.includes("Newtonbrook Tennis Club</li>") && !hpCard.includes("<dt") && !hpCard.includes("<dl"));
check("the helpers behind the lines", groupWhoLabel(g("youth-7-10")) === "Ages 7–10" && groupWhoLabel(g("adult-newer")) === "Ages 16 and up" && groupWhoLabel(g("private-lessons")) === "Any age" && groupClassDays(g("youth-7-10")) === "Saturdays 12–1pm" && groupClassDays(g("private-lessons")) === "By arrangement");
check("one level tag: the mark and the name with no chip around them, no span, no band, no rail", hpCard.includes(">High Performance</span>") && hpCard.includes(", tier 5 of 5, levels 5.0–7.0") && /<span class="inline-flex items-center gap-1\.5 text-\[13px\] text-white"><svg/.test(hpCard) && !hpCard.slice(0, at(hpCard, "<h3")).includes("–<") && !hpCard.includes('aria-label="Built for') && !hpCard.includes('role="meter"') && !hpCard.includes("3.0–5.5"));
// Re-pinned for backlog #70: it was the session price over the cohort total.
check("the price once, stacked: the total in bold over the length", !!LENGTH_LINE && count(hpCard, TOTAL_LINE) === 1 && count(hpCard, LENGTH_LINE) === 1 && at(hpCard, `>${TOTAL_LINE}</span>`) > 0 && at(hpCard, `>${TOTAL_LINE}</span>`) < at(hpCard, `>${LENGTH_LINE}</span>`) && new RegExp(`<span class="block text-lg font-semibold[^"]*text-white">\\${TOTAL_LINE}</span><span class="block text-\\[13px\\] text-white/60">${LENGTH_LINE}</span>`).test(hpCard));
check("the price reads the price constants, and the card types none", PRICE_SUMMARY === `${COHORT_TOTAL_LABEL} for ${COHORT_LENGTH}` && GROUP_PRICE === `${COHORT_TOTAL_LABEL} for ${COHORT_WEEKS} classes over ${COHORT_LENGTH}` && hpCard.includes(`>${COHORT_TOTAL_LABEL}</span>`) && hpCard.includes(`>for ${COHORT_WEEKS} classes over ${COHORT_LENGTH}</span>`) && !/\$\d/.test(read("src/components/sections/ProgramGroupCard.tsx")));
check("no per-session figure on a group card, in any state", programGroups.filter((group) => group.day !== null).every((group) => [null, openBlock, { ...openBlock, seatsLeft: 2 }, { ...openBlock, seatsLeft: 0 }].every((b) => { const html = render(createElement(ProgramGroupCard, { group, block: b })); return !/a session|per session/i.test(html) && !html.includes(SESSION_PRICE_LABEL) && count(html, "$") === 1; })));
check("the price sits in the foot, after the lines and before the button, on a hairline pinned to the bottom", at(hpCard, "Newtonbrook Tennis Club</li>") < at(hpCard, `>${TOTAL_LINE}</span>`) && at(hpCard, `>${LENGTH_LINE}</span>`) < at(hpCard, "<a ") && hpCard.includes('<div class="mt-auto flex') && hpCard.includes("border-t border-white/10") && hpCard.includes("flex h-full"));
// What left the card (owner-approved design, 2026-11-17): the competitive
// note, the Join and Week 1 rows and the Next row. The note stays in the data.
check("no note and no rules on the card", !hpCard.includes("The competitive track") && !hpCard.includes("Week 1") && !hpCard.includes("No assessment needed") && !hpCard.includes("Take the 2-minute quiz"));
check("no photo, no plate on a group card", !hpCard.includes("<img") && !hpCard.includes('viewBox="0 100 1600 800"'));
const h4Card = render(createElement(ProgramGroupCard, { group: g("high-performance"), block: hpBlock, headingLevel: 4 }));
check("headingLevel 4 renders the title as an h4", h4Card.includes(">High Performance Youth Bootcamp</h4>") && !h4Card.includes("<h3") && !h4Card.includes("<h2"));
const adultCohort: Cohort = { ...openCohort, id: "adult-beg-winter", programId: "bootcamps", startDate: "2027-01-10", endDate: "2027-02-14", sessions: [{ day: "Sun", start: "16:00", end: "17:00" }] };
const adultCard = render(createElement(ProgramGroupCard, { group: g("adult-newer"), block: blockFacts(adultCohort) }));
// Re-pinned for backlog #85 (owner, 2026-11-19; "Enroll", owner 2026-11-20): the lime button reads "Enroll"
// and opens the block's sign-up page, signed in or not. It read "Ask to join"
// and opened the quiz while nothing behind it took payment (backlog #71).
check("an adult block: Ages 16 and up, its dates, Sundays, the Open to join chip, a lime Enroll named for the group and its dates, to its sign-up page", adultCard.includes("Ages 16 and up</li>") && words(adultCard).includes("Jan 10 – Feb 14 Sundays 4–5pm") && adultCard.includes("Open to join</span>") && adultCard.includes(">Beginner Adult Bootcamp</h3>") && /<a [^>]*href="\/enroll\/adult-beg-winter"[^>]*>Enroll<span class="sr-only"> in the Beginner Adult Bootcamp, Jan 10 – Feb 14<\/span><\/a>/.test(adultCard) && /<a [^>]*bg-\[#B4E655\][^>]*>Enroll</.test(adultCard));
check("the dates line: the first class to the last, each date whole, the dash riding the first", /<span class="whitespace-nowrap">Jan 9 –<\/span><span class="whitespace-nowrap">Feb 13<\/span>/.test(hpCard));
// Fix round 4 (#85): the dates are in the button's own name, so two blocks
// of one group sound apart; nothing describes it a second time.
check("the button's name carries the block's dates, so two blocks of one group sound apart", /<a [^>]*>Ask to join<span class="sr-only"> [^<]+, Jan 9 – Feb 13<\/span><\/a>/.test(hpCard) && /<a [^>]*>Enroll<span class="sr-only"> [^<]+, Jan 10 – Feb 14<\/span><\/a>/.test(adultCard) && !/aria-describedby/.test(hpCard + adultCard) && !/id="[^"]*-dates"/.test(hpCard + adultCard));
check("a time range never breaks at its dash", /Saturdays <span class="whitespace-nowrap">2–3pm<\/span>/.test(hpCard));

// ── The states (owner-approved design, 2026-11-17; join and pay, #85) ──────
console.log("The card's states: groupStatus, the seat rules, and the button");
const open = g("youth-7-10");
const hp = g("high-performance");
check("open to join: no count, an unknown count, or more than the threshold", groupStatus(open)?.label === "Open to join" && groupStatus(open)?.kind === "open" && groupStatus(open, null)?.kind === "open" && groupStatus(open, undefined)?.kind === "open" && groupStatus(open, 8)?.kind === "open" && groupStatus(open, LOW_SEATS_THRESHOLD + 1)?.kind === "open");
check("the threshold is three, the enroll page's own", LOW_SEATS_THRESHOLD === 3 && read("src/app/enroll/[cohortId]/EnrollWizard.tsx").includes("seatsRemaining !== null && seatsRemaining <= 3"));
check("{n} spots left at the threshold or fewer, singular at one", groupStatus(open, 3)?.label === "3 spots left" && groupStatus(open, 2)?.label === "2 spots left" && groupStatus(open, 1)?.label === "1 spot left" && groupStatus(open, 2)?.kind === "low");
check("full: no seat left, or the group marked full whatever the count", groupStatus(open, 0)?.label === "Full" && groupStatus(open, 0)?.kind === "full" && groupStatus(open, -1)?.kind === "full" && groupStatus({ ...open, status: "full" })?.label === "Full" && groupStatus({ ...open, status: "full" }, 5)?.kind === "full");
check("by approval whatever the seats, unless there are none", groupStatus(hp)?.label === "By approval" && groupStatus(hp, 2)?.kind === "approval" && groupStatus(hp, 8)?.kind === "approval" && groupStatus(hp, 0)?.kind === "full" && groupStatus({ ...hp, status: "full" })?.kind === "full");
check("invite only keeps its chip", groupStatus({ ...open, status: "invite-only" })?.label === "Invite only" && groupStatus({ ...open, status: "invite-only" }, 2)?.kind === "invite-only" && groupStatus({ ...hp, status: "invite-only" })?.kind === "invite-only");
check("a failed or missing read means Open to join, never an error", groupStatus(open, Number.NaN)?.kind === "open" && groupStatus(open, Number.POSITIVE_INFINITY)?.kind === "open");
check("a group with no fixed class shows no chip", groupStatus(g("private-lessons")) === null && groupStatus(g("private-lessons"), 0) === null);
// Backlog #85: a planned group with no open block has nothing to join yet.
check("no open block: no Open to join and no seat count; Full, Invite only and By approval keep their chip", groupStatus(open, null, false) === null && groupStatus(open, 2, false) === null && groupStatus(open, 0, false) === null && groupStatus(hp, null, false)?.kind === "approval" && groupStatus({ ...open, status: "full" }, null, false)?.kind === "full" && groupStatus({ ...open, status: "invite-only" }, null, false)?.kind === "invite-only");
const act = (group: ProgramGroup, seats?: number | null) => groupAction(group, groupStatus(group, seats));
// Re-pinned for backlog #85 (owner, 2026-11-19): an open block's lime button
// reads "Enroll" (owner, 2026-11-20; "Join" until then), with payment behind it; it read "Ask to join" (backlog #71).
check("open and last spots: the lime button, reading Enroll", act(open).kind === "join" && act(open).label === "Enroll" && act(open, 2).kind === "join" && act(open, 2).label === "Enroll" && ENROLL_LABEL === "Enroll");
check("full: Notify me", act(open, 0).kind === "notify" && act(open, 0).label === "Notify me");
check("by approval and invite only: Ask to join", act(hp).kind === "ask" && act(hp).label === "Ask to join" && act({ ...open, status: "invite-only" }).label === "Ask to join" && ASK_TO_JOIN_LABEL === "Ask to join");
check("no open block: Notify me, whatever the group", groupAction(open, groupStatus(open, null, false), false).kind === "notify" && groupAction(hp, groupStatus(hp, null, false), false).label === "Notify me" && groupAction(open, null, false).nameSuffix === " when a new cohort opens");
check("each button is named for its group: Enroll in it, Ask to join it, with its block's dates when it has them; Notify me for what it does", act(open).nameSuffix === " in the Beginner Junior Bootcamp" && act(hp).nameSuffix === " the High Performance Youth Bootcamp" && groupAction(open, groupStatus(open), true, "Jan 9 – Feb 13").nameSuffix === " in the Beginner Junior Bootcamp, Jan 9 – Feb 13" && groupAction(hp, groupStatus(hp), true, "Jan 9 – Feb 13").nameSuffix === " the High Performance Youth Bootcamp, Jan 9 – Feb 13" && act(open, 0).nameSuffix === " when a new cohort opens");
check("private lessons keep Ask about lessons", groupAction(g("private-lessons"), null).label === "Ask about lessons" && groupAction(g("private-lessons"), null, false).label === "Ask about lessons");
const lowCard = render(createElement(ProgramGroupCard, { group: open, block: { ...openBlock, seatsLeft: 2 } }));
check("last spots: the warn chip, computed from the seats, and a lime Enroll", lowCard.includes("border-yellow-400/30 bg-yellow-400/10 text-yellow-200") && lowCard.includes(">2 spots left</span>") && />Enroll<span class="sr-only"> in the Beginner Junior Bootcamp, Jan 9 – Feb 13<\/span><\/a>/.test(lowCard) && /<a [^>]*bg-\[#B4E655\]/.test(lowCard) && lowCard.includes('href="/enroll/y710-winter"') && !lowCard.includes("Open to join"));
const fullCard = render(createElement(ProgramGroupCard, { group: open, block: { ...openBlock, seatsLeft: 0 } }));
check("full: the neutral chip, and an outline Notify me to the footer's newsletter line", fullCard.includes(">Full</span>") && !fullCard.includes("yellow") && /<a [^>]*href="#notify"[^>]*>Notify me<span class="sr-only"> when a new cohort opens<\/span><\/a>/.test(fullCard) && !/<a [^>]*bg-\[#B4E655\]/.test(fullCard) && count(fullCard, "<a ") === 1 && !fullCard.includes("/intake") && !fullCard.includes("/enroll"));
const fullOwnForm = render(createElement(ProgramGroupCard, { group: open, block: { ...openBlock, seatsLeft: 0 }, notifyHref: "#cohorts" }));
check("…or to the page's own form where the page has one", fullOwnForm.includes('href="#cohorts"') && !fullOwnForm.includes('href="#notify"'));
const inviteCard = render(createElement(ProgramGroupCard, { group: { ...open, status: "invite-only" }, block: openBlock }));
check("invite only: its chip, and an outline Ask to join to the sign-up page", inviteCard.includes(">Invite only</span>") && /<a [^>]*href="\/enroll\/y710-winter"[^>]*>Ask to join<span class="sr-only"> the Beginner Junior Bootcamp, Jan 9 – Feb 13<\/span><\/a>/.test(inviteCard) && !/<a [^>]*bg-\[#B4E655\]/.test(inviteCard));
const plannedCard = render(createElement(ProgramGroupCard, { group: open }));
// Backlog #85, the owner's decision (2026-11-20): a planned group with no
// open block reads "Dates coming soon" where the dates go, and an outline
// "Notify me", as the full state does.
check("no open block: Dates coming soon where the dates go, its own class time, the lineup's price, no chip, an outline Notify me", plannedCard.includes(`${DATES_COMING_SOON}</li>`) && DATES_COMING_SOON === "Dates coming soon" && words(plannedCard).includes("Ages 7–10 Dates coming soon Saturdays 12–1pm Newtonbrook Tennis Club") && count(plannedCard, TOTAL_LINE) === 1 && !plannedCard.includes("Open to join") && !/rounded-full border border-white\/15/.test(plannedCard) && /<a [^>]*href="#notify"[^>]*>Notify me<span class="sr-only"> when a new cohort opens<\/span><\/a>/.test(plannedCard) && !/<a [^>]*bg-\[#B4E655\]/.test(plannedCard) && !plannedCard.includes("aria-describedby"));
const plannedHp = render(createElement(ProgramGroupCard, { group: hp }));
check("…and the High Performance Youth Bootcamp keeps By approval over Dates coming soon and Notify me", plannedHp.includes("By approval</span>") && plannedHp.includes(`${DATES_COMING_SOON}</li>`) && />Notify me<span class="sr-only"> when a new cohort opens<\/span><\/a>/.test(plannedHp) && !plannedHp.includes("/enroll") && !plannedHp.includes("/intake"));
const cardSrc = read("src/components/sections/ProgramGroupCard.tsx");
// Re-pinned for backlog #85: the card's button opens the block's sign-up page;
// only the private lessons row still opened the quiz. Re-pinned for backlog
// #103: that row's Ask about lessons emails us, so nothing in the file links the quiz.
check("Enroll and Ask to join open the block's sign-up page; private lessons' Ask about lessons an email to us", cardSrc.includes("`/enroll/${block.cohortId}`") && cardSrc.includes("href={ASK_ABOUT_LESSONS_HREF}") && cardSrc.includes('track="lessons"') && cardSrc.includes("source={source}") && !cardSrc.includes("/intake"));
{
  const cardOnly = cardSrc.slice(cardSrc.indexOf("export function ProgramGroupCard("), cardSrc.indexOf("export function ArrangedGroupRow"));
  const rowOnly = cardSrc.slice(cardSrc.indexOf("export function ArrangedGroupRow"));
  // Re-pinned for backlog #85: the card read quizAware="href" (backlog #71),
  // sending a signed-in taker's "Ask to join" to the dashboard. Its button no
  // longer opens the quiz, so nothing swaps: Enroll is Enroll for everyone.
  check("a card's button is a plain link, the same for everyone signed in or not: no quiz swap", !cardOnly.includes("quizAware") && !cardOnly.includes("TrackedLink") && cardSrc.indexOf("function GroupButton(") < cardSrc.indexOf("export function ProgramGroupCard(") && !cardSrc.slice(cardSrc.indexOf("function GroupButton("), cardSrc.indexOf("export function ProgramGroupCard(")).includes("quizAware"));
  // Re-pinned for backlog #103: the row read quizAware={false}, keeping its quiz link for a quiz-taker. It emails us now, the same for everyone.
  check("the private lessons row's Ask about lessons is the same for everyone: no quiz swap", !rowOnly.includes("quizAware") && rowOnly.includes('track="lessons"'));
}
check("the lime and the outline button share one height, so sibling feet line up", cardSrc.includes('const BUTTON_SHAPE = "h-[46px] whitespace-nowrap";'));
check("on a tablet the stacked top row keeps the chip's room, so a card with no chip keeps its title level", cardSrc.includes("md:min-h-[52px] md:flex-col") && cardSrc.includes("lg:min-h-[26px] lg:flex-row"));

// Backlog #85 (owner, 2026-11-19): "you should be able to sign up and pay for
// a group not just ask to join". Every open block reads Join, with its
// sign-up page behind it; it replaced backlog #71's "Ask to join" on every
// group, which opened the quiz while nothing took payment.
console.log("Enroll on every open block, Notify me where there is none");
{
  const PAYMENT = /\/enroll\//;
  const states: [string, number | null][] = [["open", null], ["last spots", 2], ["full", 0]];
  const scheduledGroups = programGroups.filter((x) => x.day !== null);
  const button = (html: string) => html.match(/<a [^>]*>[\s\S]*?<\/a>/)?.[0] ?? "";
  const cards = scheduledGroups.flatMap((group) => {
    const variants = [group, { ...group, status: "invite-only" as const }];
    return variants.flatMap((v) => states.map(([state, seats]) => ({ id: `${v.id} ${v.status ?? ""} ${state}`, group: v, html: render(createElement(ProgramGroupCard, { group: v, block: { ...openBlock, seatsLeft: seats } })) })));
  });
  const full = cards.filter((c) => />Full</.test(c.html));
  const asks = cards.filter((c) => !/>Full</.test(c.html) && (c.group.joining === "approval" || c.group.status === "invite-only"));
  const joins = cards.filter((c) => !/>Full</.test(c.html) && c.group.joining !== "approval" && c.group.status !== "invite-only");
  check("every open block that takes walk-ins reads Enroll on the lime, named for its group, to its sign-up page", joins.length > 0 && joins.every((c) => /^<a [^>]*>Enroll<span class="sr-only"> in the [^<]+ Bootcamp, Jan 9 – Feb 13<\/span><\/a>$/.test(button(c.html)) && /bg-\[#B4E655\]/.test(button(c.html)) && /href="\/enroll\/y710-winter"/.test(button(c.html))), joins.find((c) => !/>Enroll</.test(button(c.html)))?.id);
  check("a by-approval or invite-only block reads Ask to join on the outline, to the same sign-up page, where its approval step takes over", asks.length > 0 && asks.every((c) => /^<a [^>]*>Ask to join<span class="sr-only"> the [^<]+ Bootcamp, Jan 9 – Feb 13<\/span><\/a>$/.test(button(c.html)) && !/bg-\[#B4E655\]/.test(button(c.html)) && PAYMENT.test(button(c.html))));
  check("a full block reads Notify me, to the newsletter line, never the sign-up page", full.length > 0 && full.every((c) => /href="#notify"/.test(button(c.html)) && />Notify me</.test(button(c.html)) && !PAYMENT.test(button(c.html))));
  check("no card's button opens the quiz, a retake or an add", cards.every((c) => !/\/intake|retake|add=1/.test(button(c.html))));
  const planned = scheduledGroups.map((group) => render(createElement(ProgramGroupCard, { group })));
  check("no open block: every group reads Dates coming soon and an outline Notify me, never Enroll and never a sign-up page", planned.every((html) => html.includes(DATES_COMING_SOON) && /^<a [^>]*href="#notify"[^>]*>Notify me<span class="sr-only"> when a new cohort opens<\/span><\/a>$/.test(button(html)) && !/>Enroll</.test(html) && !PAYMENT.test(html)));
}

console.log("Seats: one read, the enroll page's count, display only");
{
  const header = ["cohort_id", "status"];
  const paid = (id: string, n: number) => Array.from({ length: n }, () => [id, "paid"]);
  const snapshot = { header, rows: [...paid("y710-winter", 6), ["y710-winter", "pending"], ...paid("hp-winter", 8)] };
  // Re-pinned for backlog #85: seats are counted per open block, by its id.
  const seats = blockSeatsFromSnapshot([openCohort, cohort], snapshot);
  check("seats are capacity minus the block's paid rows, for each open block", seats["y710-winter"] === 2 && seats["hp-winter"] === 0 && Object.keys(seats).length === 2);
  check("the card then reads the count: 2 spots left, and Full", groupStatus(open, seats["y710-winter"])?.label === "2 spots left" && groupStatus(hp, seats["hp-winter"])?.label === "Full");
  check("an empty sheet means every seat is free", blockSeatsFromSnapshot([openCohort], { header, rows: [] })["y710-winter"] === openCohort.capacityMax);
  check("no snapshot, or one without the columns: no count, so Open to join", Object.keys(blockSeatsFromSnapshot([openCohort], null)).length === 0 && Object.keys(blockSeatsFromSnapshot([openCohort], { header: ["x"], rows: [["y"]] })).length === 0);
  const seatsSrc = read("src/lib/groupSeats.ts");
  check("the count is the one the enroll page uses, and the module never writes", seatsSrc.includes('import { readEnrollmentSheet, seatsFromSnapshot } from "@/lib/seatCount";') && !/\.(append|update|insert|delete|upsert)\(/.test(seatsSrc));
  check("a read that fails or throws is no count, never an error", seatsSrc.includes('return read.status === "ok" ? read.snapshot : null;') && seatsSrc.includes("} catch (err) {") && seatsSrc.includes("return null;"));
  const programsSrc = read("src/app/programs/page.tsx");
  check("/programs reads the seats once per render, and builds its cards with them", count(programsSrc, "readBlockSeats(") === 1 && programsSrc.includes("groupCards(programGroups, publicCohorts, seats)"));
  const detailSrc = read("src/app/programs/[slug]/page.tsx");
  check("a program page reads the sheet once, for its cohort cards and its group cards", count(detailSrc, "readSeatSnapshot()") === 1 && !detailSrc.includes("getSeatsRemaining") && detailSrc.includes("groupCards(groups, openCohorts, seatCounts)"));
  // Re-pinned for backlog #85 (fix round): the page's own cohort cards left it; the group cards read the threshold through groupStatus.
  check("a program page counts no seats of its own: the group cards read the threshold", !/seats <= [1-9]/.test(detailSrc) && !detailSrc.includes("isLowStock"));
}

console.log("A group with no fixed class: one row");
const soloRow = render(createElement(ArrangedGroupRow, { group: g("private-lessons"), source: "programs-group" }));
check("private lessons: its name, by arrangement and the price in one line, no chip", soloRow.includes(">One-to-one coaching</h3>") && soloRow.includes(`>By arrangement · ${PRIVATE_LESSONS_PRICE}</p>`) && !soloRow.includes("Open to join") && soloRow.includes('<article id="private-lessons"'));
// Re-pinned for backlog #103: the button led to the quiz for the program; it
// opens an email to us now, the subject filled in, with the address under it.
check("one outline button, Ask about lessons, an email to us with the address written under it", count(soloRow, "<a ") === 1 && /<a [^>]*href="mailto:info@tennisbootcamp\.ca\?subject=Private%20lessons"[^>]*>Ask about lessons<\/a><p [^>]*>info@tennisbootcamp\.ca<\/p>/.test(soloRow) && !/<a [^>]*bg-\[#B4E655\]/.test(soloRow));

console.log("ProgramCatalogView markup");
const catalogPrograms: CatalogProgram[] = listedPrograms.map((p) => ({ slug: p.slug, title: p.title }));
// Re-pinned for backlog #85: the catalog takes its cards (groupCards), each a group and its open block or none.
const plannedCards = (groups: ProgramGroup[]): GroupCard[] => groups.map((group) => ({ group, block: null }));
const view = (query = EMPTY_QUERY, cards: GroupCard[] = plannedCards(programGroups)) =>
  render(createElement(ProgramCatalogView, { programs: catalogPrograms, cards, header: createElement("h1", null, "Our Programs"), query, onChange: () => {} }));
const all = view();
check("every group under its program, three sections: a card per class, one row for private lessons", count(all, "<article") === programGroups.length && listedPrograms.every((p) => all.includes(`id="catalog-${p.slug}"`)) && count(all, '<ul role="list" class="mt-3.5 grid gap-3 md:grid-cols-3 md:gap-4"') === 2);
check(
  "the page's h1, a program title h2 per section, a group title h3 per card: no two levels share a rank",
  count(all, "<h1") === 1 && count(all, "<h2") === listedPrograms.length && count(all, "<h3") === programGroups.length && count(all, "<h4") === 0 && programGroups.every((x) => all.includes(`>${x.name}</h3>`)),
  `h2 ${count(all, "<h2")} · h3 ${count(all, "<h3")} · h4 ${count(all, "<h4")}`
);
check("three labelled dropdowns in the band, and no Clear button beside them", count(all, "<select") === 3 && all.includes(">Location</label>") && all.includes(">Player’s age</label>".replace("’", "&#x27;")) && all.includes(">Level</label>") && !all.includes(">Clear filters</button>"));
// Fix round, 2026-11-17: on phones the dropdowns cut their value ("High
// Performan"). Tighter padding and chevron room below md, the Level column
// the wider of the two under the location, 16px from 375 wide and 14px
// below, and an ellipsis as the safety net. What it looks like at 320 to
// 1440 is checked in a browser; this pins the classes that do it.
const selectTags = all.match(/<select [^>]*>/g) ?? [];
const selectClasses = selectTags.map((tag) => (tag.match(/class="([^"]*)"/)?.[1] ?? "").split(" "));
check("each dropdown is 44px tall and full width", selectClasses.length === 3 && selectClasses.every((c) => c.includes("min-h-[44px]") && c.includes("w-full")));
check("a value that cannot fit ends in an ellipsis, never a sliced letter", selectClasses.every((c) => c.includes("truncate")));
check("on phones the padding and the chevron's room are tighter; from md they are as designed", selectClasses.every((c) => c.includes("pl-3") && c.includes("pr-7") && c.includes("md:pl-4") && c.includes("md:pr-10")) && count(all, 'class="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/60 md:right-4"') === 3);
check("the value is 16px from 375 wide (no zoom on an iPhone), 14px below, 15px from md", selectClasses.every((c) => c.includes("text-sm") && c.includes("min-[375px]:text-base") && c.includes("md:text-[15px]") && !c.includes("text-base")));
check("on phones the location takes a row and Level is the wider of the two under it; one row of three from md, in the same order", all.includes('<fieldset class="mt-[22px] grid max-w-[860px] grid-cols-[minmax(0,11fr)_minmax(0,14fr)] gap-3 md:grid-cols-[1.75fr_0.9fr_1fr] md:gap-4 lg:grid-cols-[1.5fr_1fr_1fr]">') && all.includes('<div class="col-span-2 min-w-0 md:col-span-1"><label') && at(all, ">Location</label>") < at(all, ">Player&#x27;s age</label>") && at(all, ">Player&#x27;s age</label>") < at(all, ">Level</label>"));
check("a program's title link is a 44px target by inline padding, so its row keeps its height, and its ring is inset to the words", listedPrograms.every((p) => new RegExp(`<a class="underline-offset-4 hover:underline relative py-\\[13px\\] [^"]*after:inset-y-\\[13px\\][^"]*focus-visible:after:ring-2[^"]*" href="/programs/${p.slug}">`).test(all)));
check("the results line stays a live region, for screen readers only", /<p role="status" aria-live="polite" class="sr-only">7 groups<\/p>/.test(all));
check("the age select keeps the bands and the exact ages", all.includes('<optgroup label="Age group">') && all.includes('<optgroup label="Exact age">') && all.includes('<option value="14">14</option>') && all.includes('<option value="adult">Adult (18+)</option>'));
check("the level select offers the five tier names by slug, no number bands", TIERS.every((t) => all.includes(`<option value="${t.slug}">${t.name}</option>`)) && TIERS.every((t) => !all.includes(`${t.name} · ${t.band}`)) && count(all, "<option value=") === 1 + 1 + 3 + EXACT_AGES.length + 1 + TIERS.length);
check("each program's heading row: its title, linked to its page, and one derived line", listedPrograms.every((p) => new RegExp(`<h2 id="catalog-${p.slug}"[^>]*><a [^>]*href="/programs/${p.slug}"[^>]*>${p.title}</a></h2>`).test(all)) && all.includes(">Saturdays · ages 7–17</p>") && all.includes(">Sundays · 16 and up</p>") && all.includes(">Any age · any level</p>"));
check("the heading lines are derived from the groups", programHeadingLine(groupsForProgram("youth-programs")) === "Saturdays · ages 7–17" && programHeadingLine(groupsForProgram("bootcamps")) === "Sundays · 16 and up" && programHeadingLine(groupsForProgram("private-lessons")) === "Any age · any level");
check("no photo and no description in the list (both stay on the program's page)", !all.includes("<img") && listedPrograms.every((p) => !all.includes(p.description)));
check("the quiz is a side line under the dropdowns, never a lime button", /Not sure which group\? <a [^>]*href="\/intake"[^>]*>Take the 2-minute quiz<\/a>/.test(all) && at(all, "</fieldset>") < at(all, "Not sure which group?") && at(all, "Not sure which group?") < at(all, 'id="groups"'));
check("the groups sit under the anchor the main button scrolls to", /<div class="[^"]*scroll-mt-24" id="groups">/.test(all));
check("private lessons is one row with Ask about lessons", all.includes(`>By arrangement · ${PRIVATE_LESSONS_PRICE}</p>`) && all.includes(">Ask about lessons</a>"));
// Re-pinned for backlog #85: the whole catalog, as /programs shows it while
// no block is open (backlog #71 pinned "Ask to join" on every group here).
check(
  "/programs with no open block: every group card reads Dates coming soon and Notify me, private lessons Ask about lessons; nothing reads Enroll, and no link leads to a sign-up page",
  count(all, `${DATES_COMING_SOON}</li>`) === programGroups.filter((x) => x.day !== null).length &&
    count(all, ">Notify me<span") === programGroups.filter((x) => x.day !== null).length &&
    count(all, ">Ask about lessons</a>") === 1 &&
    !/>Enroll</.test(all) &&
    !/href="[^"]*(\/enroll|checkout|stripe)[^"]*"/i.test(all)
);
const seatsCohorts: Cohort[] = [openCohort, { ...openCohort, id: "adult-int-winter", programId: "bootcamps", sessions: [{ day: "Sun", start: "17:00", end: "18:00" }], levelMin: 3, levelMax: 3.5 }];
const withSeats = view(EMPTY_QUERY, groupCards(programGroups, seatsCohorts, { "y710-winter": 2, "adult-int-winter": 0 }));
check("the catalog passes each card its block and seats: Enroll on the lime, Notify me when full, Dates coming soon elsewhere", withSeats.includes(">2 spots left</span>") && count(withSeats, ">Full</span>") === 1 && count(withSeats, ">Enroll<span") === 1 && withSeats.includes('href="/enroll/y710-winter"') && count(withSeats, ">Notify me<") === programGroups.filter((x) => x.day !== null).length - 1 && count(withSeats, `${DATES_COMING_SOON}</li>`) === programGroups.filter((x) => x.day !== null).length - 2 && count(withSeats, "Open to join</span>") === 0);
const teens = view(parseCatalogQuery(params("age=14&level=novice")));
check("a filtered view keeps only the matching groups and sections", count(teens, "<article") === 2 && teens.includes("2 groups for age 14 at Novice") && !teens.includes('id="catalog-bootcamps"') && teens.includes('<option value="14" selected="">') && !teens.includes("Closest fit"));
const nearest = view(parseCatalogQuery(params("age=14&level=intermediate")));
check("Closest fit: the exact match (private lessons), then the nearest-level group with the week-one line", count(nearest, "<article") === 2 && nearest.includes("1 group for age 14 at Intermediate") && nearest.includes(">Closest fit</h2>") && nearest.includes("The nearest levels to Intermediate for age 14.") && !nearest.includes("tagged") && nearest.includes("on court in week one") && nearest.includes("we move you to it at the same price") && at(nearest, 'id="catalog-private-lessons"') < at(nearest, ">Closest fit</h2>") && at(nearest, ">Closest fit</h2>") < at(nearest, 'id="youth-11-15"'));
check("Closest fit cards are the same card, named by their level-led titles", nearest.includes(">Novice Youth Bootcamp</h3>") && />Notify me<span class="sr-only"> when a new cohort opens<\/span><\/a>/.test(nearest) && !nearest.includes("No group matches"));
const nearestOpen = view(parseCatalogQuery(params("age=14&level=intermediate")), groupCards(programGroups, [{ ...openCohort, id: "y1115-winter", sessions: [{ day: "Sat", start: "13:00", end: "14:00" }], levelMin: 2, levelMax: 2.5 }]));
check("…and with an open block, Closest fit shows it with its dates and Enroll", />Enroll<span class="sr-only"> in the Novice Youth Bootcamp, Jan 9 – Feb 13<\/span><\/a>/.test(nearestOpen) && nearestOpen.includes('href="/enroll/y1115-winter"') && words(nearestOpen).includes("Jan 9 – Feb 13 Saturdays 1–2pm"));
const none = view(parseCatalogQuery(params("age=5&level=high-performance")), plannedCards(programGroups.filter((x) => x.id !== "private-lessons")));
check("nothing matches and nothing is near: a dashed box that says what is true and what happens next", none.includes("border-dashed") && /No group matches that age and level\. <a [^>]*href="\/intake"[^>]*>Take the 2-minute quiz<\/a> and our coaches place you\./.test(none) && none.includes(">Clear filters</button>") && count(none, "<article") === 0 && !none.includes("Closest fit"));
const noneButPrivate = view(parseCatalogQuery(params("age=5&level=high-performance")));
check("private lessons, which takes every age and level, stays listed beside it", count(noneButPrivate, "<article") === 1 && noneButPrivate.includes('id="private-lessons"') && noneButPrivate.includes("No group matches that age and level.") && at(noneButPrivate, 'id="private-lessons"') < at(noneButPrivate, "No group matches that age and level."));
check("the box shows only then", !all.includes("No group matches") && !teens.includes("No group matches"));
const catalogSrc = read("src/components/sections/ProgramCatalog.tsx");
check("the catalog reads the URL in a Suspense boundary and writes it with replaceState", catalogSrc.includes("useSearchParams()") && catalogSrc.includes("<Suspense fallback={<ProgramCatalogView") && catalogSrc.includes("window.history.replaceState(null"));

// ── The quiz ────────────────────────────────────────────────────────────────
console.log("Recommendations name the groups");
const base = { goals: [] as string[], programs: [] as string[], preferredLocationIds: [] as string[], availability: [] as string[] };
const rec = (ageBand: "junior" | "teen" | "adult", level?: "new" | "rally" | "competitive" | "elite", programs: string[] = []) =>
  recommendPrograms({ ...base, who: ageBand === "adult" ? "adult" : "youth", ageBand, level, programs });
check("junior beginner → Youth Bootcamps, the Beginner (exact) and Novice (one tier up) groups", rec("junior", "new")[0].program.id === "youth-programs" && ids(rec("junior", "new")[0].groups) === "youth-7-10,youth-11-15", ids(rec("junior", "new")[0].groups));
check("junior competitive → High Performance first (by approval), then the Novice group one tier away", ids(rec("junior", "competitive")[0].groups) === "high-performance,youth-11-15", ids(rec("junior", "competitive")[0].groups));
check("teen beginner → the Novice Youth Bootcamp only (one tier up; High Performance is four away)", ids(rec("teen", "new")[0].groups) === "youth-11-15");
check("teen tournament player → High Performance only (one tier up from Advanced)", ids(rec("teen", "elite")[0].groups) === "high-performance");
check("teen, level unsure → every group a teen can join", ids(rec("teen")[0].groups) === "youth-11-15,high-performance");
check("adult beginner → Adult Bootcamps, the Beginner group (Intermediate is two tiers away)", rec("adult", "new")[0].program.id === "bootcamps" && ids(rec("adult", "new")[0].groups) === "adult-newer");
check("adult competitive → Intermediate (exact) and Advanced (one up); tournament → Intermediate and Advanced", ids(rec("adult", "competitive")[0].groups) === "adult-intermediate,adult-advanced" && ids(rec("adult", "elite")[0].groups) === "adult-intermediate,adult-advanced", ids(rec("adult", "elite")[0].groups));
check("adult, level unsure → all three adult groups", ids(rec("adult")[0].groups) === "adult-newer,adult-intermediate,adult-advanced");
check("private lessons only when asked for; asked for, first (every surface shows the first match)", rec("adult", "rally").length === 1 && ids(rec("adult", "rally", ["private"]).map((r) => r.program)) === "private-lessons,bootcamps", ids(rec("adult", "rally", ["private"]).map((r) => r.program)));
check("a competitive adult is never sent to the youth High Performance group", rec("adult", "competitive").every((r) => !r.groups.some((x) => x.id === "high-performance")));
const hpReason = rec("teen", "elite")[0].reason;
check("the High Performance reason names its day and start", hpReason.includes("every Saturday at 2:00") && hpReason.includes("competitive track"), hpReason);
check("a one-group youth reason leads with the group, the day and the start", rec("teen", "new")[0].reason.startsWith("Novice Youth Bootcamp group, Saturday at 1:00"), rec("teen", "new")[0].reason);
check("groupsFor never returns an empty list", listedPrograms.every((p) => groupsFor(p, { ...base, ageBand: "junior", level: "elite" }).length > 0));
check("groupSummaryLine", groupSummaryLine(g("high-performance")) === "Saturdays 2:00–3:00 pm · Ages 12–17" && groupSummaryLine(g("adult-newer")) === "Sundays 4:00–5:00 pm · Ages 16 and up" && groupSummaryLine(g("private-lessons")) === "By arrangement · Any age");
check("matchGroupsLabel: one scheduled group → Group, private lessons → Lesson (never a group), several → Groups", matchGroupsLabel([g("high-performance")]) === "Group" && matchGroupsLabel([g("private-lessons")]) === "Lesson" && matchGroupsLabel(rec("adult")[0].groups) === "Groups", matchGroupsLabel([g("private-lessons")]));
check("recommendationHref: one scheduled group → its card; several → the program; private lessons → the page, no anchor", recommendationHref(rec("teen", "elite")[0]) === "/programs/youth-programs#high-performance" && recommendationHref(rec("junior", "new")[0]) === "/programs/youth-programs" && recommendationHref(rec("adult", "rally", ["private"])[0]) === "/programs/private-lessons", recommendationHref(rec("adult", "rally", ["private"])[0]));
const intake = read("src/app/intake/page.tsx");
check("the quiz's match card lists the groups, labels them through matchGroupsLabel and links through recommendationHref", intake.includes("const href = recommendationHref(rec);") && intake.includes("groupSummaryLine(g)") && intake.includes("{matchGroupsLabel(groups)}") && !intake.includes('? "Group" : "Groups"') && !intake.includes("formatTierSpan(g."));
check("Browse Programs on a one-player result opens the filtered catalog", intake.includes("<ResultLinks catalogHref={quizCatalogHref(result.ageBand, result.level)} />"));
check("?program=private-lessons seeds the private option", intake.includes('"private-lessons": "private"') && !intake.includes('"kids-summer-camp"'));

// ── Old URLs ────────────────────────────────────────────────────────────────
console.log("Redirects and the sitemap");
async function redirectChecks() {
  const served = nextConfig.redirects ? await nextConfig.redirects() : [];
  check("/programs/high-performance → the youth page's HP group, permanently", served.some((r) => r.source === "/programs/high-performance" && r.destination === "/programs/youth-programs#high-performance" && r.permanent === true));
  check("/programs/kids-summer-camp → /programs, permanently", served.some((r) => r.source === "/programs/kids-summer-camp" && r.destination === "/programs" && r.permanent === true));
  check("the redirect table has no other entries", LEGACY_PROGRAM_REDIRECTS.length === 2);
  check("the HP anchor is the HP group's id", LEGACY_PROGRAM_REDIRECTS[0].to.endsWith(`#${g("high-performance").id}`));
  // The seat read (async): nothing is read while no group has a public cohort,
  // and with a cohort but no sheet to read (this test has none) there is no count.
  check("seats: no open block, no read and no count", Object.keys(await readBlockSeats([])).length === 0);
  check("seats: a missing read is no count, never an error", Object.keys(await readBlockSeats([openCohort])).length === 0);
}
const urls = sitemap().map((e) => e.url);
check("sitemap lists the three programs and neither retired page", listedPrograms.every((p) => urls.some((u) => u.endsWith(`/programs/${p.slug}`))) && !urls.some((u) => u.endsWith("/programs/high-performance") || u.endsWith("/programs/kids-summer-camp")));

// ── Photographs ─────────────────────────────────────────────────────────────
console.log("Program photographs (free licence, credited, within the caps)");

/** The pixel size of a WebP file from its header (VP8, VP8L or VP8X). */
function webpSize(buf: Buffer): { width: number; height: number } | null {
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WEBP") return null;
  const chunk = buf.toString("ascii", 12, 16);
  if (chunk === "VP8X") {
    return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
  }
  if (chunk === "VP8 ") {
    return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === "VP8L") {
    const bits = buf.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return null;
}

const credits = read("public/images/programs/CREDITS.md");
check("CREDITS.md names the Unsplash License", credits.includes("https://unsplash.com/license"));
for (const p of listedPrograms) {
  const photo = p.photo!;
  const file = join(ROOT, "public", photo.src);
  const name = photo.src.split("/").pop()!;
  check(`${p.id}: the photo file exists and is WebP`, existsSync(file) && name.endsWith(".webp"));
  if (!existsSync(file)) continue;
  const size = statSync(file).size;
  check(`${p.id}: at most 250 KB (${Math.round(size / 1024)} KB)`, size <= 250 * 1024);
  const dims = webpSize(readFileSync(file));
  check(`${p.id}: at most 1600px wide, 16:10, and the data file agrees`, !!dims && dims.width <= 1600 && dims.width === photo.width && dims.height === photo.height && Math.abs(dims.width / dims.height - 1.6) < 0.01, JSON.stringify(dims));
  const row = credits.split("\n").find((l) => l.includes(`\`${name}\``));
  check(`${p.id}: credited with a photographer and the photo's Unsplash page`, !!row && /https:\/\/unsplash\.com\/photos\/\S+/.test(row) && row.split("|").length >= 5);
  check(`${p.id}: alt text describes the scene, never the program name`, !photo.alt.toLowerCase().includes(p.title.toLowerCase()) && !/^(photo|image|picture)/i.test(photo.alt) && /[.]$/.test(photo.alt));
}
check("the old Figma tiles stay gone", ["kids-summer-camp.png", "bootcamps.png", "group-lessons.png"].every((f) => !existsSync(join(ROOT, "public", "images", "programs", f))));
check("design-system.md documents the photography rules", read("ops/briefs/design-system.md").includes("## Program photography"));
const pkg = JSON.parse(read("package.json")) as { scripts: { test: string } };
check("npm test runs this file", pkg.scripts.test.includes("npx tsx src/scripts/test-program-groups.ts"));

redirectChecks().then(() => {
  if (failed > 0) {
    console.log(`\n${failed} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll program group checks passed.");
});
