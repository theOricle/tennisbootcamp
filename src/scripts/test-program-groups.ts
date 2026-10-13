// Run from project root: npx tsx src/scripts/test-program-groups.ts
//
// Pins audit PR K (owner decisions 2026-10-12, "Program catalog rebuild"),
// as reshaped by audit PR P (owner 2026-10-13: one level tag per group,
// level-led titles, exact level filter with a Closest fit):
// the group lineup, the /programs age and level filters and their URL, the
// group card and the catalog rendered to markup, the quiz's group-aware
// recommendations and links, the old program URLs' redirects, and the
// program photographs (free licence, credited, 16:10, under the size cap).
// Exits non-zero on any failure. Never spells the cohort length or total.

import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  PRICE_SUMMARY,
  PRIVATE_LESSONS_PRICE,
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
import { ProgramGroupCard } from "../components/sections/ProgramGroupCard";
import { ProgramCatalogView, type CatalogProgram } from "../components/sections/ProgramCatalog";
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
const hpCard = render(createElement(ProgramGroupCard, { group: g("high-performance"), program: youth }));
check("one link per card, the quiz, named for the group", count(hpCard, "<a ") === 1 && /<a [^>]*href="\/intake\?program=youth-programs"[^>]*>Take the 2-minute quiz<span class="sr-only">, for the High Performance Youth Bootcamp<\/span><\/a>/.test(hpCard), hpCard.match(/<a [^>]*>[\s\S]*?<\/a>/)?.[0]);
check("the link is stretched and the article carries the id anchor and focus ring", hpCard.includes("after:absolute after:inset-0") && hpCard.includes('id="high-performance"') && hpCard.includes("scroll-mt-24") && hpCard.includes("has-[a:focus-visible]:ring-2"));
check("the eyebrow is the kind of class, never the day; the title leads with the level", hpCard.includes(">Weekend group class</p>") && !hpCard.includes(">Saturdays</p>") && hpCard.includes(">High Performance Youth Bootcamp</h3>"));
check("the status chip reads By approval, with the hollow ring (joining flow)", hpCard.includes("By approval</span>") && hpCard.includes("rounded-full border border-white/70") && !hpCard.includes("Groups forming"));
check("Level, Ages, When and Price rows", /<dt[^>]*>Level<\/dt>/.test(hpCard) && /<dt[^>]*>Ages<\/dt><dd[^>]*>12–17<\/dd>/.test(hpCard) && /<dt[^>]*>When<\/dt><dd[^>]*>Saturdays 2:00–3:00 pm<\/dd>/.test(hpCard) && /<dt[^>]*>Price<\/dt>/.test(hpCard) && hpCard.includes(PRICE_SUMMARY.split(" · ")[0]) && !/<dt[^>]*>Time<\/dt>/.test(hpCard));
check("one level tag: the tier chip with its mark, no span, no band, no rail", hpCard.includes(">High Performance</span>") && hpCard.includes(", tier 5 of 5, levels 5.0–7.0") && !hpCard.includes("–<") && !hpCard.includes('aria-label="Built for') && !hpCard.includes('role="meter"') && !hpCard.includes("3.0–5.5"));
check("the Level row comes first", at(hpCard, ">Level</dt>") < at(hpCard, ">Ages</dt>") && at(hpCard, ">Ages</dt>") < at(hpCard, ">When</dt>"));
check("the competitive note is shown", hpCard.includes("The competitive track"));
check(
  "the note sits under the rows, above the CTA, so sibling cards' rows line up",
  at(hpCard, "The competitive track") > at(hpCard, "</dl>") &&
    at(hpCard, "The competitive track") > at(hpCard, ">Price</dt>") &&
    at(hpCard, "The competitive track") < at(hpCard, "Take the 2-minute quiz")
);
check("no photo, no plate on a group card", !hpCard.includes("<img") && !hpCard.includes('viewBox="0 100 1600 800"'));
const h4Card = render(createElement(ProgramGroupCard, { group: g("high-performance"), program: youth, headingLevel: 4 }));
check("headingLevel 4 renders the title as an h4", h4Card.includes(">High Performance Youth Bootcamp</h4>") && !h4Card.includes("<h3") && !h4Card.includes("<h2"));
const withProgram = render(createElement(ProgramGroupCard, { group: g("adult-newer"), program: listedPrograms[1], showProgram: true }));
check("showProgram makes the program's title the eyebrow, with no day", withProgram.includes(">Adult Bootcamps</p>") && !withProgram.includes("Sundays</p>") && withProgram.includes(">16 and up<") && withProgram.includes(">Beginner Adult Bootcamp</h3>"));
const soloCard = render(createElement(ProgramGroupCard, { group: g("private-lessons"), program: privateProgram }));
check("private lessons: no chip, by arrangement, rates on request, all levels", !soloCard.includes("Groups forming") && soloCard.includes(">Private Lessons</p>") && !soloCard.includes(">One-to-one coaching</p>") && /<dt[^>]*>When<\/dt><dd[^>]*>By arrangement<\/dd>/.test(soloCard) && soloCard.includes(`>${PRIVATE_LESSONS_PRICE}<`) && soloCard.includes(">All levels<") && soloCard.includes(", for the One-to-one coaching group"));
const cohort: Cohort = {
  id: "hp-fall", programId: "youth-programs", locationId: "", label: "Fall HP", startDate: "2026-10-18", endDate: "2026-11-22", weeks: 6,
  sessions: [{ day: "Sat", start: "14:00", end: "15:00" }], capacityMin: 4, capacityMax: 8, priceCents: 0, currency: "CAD", status: "open", levelMin: 3, levelMax: 5.5,
};
const withCohort = render(createElement(ProgramGroupCard, { group: g("high-performance"), program: youth, nextCohort: cohort }));
check("High Performance with a public cohort keeps By approval; the Next row carries the dates", withCohort.includes("By approval</span>") && !withCohort.includes("Next cohort Oct 18") && /<dt[^>]*>Next<\/dt>/.test(withCohort));
const openCohort: Cohort = { ...cohort, id: "y710-fall", label: "Fall 7–10", sessions: [{ day: "Sat", start: "12:00", end: "13:00" }], levelMin: 1, levelMax: 2.5 };
const openWithCohort = render(createElement(ProgramGroupCard, { group: g("youth-7-10"), program: youth, nextCohort: openCohort }));
check("an open group with a public cohort → the lime chip and the Next row", openWithCohort.includes("Next cohort Oct 18") && /<dt[^>]*>Next<\/dt>/.test(openWithCohort) && !openWithCohort.includes("Open to join"));

