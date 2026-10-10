// Run from project root: npx tsx src/scripts/test-program-catalog.ts
//
// Pins audit PR G (2026-10-09, "Program catalog cards and the /programs
// page"): the catalog helpers (status precedence, eyebrow, slot text, spans,
// the fit rules and the dashboard suggestions), the card itself rendered to
// markup (one link per card, a real spec list, the Level block only with a
// span, the dashboard fit marker) and the surfaces that use it, as source
// checks since the repo has no DOM test runner. Exits non-zero on any
// failure. The cohort length and totals come from the constants; this file
// never spells them.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CAMP_PRICE_SUMMARY,
  CAMP_WEEK_PRICE_LABEL,
  PRICE_SUMMARY,
  listedPrograms,
  programs,
} from "../content/programs";
import { AGE_BANDS, ageBandIsMinor } from "../lib/ageBand";
import { formatStartDate } from "../lib/cohorts";
import { recommendPrograms } from "../lib/recommend";
import { formatTierSpan, tierForLevel } from "../lib/tiers";
import {
  formatSlotWhen,
  programEyebrow,
  programFitsAge,
  programFitsPlayer,
  programLevelRange,
  programStatus,
  slotLevelRange,
  suggestProgramsFor,
  suggestionsSubCopy,
  type SuggestPlayer,
} from "../lib/programCatalog";
import { ProgramCard, ProgramCardList, nextCohortFor } from "../components/sections/ProgramCard";
import { ProgramComingSoonBand } from "../components/sections/ProgramComingSoonBand";
import type { Cohort } from "../types/cohort";
import type { Program } from "../types/program";

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
const at = (hay: string, needle: string) => {
  const i = hay.indexOf(needle);
  return i === -1 ? Infinity : i;
};
const count = (hay: string, needle: string) => hay.split(needle).length - 1;
const onGrid = (n: number) => Number.isFinite(n) && n >= 1 && n <= 7 && Math.round(n * 2) === n * 2;

const byId = Object.fromEntries(programs.map((p) => [p.id, p])) as Record<string, Program>;
const youth = byId["youth-programs"];
const hp = byId["high-performance"];
const adult = byId["bootcamps"];
const camp = byId["kids-summer-camp"];

const cohort: Cohort = {
  id: "youth-fall-1",
  programId: "youth-programs",
  locationId: "",
  label: "Fall Cohort 1",
  startDate: "2026-10-18",
  endDate: "2026-11-22",
  weeks: 6,
  sessions: [{ day: "Sat", start: "12:00", end: "13:00" }],
  capacityMin: 4,
  capacityMax: 8,
  priceCents: 0,
  currency: "CAD",
  status: "open",
  levelMin: 1.0,
  levelMax: 2.5,
};

// ── Catalog data ────────────────────────────────────────────────────────────
console.log("Catalog data");
for (const p of listedPrograms) {
  check(`${p.id}: ageBands set`, p.ageBands.length > 0);
  check(`${p.id}: priceSummary set`, !!p.priceSummary);
  check(`${p.id}: levelNote set`, !!p.levelNote);
  if (!p.comingSoon) check(`${p.id}: live program has a timetable`, (p.timetable?.length ?? 0) > 0);
  check(
    `${p.id}: price from the constants`,
    p.priceSummary === (p.comingSoon ? CAMP_PRICE_SUMMARY : PRICE_SUMMARY),
    p.priceSummary
  );
  const range = programLevelRange(p);
  if (range) {
    check(`${p.id}: span on the half-step grid, 1.0 ≤ min ≤ max ≤ 7.0`, onGrid(range.min) && onGrid(range.max) && range.min <= range.max);
    const slots = p.timetable ?? [];
    const banded = slots.map(slotLevelRange);
    const some = banded.some(Boolean);
    check(`${p.id}: slots all banded or none`, !some || banded.every(Boolean));
    if (some && banded.every(Boolean)) {
      const ranges = banded as { min: number; max: number }[];
      const contiguous = ranges.every((r, i) => i === 0 || r.min === ranges[i - 1].max + 0.5);
      check(`${p.id}: slot bands contiguous, ascending, non-overlapping`, contiguous);
      check(`${p.id}: slot bands union equals the program span`, ranges[0].min === range.min && ranges[ranges.length - 1].max === range.max);
    }
  }
  for (const slot of p.timetable ?? []) {
    if (slot.ageBand) check(`${p.id}: slot ${slot.time} ageBand within the program's bands`, p.ageBands.includes(slot.ageBand));
  }
}
check("camp price names the weekly constant", CAMP_PRICE_SUMMARY.startsWith(CAMP_WEEK_PRICE_LABEL));

