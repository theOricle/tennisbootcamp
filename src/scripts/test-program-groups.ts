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
// Exits non-zero on any failure. Never spells the cohort length or total.

import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  COHORT_LENGTH,
  COHORT_TOTAL_LABEL,
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
import { LOW_SEATS_THRESHOLD, groupAction, groupStatus, groupWhenParts, groupWhoLabel, programHeadingLine } from "../lib/programCatalog";
import { groupSeatsFromSnapshot, readGroupSeats } from "../lib/groupSeats";
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
  check(`${g.id}: price from the constant`, g.price === (g.day ? PRICE_SUMMARY : PRIVATE_LESSONS_PRICE));
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
const youth = listedPrograms.find((p) => p.slug === "youth-programs")!;
const privateProgram = listedPrograms.find((p) => p.slug === "private-lessons")!;
const [SESSION_LINE, COHORT_LINE] = PRICE_SUMMARY.split(" · ");
const hpCard = render(createElement(ProgramGroupCard, { group: g("high-performance"), program: youth }));
check("one interactive element per card: its button, a link named for the group", count(hpCard, "<a ") === 1 && count(hpCard, "<button") === 0 && count(hpCard, "<input") === 0 && count(hpCard, "<select") === 0 && /<a [^>]*href="\/intake\?program=youth-programs"[^>]*>Ask to join<span class="sr-only"> the High Performance Youth Bootcamp<\/span><\/a>/.test(hpCard), hpCard.match(/<a [^>]*>[\s\S]*?<\/a>/)?.[0]);
check("the article carries the id anchor and its scroll margin, and the card itself is no longer a link", hpCard.includes('<article id="high-performance"') && hpCard.includes("scroll-mt-24") && !hpCard.includes("after:absolute after:inset-0"));
check("top row: the one level tag, then the status chip; no eyebrow", at(hpCard, ", tier 5 of 5, levels 5.0–7.0") > 0 && at(hpCard, ", tier 5 of 5, levels 5.0–7.0") < at(hpCard, "By approval</span>") && at(hpCard, "By approval</span>") < at(hpCard, "<h3") && !hpCard.includes("Weekend group class") && !hpCard.includes("uppercase"));
check("the title leads with the level", hpCard.includes(">High Performance Youth Bootcamp</h3>"));
check("the status chip reads By approval, with the hollow ring (joining flow)", hpCard.includes("By approval</span>") && hpCard.includes("rounded-full border border-white/70") && !hpCard.includes("Groups forming"));
check("three plain lines, each with an icon and no label: who, when, where", count(hpCard, "<li") === 3 && count(hpCard, "<svg") >= 3 && hpCard.includes("Ages 12–17</li>") && hpCard.includes(">Saturdays 2:00–3:00 pm</span>") && hpCard.includes("Newtonbrook Tennis Club</li>") && !hpCard.includes("<dt") && !hpCard.includes("<dl") && at(hpCard, "Ages 12–17</li>") < at(hpCard, ">Saturdays 2:00–3:00 pm</span>") && at(hpCard, ">Saturdays 2:00–3:00 pm</span>") < at(hpCard, "Newtonbrook Tennis Club</li>"));
check("the helpers behind the lines", groupWhoLabel(g("youth-7-10")) === "Ages 7–10" && groupWhoLabel(g("adult-newer")) === "16 and up" && groupWhoLabel(g("private-lessons")) === "Any age" && groupWhenParts(g("youth-7-10")).join("|") === "Saturdays 12:00–1:00 pm");
check("one level tag: the mark and the name with no chip around them, no span, no band, no rail", hpCard.includes(">High Performance</span>") && hpCard.includes(", tier 5 of 5, levels 5.0–7.0") && /<span class="inline-flex items-center gap-1\.5 text-\[13px\] text-white"><svg/.test(hpCard) && !hpCard.includes("–<") && !hpCard.includes('aria-label="Built for') && !hpCard.includes('role="meter"') && !hpCard.includes("3.0–5.5"));
check("the price once, stacked: the session price over the cohort total", count(hpCard, SESSION_LINE) === 1 && count(hpCard, COHORT_LINE) === 1 && at(hpCard, `>${SESSION_LINE}</span>`) > 0 && at(hpCard, `>${SESSION_LINE}</span>`) < at(hpCard, `>${COHORT_LINE}</span>`));
check("the price reads the price constants, and the card types none", PRICE_SUMMARY === `${SESSION_PRICE_LABEL} a session · ${COHORT_TOTAL_LABEL} for ${COHORT_LENGTH}` && hpCard.includes(`>${SESSION_PRICE_LABEL} a session</span>`) && hpCard.includes(`>${COHORT_TOTAL_LABEL} for ${COHORT_LENGTH}</span>`) && !/\$\d/.test(read("src/components/sections/ProgramGroupCard.tsx")));
check("the price sits in the foot, after the lines and before the button, on a hairline pinned to the bottom", at(hpCard, "Newtonbrook Tennis Club</li>") < at(hpCard, `>${SESSION_LINE}</span>`) && at(hpCard, `>${COHORT_LINE}</span>`) < at(hpCard, "<a ") && hpCard.includes('<div class="mt-auto flex') && hpCard.includes("border-t border-white/10") && hpCard.includes("flex h-full"));
// What left the card (owner-approved design, 2026-11-17): the competitive
// note, the Join and Week 1 rows and the Next row. The note stays in the data.
check("no note and no rules on the card", !hpCard.includes("The competitive track") && !hpCard.includes("Week 1") && !hpCard.includes("No assessment needed") && !hpCard.includes("Take the 2-minute quiz"));
check("no photo, no plate on a group card", !hpCard.includes("<img") && !hpCard.includes('viewBox="0 100 1600 800"'));
const h4Card = render(createElement(ProgramGroupCard, { group: g("high-performance"), program: youth, headingLevel: 4 }));
check("headingLevel 4 renders the title as an h4", h4Card.includes(">High Performance Youth Bootcamp</h4>") && !h4Card.includes("<h3") && !h4Card.includes("<h2"));
const adultCard = render(createElement(ProgramGroupCard, { group: g("adult-newer"), program: listedPrograms[1] }));
check("an adult group: 16 and up, Sundays, the Open to join chip, a lime Join named for the group", adultCard.includes("16 and up</li>") && adultCard.includes(">Sundays 4:00–5:00 pm</span>") && adultCard.includes("Open to join</span>") && adultCard.includes(">Beginner Adult Bootcamp</h3>") && /<a [^>]*href="\/intake\?program=bootcamps"[^>]*bg-\[#B4E655\][^>]*>Join<span class="sr-only"> the Beginner Adult Bootcamp<\/span><\/a>|<a [^>]*bg-\[#B4E655\][^>]*href="\/intake\?program=bootcamps"[^>]*>Join<span class="sr-only"> the Beginner Adult Bootcamp<\/span><\/a>/.test(adultCard));
const cohort: Cohort = {
  id: "hp-fall", programId: "youth-programs", locationId: "", label: "Fall HP", startDate: "2026-10-18", endDate: "2026-11-22", weeks: 6,
  sessions: [{ day: "Sat", start: "14:00", end: "15:00" }], capacityMin: 4, capacityMax: 8, priceCents: 0, currency: "CAD", status: "open", levelMin: 3, levelMax: 5.5,
};
const withCohort = render(createElement(ProgramGroupCard, { group: g("high-performance"), program: youth, nextCohort: cohort }));
check("High Performance with a public cohort keeps By approval; the when line gains the start date", withCohort.includes("By approval</span>") && !withCohort.includes("Next cohort Oct 18") && withCohort.includes(">starts Oct 18</span>") && at(withCohort, "Saturdays 2:00–3:00 pm") < at(withCohort, ">starts Oct 18</span>") && count(withCohort, "<li") === 3);
const openCohort: Cohort = { ...cohort, id: "y710-fall", label: "Fall 7–10", sessions: [{ day: "Sat", start: "12:00", end: "13:00" }], levelMin: 1, levelMax: 2.5 };
const openWithCohort = render(createElement(ProgramGroupCard, { group: g("youth-7-10"), program: youth, nextCohort: openCohort }));
check("an open group with a public cohort stays Open to join, and starts {date} joins the when line only then", openWithCohort.includes("Open to join</span>") && !openWithCohort.includes("Next cohort") && openWithCohort.includes(">starts Oct 18</span>") && !hpCard.includes("starts ") && groupWhenParts(g("youth-7-10"), openCohort).join("|") === "Saturdays 12:00–1:00 pm|starts Oct 18");
check("the when line wraps whole: each part stays on one line, the dot riding the part before it", /<span class="whitespace-nowrap">Saturdays 12:00–1:00 pm<span aria-hidden="true"> ·<\/span><\/span><span class="whitespace-nowrap">starts Oct 18<\/span>/.test(openWithCohort));

// ── The four states (owner-approved design, 2026-11-17) ─────────────────────
console.log("The card's four states: groupStatus, the seat rules, and the button");
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
const act = (group: ProgramGroup, seats?: number | null) => groupAction(group, groupStatus(group, seats));
check("open and last spots: a lime Join", act(open).kind === "join" && act(open).label === "Join" && act(open, 2).kind === "join" && act(open, 2).label === "Join");
check("full: Notify me", act(open, 0).kind === "notify" && act(open, 0).label === "Notify me");
check("by approval and invite only: Ask to join", act(hp).kind === "ask" && act(hp).label === "Ask to join" && act({ ...open, status: "invite-only" }).label === "Ask to join");
check("each button is named for its group", act(open).nameSuffix === " the Beginner Junior Bootcamp" && act(hp).nameSuffix === " the High Performance Youth Bootcamp" && act(open, 0).nameSuffix === " when the Beginner Junior Bootcamp has a spot");
const lowCard = render(createElement(ProgramGroupCard, { group: open, program: youth, seatsLeft: 2 }));
check("last spots: the warn chip, computed from the seats, and a lime Join", lowCard.includes("border-yellow-400/30 bg-yellow-400/10 text-yellow-200") && lowCard.includes(">2 spots left</span>") && />Join<span class="sr-only"> the Beginner Junior Bootcamp<\/span><\/a>/.test(lowCard) && /<a [^>]*bg-\[#B4E655\]/.test(lowCard) && !lowCard.includes("Open to join"));
const fullCard = render(createElement(ProgramGroupCard, { group: open, program: youth, seatsLeft: 0 }));
check("full: the neutral chip, and an outline Notify me to the footer's newsletter line", fullCard.includes(">Full</span>") && !fullCard.includes("yellow") && /<a [^>]*href="#notify"[^>]*>Notify me<span class="sr-only"> when the Beginner Junior Bootcamp has a spot<\/span><\/a>/.test(fullCard) && !/<a [^>]*bg-\[#B4E655\]/.test(fullCard) && count(fullCard, "<a ") === 1 && !fullCard.includes("/intake"));
const fullOwnForm = render(createElement(ProgramGroupCard, { group: open, program: youth, seatsLeft: 0, notifyHref: "#cohorts" }));
check("…or to the page's own form where the page has one", fullOwnForm.includes('href="#cohorts"') && !fullOwnForm.includes('href="#notify"'));
const inviteCard = render(createElement(ProgramGroupCard, { group: { ...open, status: "invite-only" }, program: youth }));
check("invite only: its chip, and an outline Ask to join", inviteCard.includes(">Invite only</span>") && />Ask to join<span class="sr-only"> the Beginner Junior Bootcamp<\/span><\/a>/.test(inviteCard) && !/<a [^>]*bg-\[#B4E655\]/.test(inviteCard));
const cardSrc = read("src/components/sections/ProgramGroupCard.tsx");
check("Join and Ask to join open the quiz for the program, with the card's tracking source", cardSrc.includes("href={`/intake?program=${programSlug}`}") && cardSrc.includes('track="quiz"') && cardSrc.includes("source={source}"));
check("a card always reads its own action: it opts out of the quiz-taken swap", cardSrc.includes("quizAware={false}"));
check("the lime and the outline button share one height, so sibling feet line up", cardSrc.includes('const shape = "h-[46px] whitespace-nowrap";'));

console.log("Seats: one read, the enroll page's count, display only");
{
  const header = ["cohort_id", "status"];
  const paid = (id: string, n: number) => Array.from({ length: n }, () => [id, "paid"]);
  const snapshot = { header, rows: [...paid("y710-fall", 6), ["y710-fall", "pending"], ...paid("hp-fall", 8)] };
  const seats = groupSeatsFromSnapshot(programGroups, [openCohort, cohort], snapshot);
  check("seats are capacity minus the cohort's paid rows, for each group's next public cohort", seats["youth-7-10"] === 2 && seats["high-performance"] === 0);
  check("a group with no public cohort has no count", !("youth-11-15" in seats) && !("private-lessons" in seats) && Object.keys(seats).length === 2);
  check("the card then reads the count: 2 spots left, and Full", groupStatus(open, seats["youth-7-10"])?.label === "2 spots left" && groupStatus(hp, seats["high-performance"])?.label === "Full" && groupStatus(g("youth-11-15"), seats["youth-11-15"])?.label === "Open to join");
  check("an empty sheet means every seat is free", groupSeatsFromSnapshot(programGroups, [openCohort], { header, rows: [] })["youth-7-10"] === openCohort.capacityMax);
  check("no snapshot, or one without the columns: no count, so Open to join", Object.keys(groupSeatsFromSnapshot(programGroups, [openCohort], null)).length === 0 && Object.keys(groupSeatsFromSnapshot(programGroups, [openCohort], { header: ["x"], rows: [["y"]] })).length === 0);
  const seatsSrc = read("src/lib/groupSeats.ts");
  check("the count is the one the enroll page uses, and the module never writes", seatsSrc.includes('import { readEnrollmentSheet, seatsFromSnapshot } from "@/lib/seatCount";') && !/\.(append|update|insert|delete|upsert)\(/.test(seatsSrc));
  check("a read that fails or throws is no count, never an error", seatsSrc.includes('return read.status === "ok" ? read.snapshot : null;') && seatsSrc.includes("} catch (err) {") && seatsSrc.includes("return null;"));
  check("/programs reads the seats once per render", count(read("src/app/programs/page.tsx"), "readGroupSeats(") === 1 && read("src/app/programs/page.tsx").includes("seats={seats}"));
  const detailSrc = read("src/app/programs/[slug]/page.tsx");
  check("a program page reads the sheet once, for its cohort cards and its group cards", count(detailSrc, "readSeatSnapshot()") === 1 && !detailSrc.includes("getSeatsRemaining") && detailSrc.includes("groupSeatsFromSnapshot(scheduledGroups, publicCohorts, seatSnapshot)") && detailSrc.includes("seatsLeft={groupSeats[g.id]}"));
  check("a program page's cohort cards use the same threshold", detailSrc.includes("seats <= LOW_SEATS_THRESHOLD") && !/seats <= [1-9]/.test(detailSrc));
}

console.log("A group with no fixed class: one row");
const soloRow = render(createElement(ArrangedGroupRow, { group: g("private-lessons"), program: privateProgram, source: "programs-group" }));
check("private lessons: its name, by arrangement and the price in one line, no chip", soloRow.includes(">One-to-one coaching</h3>") && soloRow.includes(`>By arrangement · ${PRIVATE_LESSONS_PRICE}</p>`) && !soloRow.includes("Open to join") && soloRow.includes('<article id="private-lessons"'));
check("one outline button, Ask about lessons, where the private card's link always led", count(soloRow, "<a ") === 1 && /<a [^>]*href="\/intake\?program=private-lessons"[^>]*>Ask about lessons<\/a>/.test(soloRow) && !/<a [^>]*bg-\[#B4E655\]/.test(soloRow));

console.log("ProgramCatalogView markup");
const catalogPrograms: CatalogProgram[] = listedPrograms.map((p) => ({ slug: p.slug, title: p.title }));
const view = (query = EMPTY_QUERY, groups = programGroups, seats: Record<string, number> = {}) =>
  render(createElement(ProgramCatalogView, { programs: catalogPrograms, groups, nextCohorts: {}, seats, header: createElement("h1", null, "Our Programs"), query, onChange: () => {} }));
const all = view();
check("every group under its program, three sections: a card per class, one row for private lessons", count(all, "<article") === programGroups.length && listedPrograms.every((p) => all.includes(`id="catalog-${p.slug}"`)) && count(all, '<ul role="list" class="mt-3.5 grid gap-3 md:grid-cols-3 md:gap-4"') === 2);
check(
  "the page's h1, a program title h2 per section, a group title h3 per card: no two levels share a rank",
  count(all, "<h1") === 1 && count(all, "<h2") === listedPrograms.length && count(all, "<h3") === programGroups.length && count(all, "<h4") === 0 && programGroups.every((x) => all.includes(`>${x.name}</h3>`)),
  `h2 ${count(all, "<h2")} · h3 ${count(all, "<h3")} · h4 ${count(all, "<h4")}`
);
check("three labelled dropdowns in the band, and no Clear button beside them", count(all, "<select") === 3 && all.includes(">Location</label>") && all.includes(">Player’s age</label>".replace("’", "&#x27;")) && all.includes(">Level</label>") && !all.includes(">Clear filters</button>"));
check("the results line stays a live region, for screen readers only", /<p role="status" aria-live="polite" class="sr-only">7 groups<\/p>/.test(all));
check("the age select keeps the bands and the exact ages", all.includes('<optgroup label="Age group">') && all.includes('<optgroup label="Exact age">') && all.includes('<option value="14">14</option>') && all.includes('<option value="adult">Adult (18+)</option>'));
check("the level select offers the five tier names by slug, no number bands", TIERS.every((t) => all.includes(`<option value="${t.slug}">${t.name}</option>`)) && TIERS.every((t) => !all.includes(`${t.name} · ${t.band}`)) && count(all, "<option value=") === 1 + 1 + 3 + EXACT_AGES.length + 1 + TIERS.length);
check("each program's heading row: its title, linked to its page, and one derived line", listedPrograms.every((p) => new RegExp(`<h2 id="catalog-${p.slug}"[^>]*><a [^>]*href="/programs/${p.slug}"[^>]*>${p.title}</a></h2>`).test(all)) && all.includes(">Saturdays · ages 7–17</p>") && all.includes(">Sundays · 16 and up</p>") && all.includes(">Any age · any level</p>"));
check("the heading lines are derived from the groups", programHeadingLine(groupsForProgram("youth-programs")) === "Saturdays · ages 7–17" && programHeadingLine(groupsForProgram("bootcamps")) === "Sundays · 16 and up" && programHeadingLine(groupsForProgram("private-lessons")) === "Any age · any level");
check("no photo and no description in the list (both stay on the program's page)", !all.includes("<img") && listedPrograms.every((p) => !all.includes(p.description)));
check("the quiz is a side line under the dropdowns, never a lime button", /Not sure which group\? <a [^>]*href="\/intake"[^>]*>Take the 2-minute quiz<\/a>/.test(all) && at(all, "</fieldset>") < at(all, "Not sure which group?") && at(all, "Not sure which group?") < at(all, 'id="groups"'));
check("the groups sit under the anchor the main button scrolls to", /<div class="[^"]*scroll-mt-24" id="groups">/.test(all));
check("private lessons is one row with Ask about lessons", all.includes(`>By arrangement · ${PRIVATE_LESSONS_PRICE}</p>`) && all.includes(">Ask about lessons</a>"));
const withSeats = view(EMPTY_QUERY, programGroups, { "youth-7-10": 2, "adult-intermediate": 0 });
check("the catalog passes each group its seats", withSeats.includes(">2 spots left</span>") && count(withSeats, ">Full</span>") === 1 && count(withSeats, ">Notify me<") === 1 && count(withSeats, "Open to join</span>") === 3);
const teens = view(parseCatalogQuery(params("age=14&level=novice")));
check("a filtered view keeps only the matching groups and sections", count(teens, "<article") === 2 && teens.includes("2 groups for age 14 at Novice") && !teens.includes('id="catalog-bootcamps"') && teens.includes('<option value="14" selected="">') && !teens.includes("Closest fit"));
const nearest = view(parseCatalogQuery(params("age=14&level=intermediate")));
check("Closest fit: the exact match (private lessons), then the nearest-level group with the week-one line", count(nearest, "<article") === 2 && nearest.includes("1 group for age 14 at Intermediate") && nearest.includes(">Closest fit</h2>") && nearest.includes("The nearest levels to Intermediate for age 14.") && !nearest.includes("tagged") && nearest.includes("on court in week one") && nearest.includes("we move you to it at the same price") && at(nearest, 'id="catalog-private-lessons"') < at(nearest, ">Closest fit</h2>") && at(nearest, ">Closest fit</h2>") < at(nearest, 'id="youth-11-15"'));
check("Closest fit cards are the same card, named by their level-led titles", nearest.includes(">Novice Youth Bootcamp</h3>") && />Join<span class="sr-only"> the Novice Youth Bootcamp<\/span><\/a>/.test(nearest) && !nearest.includes("No group matches"));
const none = view(parseCatalogQuery(params("age=5&level=high-performance")), programGroups.filter((x) => x.id !== "private-lessons"));
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
  check("seats: no public cohort, no read and no count", Object.keys(await readGroupSeats(programGroups, [])).length === 0);
  check("seats: a missing read is no count, never an error", Object.keys(await readGroupSeats(programGroups, [openCohort])).length === 0);
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