console.log("ProgramCatalogView markup");
const catalogPrograms: CatalogProgram[] = listedPrograms.map((p) => ({ slug: p.slug, title: p.title, type: p.type, description: p.description, photo: p.photo, ageBands: p.ageBands, timetable: p.timetable, schedule: p.schedule }));
const view = (query = EMPTY_QUERY, groups = programGroups) =>
  render(createElement(ProgramCatalogView, { programs: catalogPrograms, groups, nextCohorts: {}, query, onChange: () => {} }));
const all = view();
check("every group as a card under its program, three sections", count(all, "<article") === programGroups.length && listedPrograms.every((p) => all.includes(`id="catalog-${p.slug}"`)));
check(
  "one h2, a program title h3 per section, a group title h4 per card: no two levels share a rank",
  count(all, "<h2") === 1 && count(all, "<h3") === listedPrograms.length && count(all, "<h4") === programGroups.length && programGroups.every((x) => all.includes(`>${x.name}</h4>`)),
  `h2 ${count(all, "<h2")} · h3 ${count(all, "<h3")} · h4 ${count(all, "<h4")}`
);
check("two labelled selects and a Clear button", count(all, "<select") === 2 && all.includes(">Player’s age</label>".replace("’", "&#x27;")) && all.includes(">Level</label>") && all.includes(">Clear filters</button>"));
check("the results line is a live region", /<p role="status" aria-live="polite"[^>]*>7 groups<\/p>/.test(all));
check("the age select offers the bands and the exact ages", all.includes('<optgroup label="Age group">') && all.includes('<optgroup label="Exact age">') && all.includes('<option value="14">14</option>') && all.includes('<option value="adult">Adult (18+)</option>'));
check("the level select offers the five tiers by slug", TIERS.every((t) => all.includes(`<option value="${t.slug}">${t.name} · ${t.band}</option>`)) && count(all, "<option value=") === 1 + 3 + EXACT_AGES.length + 1 + TIERS.length);
check("each program section links to its page with its photo thumbnail", listedPrograms.every((p) => all.includes(`href="/programs/${p.slug}"`) && all.includes(`alt="${p.photo!.alt}"`)));
const teens = view(parseCatalogQuery(params("age=14&level=novice")));
check("a filtered view keeps only the matching groups and sections", count(teens, "<article") === 2 && teens.includes("2 groups for age 14 at Novice") && !teens.includes('id="catalog-bootcamps"') && teens.includes('<option value="14" selected="">') && !teens.includes("Closest fit"));
const nearest = view(parseCatalogQuery(params("age=14&level=intermediate")));
check("Closest fit: the exact match (private lessons), then the nearest-level group with the week-one line", count(nearest, "<article") === 2 && nearest.includes("1 group for age 14 at Intermediate") && nearest.includes(">Closest fit</h3>") && nearest.includes("The nearest levels to Intermediate for age 14.") && !nearest.includes("tagged") && nearest.includes("on court in week one") && nearest.includes("we move you to it at the same price") && at(nearest, 'id="catalog-private-lessons"') < at(nearest, ">Closest fit</h3>") && at(nearest, ">Closest fit</h3>") < at(nearest, 'id="youth-11-15"'));
check("Closest fit cards name their program in the eyebrow", nearest.includes(">Youth Bootcamps</p>"));
const none = view(parseCatalogQuery(params("age=5&level=high-performance")), programGroups.filter((x) => x.id !== "private-lessons"));
check("the empty state says what is true and what happens next, and only when nothing is near", none.includes("No group fits those filters yet.") && none.includes("Take the 2-minute quiz") && none.includes("widen the filters") && none.includes(">Clear filters</button>") && count(none, "<article") === 0 && !none.includes("Closest fit"));
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