// ── Helpers ─────────────────────────────────────────────────────────────────
console.log("Helpers");
check("eyebrow: Youth Programs", programEyebrow(youth) === "Juniors and teens · Saturdays", programEyebrow(youth));
check("eyebrow: High Performance", programEyebrow(hp) === "Any age · Saturdays", programEyebrow(hp));
check("eyebrow: Adult Bootcamps", programEyebrow(adult) === "Adults · Sundays", programEyebrow(adult));
check("eyebrow: Kids' Summer Camp", programEyebrow(camp) === "Juniors · Summer Camp", programEyebrow(camp));
check("formatSlotWhen: Sat 12:00–1:00 pm", formatSlotWhen(youth.timetable![0]) === "Sat 12:00–1:00 pm", formatSlotWhen(youth.timetable![0]));
check("formatSlotWhen: Sun 4:00–5:00 pm", formatSlotWhen(adult.timetable![0]) === "Sun 4:00–5:00 pm", formatSlotWhen(adult.timetable![0]));
check("slotLevelRange: Adult 4:00 is Love – Rally", JSON.stringify(slotLevelRange(adult.timetable![0])) === JSON.stringify({ min: 1.0, max: 2.5 }));
check("slotLevelRange: Youth 12:00 is unbanded", slotLevelRange(youth.timetable![0]) === null);
check("programLevelRange: Youth 1.0–4.5", JSON.stringify(programLevelRange(youth)) === JSON.stringify({ min: 1.0, max: 4.5 }));
const unspanned: Program = { ...youth, levelMin: undefined, levelMax: undefined };
check("programLevelRange: unset → null", programLevelRange(unspanned) === null);
check("formatStartDate: Oct 18", formatStartDate("2026-10-18") === "Oct 18");
check("formatStartDate: no zero padding", formatStartDate("2027-01-05") === "Jan 5");

console.log("programStatus precedence");
check("coming soon beats a cohort", programStatus({ ...youth, comingSoon: true }, cohort).label === "Coming Soon");
check("a public cohort → Next cohort Oct 18", programStatus(youth, cohort).label === "Next cohort Oct 18", programStatus(youth, cohort).label);
check("invite only", programStatus({ ...youth, enrollmentStatus: "invite-only" }).label === "Invite only");
check("default is Groups forming (owner D11)", programStatus(youth).label === "Groups forming");
check("a cohort beats invite only", programStatus({ ...youth, enrollmentStatus: "invite-only" }, cohort).kind === "next-cohort");
check("nextCohortFor picks the earliest", nextCohortFor([{ ...cohort, id: "b", startDate: "2026-11-01" }, cohort], "youth-programs")?.id === "youth-fall-1");
check("nextCohortFor ignores other programs", nextCohortFor([cohort], "bootcamps") === undefined);

// ── Fit rules ───────────────────────────────────────────────────────────────
console.log("programFitsPlayer");
check("adult 2.0 fits Adult Bootcamps", programFitsPlayer(adult, { is_minor: false, level: 2.0 }));
check("adult 2.0 is outside High Performance (floor 3.0)", !programFitsPlayer(hp, { is_minor: false, level: 2.0 }));
check("adult never fits Youth Programs", !programFitsPlayer(youth, { is_minor: false, level: 2.0 }));
check("adult never fits the camp", !programFitsPlayer(camp, { is_minor: false, level: null }));
check("minor 5.0 is above Youth Programs (4.5)", !programFitsPlayer(youth, { is_minor: true, level: 5.0 }));
check("minor 5.0 fits High Performance", programFitsPlayer(hp, { is_minor: true, level: 5.0 }));
check("unranked minor fits Youth Programs by age", programFitsPlayer(youth, { is_minor: true, level: null }));
check("unranked minor fits High Performance by age", programFitsPlayer(hp, { is_minor: true, level: null }));
check("unranked minor never fits Adult Bootcamps", !programFitsPlayer(adult, { is_minor: true, level: null }));
check("a Postgres numeric string is a level", programFitsPlayer(adult, { is_minor: false, level: "2.5" }));
check("a program with no span is judged by age alone", programFitsPlayer(unspanned, { is_minor: true, level: 7.0 }));
check("programFitsAge: Any age takes minors and adults", programFitsAge(hp, true) && programFitsAge(hp, false));

// The card and the recommender agree: for every age band and self-estimate,
// the recommender's first program fits a player of that band at the
// provisional tier (owner D4: new → Love, rally → Rally, competitive →
// Deuce, elite → Break).
console.log("Card and recommender agree (D2, D4)");
const PROVISIONAL_LEVEL = { new: 1.0, rally: 2.0, competitive: 3.0, elite: 4.0 } as const;
for (const band of AGE_BANDS) {
  for (const level of ["new", "rally", "competitive", "elite"] as const) {
    const top = recommendPrograms({
      who: band === "adult" ? "adult" : "youth",
      ageBand: band,
      level,
      goals: [],
      programs: [],
      preferredLocationIds: [],
      availability: [],
    })[0]?.program;
    check(
      `${band} (${level}) → ${top?.id ?? "nothing"} fits at level ${PROVISIONAL_LEVEL[level].toFixed(1)}`,
      !!top && programFitsPlayer(top, { is_minor: ageBandIsMinor(band), level: PROVISIONAL_LEVEL[level] })
    );
  }
}
check(
  "competitive provisional tier is at or above the High Performance floor",
  (tierForLevel(PROVISIONAL_LEVEL.competitive)?.id ?? 0) >= (tierForLevel(hp.levelMin)?.id ?? 99)
);

// ── Suggestions ─────────────────────────────────────────────────────────────
console.log("suggestProgramsFor");
const self = (level: number | null): SuggestPlayer => ({ full_name: "Sam Chen", relationship: "self", is_minor: false, level });
const maya: SuggestPlayer = { full_name: "Maya Chen", relationship: "child", is_minor: true, level: 2.5 };
const ids = (list: { program: Program }[]) => list.map((s) => s.program.id).join(",");

const single = suggestProgramsFor([self(2.5)], listedPrograms, []);
check("single ranked adult 2.5 → Adult Bootcamps only", ids(single) === "bootcamps", ids(single));
check("the holder's fit has no name (reads as 'you')", single[0].fit?.name === null && single[0].fit?.level === 2.5);

const household = suggestProgramsFor([self(null), maya], listedPrograms, []);
check("household: Youth Programs (Maya) first, then the holder's age matches", ids(household) === "youth-programs,high-performance,bootcamps", ids(household));
check("Maya's fit carries her first name and level", household[0].fit?.name === "Maya" && household[0].fit?.level === 2.5);
check("an unranked holder gives no fit marker", household[1].fit === null && household[2].fit === null);
check("Maya at 2.5 is outside High Performance", !household.some((s) => s.program.id === "high-performance" && s.fit));

const enrolled = suggestProgramsFor([self(null), maya], listedPrograms, ["youth-programs"]);
check("an enrolled program is never suggested", !ids(enrolled).includes("youth-programs"));

const selfInHousehold = suggestProgramsFor([self(2.5), maya], listedPrograms, ["youth-programs"]);
check("the holder in a household still reads as 'you'", selfInHousehold.find((s) => s.program.id === "bootcamps")?.fit?.name === null);

const nothingFits = suggestProgramsFor([self(2.0)], listedPrograms, ["bootcamps"]);
check("nothing fits → today's list, no fit", ids(nothingFits) === "youth-programs,high-performance" && nothingFits.every((s) => s.fit === null), ids(nothingFits));
const noPlayers = suggestProgramsFor([], listedPrograms, []);
check("no players → every eligible program, no fit", ids(noPlayers) === "youth-programs,high-performance,bootcamps" && noPlayers.every((s) => s.fit === null));
check("the coming-soon camp is never suggested", ![single, household, nothingFits, noPlayers].some((l) => ids(l).includes("kids-summer-camp")));
check("a retired program is never suggested", !ids(suggestProgramsFor([], programs, [])).includes("group-lessons"));

console.log("suggestionsSubCopy");
check("household with a fit", suggestionsSubCopy([self(null), maya], household) === "Programs that fit the players on your account.");
check("single ranked player", suggestionsSubCopy([self(2.5)], single) === "Programs built for your level.");
const ageOnly = suggestProgramsFor([self(null)], listedPrograms, []);
check("unranked holder → age group", suggestionsSubCopy([self(null)], ageOnly) === "Programs for your age group.", suggestionsSubCopy([self(null)], ageOnly));
check("fallback → not enrolled yet", suggestionsSubCopy([self(2.0)], nothingFits) === "Programs you're not enrolled in yet.");

// ── The card, rendered ──────────────────────────────────────────────────────
console.log("ProgramCard markup");
const render = (el: React.ReactElement) => renderToStaticMarkup(el);
const card = render(createElement(ProgramCard, { program: youth, variant: "compact" }));
check("one link per card", count(card, "<a ") === 1, `${count(card, "<a ")} links`);
const titleLink = card.match(/<h3[^>]*><a ([^>]*)>Youth Programs<\/a><\/h3>/)?.[1] ?? "";
check("the link is the title, stretched", titleLink.includes('href="/programs/youth-programs"') && titleLink.includes("after:absolute after:inset-0"), titleLink);
check("the eyebrow is the audience and the day", card.includes("Juniors and teens · Saturdays"));
check("the status chip reads Groups forming", card.includes("Groups forming"));
check("a real spec list with Ages, When and Price", card.includes("<dl") && /<dt[^>]*>Ages<\/dt>/.test(card) && /<dt[^>]*>When<\/dt>/.test(card) && /<dt[^>]*>Price<\/dt>/.test(card));
check("no Next row without a cohort", !/<dt[^>]*>Next<\/dt>/.test(card));
const [priceLead, ...priceRest] = PRICE_SUMMARY.split(" · ");
check("the price is the constant, the session figure leading", card.includes(`>${priceLead}<`) && priceRest.every((part) => card.includes(part)));
check("each class on its own line with its age chip", card.includes("Sat 12:00–1:00 pm") && card.includes("Sat 1:00–2:00 pm") && count(card, "Junior (7–13)") === 2);
check("the Level block names the span", card.includes(`>${formatTierSpan(youth.levelMin, youth.levelMax)}<`) && card.includes("1.0–4.5"));
check("the rail is in span mode", card.includes('aria-label="Built for Love to Break, levels 1.0 to 4.5"'));
check("the level note is under the rail", card.includes(youth.levelNote!));
check("the CTA line is decoration", /<span aria-hidden="true"[^>]*>View Program/.test(card));
check("no Learn more, no second button", !card.includes("Learn more") && !card.includes("<button"));
check("the plate is drawn, decorative, in the band frame", card.includes('viewBox="0 100 1600 800"') && card.includes('aria-hidden="true" focusable="false"'));
check("no image, no text over the art", !card.includes("<img") && !card.includes("bg-gradient-to-t"));

const noSpan = render(createElement(ProgramCard, { program: unspanned, variant: "compact" }));
check("no span → no rail, no band, no TBA", !noSpan.includes("Built for") && !noSpan.includes("1.0–4.5") && !noSpan.includes("TBA"));
check("no span → the level note as a plain row", /<dt[^>]*>Level<\/dt><dd[^>]*>First season to club player/.test(noSpan));

const withCohort = render(createElement(ProgramCard, { program: youth, nextCohort: cohort, variant: "compact" }));
check("a public cohort → the lime chip and the Next row", withCohort.includes("Next cohort Oct 18") && /<dt[^>]*>Next<\/dt>/.test(withCohort));
check("the Next row is always visible (no hover strip)", !withCohort.includes("group-hover:max-h") && !withCohort.includes("group-hover:opacity"));

const fitMaya = render(createElement(ProgramCard, { program: youth, fit: { name: "Maya", level: 2.5 }, variant: "compact" }));
check("fit → Fits Maya eyebrow", fitMaya.includes("Fits Maya") && !fitMaya.includes("Juniors and teens · Saturdays"));
check("fit → the caption names her tier and level", fitMaya.includes("Maya: Rally · 2.5"));
check("fit → the rail carries her marker", fitMaya.includes("Maya&#x27;s tier, Rally, is in this range.") || fitMaya.includes("Maya's tier, Rally, is in this range."));
const fitYou = render(createElement(ProgramCard, { program: adult, fit: { name: null, level: 2.5 }, variant: "compact" }));
check("fit with no name → Fits you, Your level", fitYou.includes("Fits you") && fitYou.includes("Your level: Rally · 2.5"));
const outOfRange = render(createElement(ProgramCard, { program: hp, fit: { name: "Maya", level: 2.5 }, variant: "compact" }));
check("a fit outside the span keeps the plain eyebrow", outOfRange.includes("Any age · Saturdays") && !outOfRange.includes("Fits Maya"));

const adultCard = render(createElement(ProgramCard, { program: adult, variant: "compact" }));
check("Adult Bootcamps shows the climb per class", ["Love – Rally", "Deuce", "Break – Ace"].every((s) => adultCard.includes(`>${s}<`)));
check("Adult Bootcamps span reads Love – Ace", adultCard.includes(">Love – Ace<"));
const hpCard = render(createElement(ProgramCard, { program: hp, variant: "compact" }));
check("High Performance: Any age chip, no slot qualifier", hpCard.includes(">Any age<") && !hpCard.includes("Competitive and elite players"));
check("High Performance span reads Deuce and up", hpCard.includes(">Deuce and up<"));

const comingSoon = render(createElement(ProgramCard, { program: camp, variant: "compact" }));
check("coming soon → one dashed chip over the art, no status chip", count(comingSoon, "Coming Soon") === 1 && !comingSoon.includes("Groups forming"));
check("coming soon → the CTA is the notify label", comingSoon.includes("Notify Me When Open") && comingSoon.includes('href="/programs/kids-summer-camp#notify"'));

const h2 = render(createElement(ProgramCard, { program: youth, headingLevel: 2 }));
check("headingLevel 2 renders an h2", h2.includes("<h2") && !h2.includes("<h3"));

const rowCard = render(createElement(ProgramCard, { program: adult, variant: "row" }));
check("row variant draws the master frame", rowCard.includes('viewBox="0 0 1600 1000"'));
check("row variant reads Timetable at md and When below", rowCard.includes(">Timetable</span>") && rowCard.includes(">When</span>"));
check("row variant carries both rails, one hidden per breakpoint", count(rowCard, 'aria-label="Built for Love to Ace') === 2 && rowCard.includes("hidden md:block"));

console.log("ProgramCardList and ProgramComingSoonBand");
const live = listedPrograms.filter((p) => !p.comingSoon);
const grid = render(createElement(ProgramCardList, { programs: live, publicCohorts: [cohort], layout: "grid" }));
check("a real list of cards", grid.startsWith('<ul role="list"') && count(grid, "<article") === live.length);
check("one link per card across the list", count(grid, "<a ") === live.length);
check("the list passes the next cohort to its program", grid.includes("Next cohort Oct 18"));
check("grid cards are auto, three across from lg", grid.includes("lg:grid-cols-3") && grid.includes("lg:line-clamp-2"));
const rows = render(createElement(ProgramCardList, { programs: live, publicCohorts: [], layout: "rows" }));
check("rows layout stacks row cards", rows.includes("space-y-4") && count(rows, 'viewBox="0 0 1600 1000"') === live.length);

const band = render(createElement(ProgramComingSoonBand, { program: camp }));
check("coming-soon band: one link, the title", count(band, "<a ") === 1 && band.includes("Kids&#x27; Summer Camp"));
check("coming-soon band: dashed, with the chip", band.includes("border-dashed") && band.includes("Coming Soon"));
check("coming-soon band: one meta line", band.includes(`Junior (7–13) · ${camp.schedule} · ${CAMP_PRICE_SUMMARY}`));
check("coming-soon band: the span and its rail", band.includes(">All levels<") && band.includes('aria-label="Built for Love to Grand Slam'));
check("coming-soon band: the plate is dashed", band.includes('stroke-dasharray="10 7"'));

// ── Surfaces ────────────────────────────────────────────────────────────────
console.log("Surfaces");
const cardSrc = read("src/components/sections/ProgramCard.tsx");
check("card: no Learn more, no hover-only strip, no second button", !cardSrc.includes("Learn more") && !cardSrc.includes("group-hover:max-h") && count(cardSrc, "<Link") === 1);
check("card: stretched link and has-focus ring", cardSrc.includes("after:absolute after:inset-0 after:z-10") && cardSrc.includes("has-[a:focus-visible]:ring-2"));
check("card: no scale on hover", !cardSrc.includes("hover:scale"));
const gridSrc = read("src/components/sections/ProgramsGrid.tsx");
check("grid renders ProgramCardList and reads cohorts once", gridSrc.includes("<ProgramCardList") && count(gridSrc, "getPublicCohorts()") === 1);
check("grid: the quiz line with the locked label", gridSrc.includes("Not sure which fits?") && gridSrc.includes("{QUIZ_CTA_LABEL}") && gridSrc.includes("Sina places you by level and schedule"));
const home = read("src/app/page.tsx");
check("home: live programs with the quiz line", home.includes("quizLine") && home.includes("!p.comingSoon"));
const programsPage = read("src/app/programs/page.tsx");
check("/programs: tier legend in the header", /aria-labelledby="levels"[\s\S]*<TierLine variant="ladder"/.test(programsPage));
check("/programs: the legend line", programsPage.includes("Seven tiers, Love to Grand Slam."));
check("/programs: Weekend classes as rows", programsPage.includes("Weekend classes") && programsPage.includes('layout="rows"'));
check("/programs: coming-soon band, not a card", programsPage.includes("<ProgramComingSoonBand"));
check("/programs: quiz band before the newsletter, newsletter last", at(programsPage, "<ProgramsGrid") < at(programsPage, "<QuizBand") && at(programsPage, "<QuizBand") < at(programsPage, "<EmailCapture"));
check("/programs: the header carries the primary quiz CTA", /source="programs-header"[\s\S]*data-quiz-cta/.test(programsPage));
const detail = read("src/app/programs/[slug]/page.tsx");
check("detail: age and tier chip row replaces the grey age line (L8)", detail.includes("<AgeBandChips") && !detail.includes("· {program.ageGroup}"));
check("detail: Levels in this program ladder in span mode", detail.includes("Levels in this program") && /<TierLine variant="ladder" orientation="vertical"[^>]*span=\{range\}/.test(detail));
check("detail: How tiers work link", detail.includes('href="/assessment#ladder"'));
check("detail: a TierRangeBadges per timetable slot", detail.includes("<TierRangeBadges levelMin={slot.levelMin} levelMax={slot.levelMax} />"));
check("detail: cohort cards carry the mark and the rail", detail.includes("<PlateMark plate={program.plate}") && detail.includes("artFocusForCohort(program, cohort)") && /tierGated &&[\s\S]*<TierLine[\s\S]*variant="rail"/.test(detail));
check("detail: the start date helper is shared", detail.includes("formatStartDate(") && !detail.includes("fmtStartDate"));
const dashboardPage = read("src/app/dashboard/page.tsx");
check("dashboard: suggestions through suggestProgramsFor", dashboardPage.includes("suggestProgramsFor(players, listedPrograms, enrolledProgramIds)"));
const dashboardView = read("src/app/dashboard/DashboardView.tsx");
check("dashboard: renders ProgramCardList with fits and the sub-copy", dashboardView.includes("<ProgramCardList") && dashboardView.includes("suggestionsSubCopy(players, suggestions)") && dashboardView.includes("fits="));
check("dashboard: the aside is the locked secondary label", dashboardView.includes("Browse Programs →") && !dashboardView.includes("View all"));
const pkg = JSON.parse(read("package.json")) as { scripts: { test: string } };
check("npm test ends with this file", pkg.scripts.test.trim().endsWith("npx tsx src/scripts/test-program-catalog.ts"));
check("design-system.md documents the program cards", read("ops/briefs/design-system.md").includes("## Program cards"));

if (failed > 0) {
  console.log(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll program-catalog checks passed.");
