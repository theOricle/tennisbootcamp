// Run from project root: npx tsx src/scripts/test-program-catalog.ts
//
// Pins audit PR G (2026-10-09, "Program catalog cards") as rebuilt by audit
// PR K (owner decisions 2026-10-12): three programs with photographs, their
// timetables and level spans derived from the groups, the catalog helpers
// (status precedence, eyebrow, slot and group text, the fit rules and the
// dashboard suggestions), the program card rendered to markup (one link per
// card, a real spec list, the photo with its alt, the Level block, the
// dashboard fit marker) and the surfaces that use it, as source checks since
// the repo has no DOM test runner. Exits non-zero on any failure. The cohort
// length and totals come from the constants; this file never spells them.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  PRICE_SUMMARY,
  PRIVATE_LESSONS_PRICE,
  groupsForProgram,
  listedPrograms,
  programGroups,
  programs,
} from "../content/programs";
import { AGE_BANDS, ageBandIsMinor } from "../lib/ageBand";
import { formatCohortSchedule, formatStartDate } from "../lib/cohorts";
import { PROVISIONAL_TIER } from "../lib/level";
import { recommendPrograms } from "../lib/recommend";
import { formatTierSpan, levelWithinRange, tierById } from "../lib/tiers";
import {
  agesChipLabel,
  cohortMatchesGroup,
  formatClassTime,
  formatGroupStart,
  formatGroupWhen,
  formatSlotWhen,
  groupAgeLabel,
  groupStatus,
  nextCohortForGroup,
  programAgeLabel,
  programEyebrow,
  programFitsAge,
  programFitsPlayer,
  programLevelRange,
  programStatus,
  programTakesPlayerAge,
  slotLevelRange,
  suggestProgramsFor,
  suggestionsSubCopy,
  twelveHourStart,
  type SuggestPlayer,
} from "../lib/programCatalog";
import { ProgramCard, ProgramCardList, nextCohortFor } from "../components/sections/ProgramCard";
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
const at = (hay: string, needle: string) => hay.indexOf(needle);
const count = (hay: string, needle: string) => hay.split(needle).length - 1;
const onGrid = (n: number) => Number.isFinite(n) && n >= 1 && n <= 7 && Math.round(n * 2) === n * 2;

const byId = Object.fromEntries(programs.map((p) => [p.id, p])) as Record<string, Program>;
const youth = byId["youth-programs"];
const adult = byId["bootcamps"];
const privateLessons = byId["private-lessons"];

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
console.log("Catalog data (owner, 2026-10-12)");
check("three listed programs: Youth Bootcamps, Adult Bootcamps, Private Lessons", listedPrograms.map((p) => p.title).join("|") === "Youth Bootcamps|Adult Bootcamps|Private Lessons");
check("the slugs youth-programs and bootcamps stay; private-lessons is new", listedPrograms.map((p) => p.slug).join("|") === "youth-programs|bootcamps|private-lessons");
check("no listed program is coming soon", listedPrograms.every((p) => !p.comingSoon));
for (const p of listedPrograms) {
  check(`${p.id}: ageBands set`, p.ageBands.length > 0);
  check(`${p.id}: priceSummary set`, !!p.priceSummary);
  check(`${p.id}: levelNote set`, !!p.levelNote);
  check(`${p.id}: carries a photo with alt text`, !!p.photo && p.photo.alt.length > 20 && p.photo.width === 1600 && p.photo.height === 1000);
  const groups = groupsForProgram(p.slug);
  check(`${p.id}: has at least one group`, groups.length > 0);
  const scheduled = groups.filter((g) => g.day !== null);
  check(
    `${p.id}: price from the constants`,
    p.priceSummary === (scheduled.length > 0 ? PRICE_SUMMARY : PRIVATE_LESSONS_PRICE),
    p.priceSummary
  );
  const range = programLevelRange(p);
  check(`${p.id}: span set, on the half-step grid, 1.0 ≤ min ≤ max ≤ 7.0`, !!range && onGrid(range.min) && onGrid(range.max) && range.min <= range.max);
  check(
    `${p.id}: span is the union of its groups' bands`,
    !!range && range.min === Math.min(...groups.map((g) => g.levelMin)) && range.max === Math.max(...groups.map((g) => g.levelMax))
  );
  const slots = p.timetable ?? [];
  check(`${p.id}: one timetable slot per scheduled group, in lineup order`, slots.length === scheduled.length && slots.every((s, i) => s.group === scheduled[i].name && s.day === scheduled[i].day));
  check(`${p.id}: slot times come from the groups' 24-hour clock`, slots.every((s, i) => s.time === formatClassTime(scheduled[i].start!, scheduled[i].end!)));
  check(`${p.id}: every slot carries its group's band`, slots.every((s, i) => slotLevelRange(s)?.min === scheduled[i].levelMin && slotLevelRange(s)?.max === scheduled[i].levelMax));
  if (scheduled.length > 0) {
    check(`${p.id}: enrollmentStatus set (owner D11)`, p.enrollmentStatus === "forming");
    check(`${p.id}: schedule names the day and every start`, !!p.schedule && p.schedule.includes(`${scheduled[0].day}s`) && scheduled.every((g) => p.schedule!.includes(twelveHourStart(g.start!))));
  }
}
check("Private Lessons: no timetable, by arrangement, rates on request", !privateLessons.timetable && privateLessons.schedule === "By arrangement" && privateLessons.priceSummary === PRIVATE_LESSONS_PRICE && !!privateLessons.priceLine?.startsWith(PRIVATE_LESSONS_PRICE));
check("Private Lessons: any age, all levels", programAgeLabel(groupsForProgram("private-lessons")) === "Any age" && formatTierSpan(privateLessons.levelMin, privateLessons.levelMax) === "All levels");
check("High Performance and Kids' Summer Camp are off the listing", !listedPrograms.some((p) => p.id === "high-performance" || p.id === "kids-summer-camp"));
check("High Performance stays resolvable by id for old rows", byId["high-performance"]?.unlisted === true && byId["high-performance"].title === "High Performance");
check("PRICE_SUMMARY is one line from the constants", /^\$\d+ a session · \$\d+ for \w+ weeks?$/.test(PRICE_SUMMARY), PRICE_SUMMARY);

// ── Helpers ─────────────────────────────────────────────────────────────────
console.log("Helpers");
check("eyebrow: juniors and teens on Saturdays", programEyebrow(youth) === "Juniors and teens · Saturdays", programEyebrow(youth));
check("eyebrow: adults on Sundays", programEyebrow(adult) === "Adults · Sundays", programEyebrow(adult));
check("eyebrow: private lessons read the schedule line, never the title", programEyebrow(privateLessons) === "Any age · By arrangement", programEyebrow(privateLessons));
check("formatClassTime: noon start, pm once", formatClassTime("12:00", "13:00") === "12:00–1:00 pm");
check("formatClassTime: afternoon", formatClassTime("16:00", "17:00") === "4:00–5:00 pm");
check("formatClassTime: morning", formatClassTime("09:00", "10:00") === "9:00–10:00 am");
check("twelveHourStart", twelveHourStart("12:00") === "12:00" && twelveHourStart("13:00") === "1:00" && twelveHourStart("18:30") === "6:30");
check("formatSlotWhen", formatSlotWhen(youth.timetable![0]) === "Sat 12:00–1:00 pm");
const hp = programGroups.find((g) => g.id === "high-performance")!;
const newer = programGroups.find((g) => g.id === "adult-newer")!;
const solo = programGroups.find((g) => g.id === "private-lessons")!;
const first7 = programGroups.find((g) => g.id === "youth-7-10")!;
check("formatGroupWhen", formatGroupWhen(hp) === "Saturdays 2:00–3:00 pm" && formatGroupWhen(solo) === "By arrangement");
check("formatGroupStart", formatGroupStart(newer) === "Sun 4:00" && formatGroupStart(solo) === "By arrangement");
check("groupAgeLabel: a range, an open top, any age", groupAgeLabel(hp) === "12–17" && groupAgeLabel(newer) === "16 and up" && groupAgeLabel(solo) === "Any age");
check("programAgeLabel: youth 7–17, adult 16 and up, private any age", programAgeLabel(groupsForProgram("youth-programs")) === "7–17" && programAgeLabel(groupsForProgram("bootcamps")) === "16 and up" && programAgeLabel([]) === "Any age");
check("agesChipLabel: Ages 7–17, Ages 16 and up, Any age (never Ages Any age)", agesChipLabel(groupsForProgram("youth-programs")) === "Ages 7–17" && agesChipLabel(groupsForProgram("bootcamps")) === "Ages 16 and up" && agesChipLabel(groupsForProgram("private-lessons")) === "Any age");

console.log("programStatus precedence");
check("coming soon wins", programStatus({ ...youth, comingSoon: true }, cohort)?.kind === "coming-soon");
check("next cohort beats invite only", programStatus({ ...youth, enrollmentStatus: "invite-only" }, cohort)?.label === `Next cohort ${formatStartDate(cohort.startDate)}`);
check("invite only", programStatus({ ...youth, enrollmentStatus: "invite-only" })?.label === "Invite only");
check("no chip for a program with no timetable (its When row already says By arrangement)", programStatus(privateLessons) === null);
check("a public cohort still gives an arranged program the Next cohort chip", programStatus(privateLessons, { ...cohort, programId: "private-lessons" })?.kind === "next-cohort");
check("groups forming by default", programStatus(youth)?.label === "Groups forming");

console.log("groupStatus precedence");
check("next cohort first", groupStatus({ ...hp, status: "full" }, cohort)?.kind === "next-cohort");
check("full, then invite only, then open to join", groupStatus({ ...first7, status: "full" })?.label === "Full" && groupStatus({ ...first7, status: "invite-only" })?.label === "Invite only" && groupStatus(first7)?.label === "Open to join" && groupStatus(first7)?.kind === "open");
check("by approval (High Performance) beats the next cohort, never full or invite only", groupStatus(hp)?.label === "By approval" && groupStatus(hp, cohort)?.kind === "approval" && groupStatus({ ...hp, status: "full" })?.label === "Full" && groupStatus({ ...hp, status: "invite-only" })?.label === "Invite only");
check("an arranged group shows no chip", groupStatus(solo) === null);

console.log("cohorts and groups");
const first = programGroups.find((g) => g.id === "youth-7-10")!;
check("a Saturday 12:00 youth cohort trains in the 7–10 group", cohortMatchesGroup(cohort, first) && !cohortMatchesGroup(cohort, hp));
check("a cohort of another program never matches", !cohortMatchesGroup({ ...cohort, programId: "bootcamps" }, first));
check("an arranged group never matches a cohort", !cohortMatchesGroup({ ...cohort, programId: "private-lessons" }, solo));
check("nextCohortForGroup picks the earliest", nextCohortForGroup([{ ...cohort, id: "b", startDate: "2026-11-01" }, cohort], first)?.id === "youth-fall-1" && nextCohortForGroup([cohort], hp) === undefined);
check("nextCohortFor picks the earliest per program", nextCohortFor([{ ...cohort, id: "b", startDate: "2026-11-01" }, cohort], "youth-programs")?.id === "youth-fall-1");

// ── Fit rules ───────────────────────────────────────────────────────────────
console.log("programFitsPlayer");
check("an unranked minor fits Youth Bootcamps by age", programFitsPlayer(youth, { is_minor: true, level: null }));
check("a minor never fits Adult Bootcamps on the band", !programFitsPlayer(adult, { is_minor: true, level: null }));
check("an adult never fits Youth Bootcamps", !programFitsPlayer(youth, { is_minor: false, level: 3 }));
check("a ranked adult inside the span fits", programFitsPlayer(adult, { is_minor: false, level: "3.5" }));
check("a ranked adult above the span does not", !programFitsPlayer(adult, { is_minor: false, level: 6 }));
check("Private Lessons fit everyone", programFitsPlayer(privateLessons, { is_minor: true, level: null }) && programFitsPlayer(privateLessons, { is_minor: false, level: 7 }));
check("the stored band decides when known", programTakesPlayerAge(adult, { is_minor: true, age_band: "adult" }) && !programTakesPlayerAge(adult, { is_minor: false, age_band: "teen" }));

// Card and recommender agree: for every band × self-estimate, the top
// recommendation takes the player's band, and the provisional tier (when
// there is one) sits inside the program span and inside the first group.
console.log("Card and recommender agree");
const base = { goals: [] as string[], programs: [] as string[], preferredLocationIds: [] as string[], availability: [] as string[] };
for (const band of AGE_BANDS) {
  for (const level of ["new", "rally", "competitive", "elite", undefined] as const) {
    const [top] = recommendPrograms({ ...base, who: band === "adult" ? "adult" : "youth", ageBand: band, level });
    const minor = ageBandIsMinor(band);
    const tierId = level ? PROVISIONAL_TIER[level] : undefined;
    const fits = !!top && programFitsPlayer(top.program, { is_minor: minor, age_band: band, level: tierId ?? null });
    const inGroup = !top || tierId === undefined || levelWithinRange(tierId, top.groups[0].levelMin, top.groups[0].levelMax);
    check(`${band} (${level ?? "no level"}) → ${top?.program.id} fits the card's rule and its first group`, fits && inGroup);
  }
}
const competitiveTier = tierById(PROVISIONAL_TIER.competitive!);
check("competitive provisional tier is at or above the High Performance floor", competitiveTier.id >= Math.floor(hp.levelMin));

// ── Suggestions ─────────────────────────────────────────────────────────────
console.log("suggestProgramsFor");
const self = (level: number | null): SuggestPlayer => ({ full_name: "Sam Chen", relationship: "self", is_minor: false, level });
const maya: SuggestPlayer = { full_name: "Maya Chen", relationship: "child", is_minor: true, level: 2.5 };
const ids = (list: { program: Program }[]) => list.map((s) => s.program.id).join(",");

const single = suggestProgramsFor([self(2.5)], listedPrograms, []);
check("single ranked adult 2.5 → Adult Bootcamps, then Private Lessons", ids(single) === "bootcamps,private-lessons", ids(single));
check("the holder's fit has no name (reads as 'you')", single[0].fit?.name === null && single[0].fit?.level === 2.5);

const household = suggestProgramsFor([self(null), maya], listedPrograms, []);
check("household: Youth Bootcamps (Maya) and Private Lessons (Maya) first, then the holder's age match", ids(household) === "youth-programs,private-lessons,bootcamps", ids(household));
check("Maya's fit carries her first name and level", household[0].fit?.name === "Maya" && household[0].fit?.level === 2.5);
check("an unranked holder gives no fit marker", household[2].fit === null);

const enrolled = suggestProgramsFor([self(null), maya], listedPrograms, ["youth-programs"]);
check("an enrolled program is never suggested", !ids(enrolled).includes("youth-programs"));

const nameless: SuggestPlayer = { full_name: null, relationship: "child", is_minor: true, level: 2.5 };
const namelessHousehold = suggestProgramsFor([self(null), nameless], listedPrograms, []);
check("household: a nameless ranked child is still suggested for, with no fit marker", ids(namelessHousehold).includes("youth-programs") && namelessHousehold.every((s) => s.fit === null));
const rankedHolderNamelessChild = suggestProgramsFor([self(2.5), nameless], listedPrograms, []);
check("household: the ranked holder still reads as 'you' beside a nameless child", rankedHolderNamelessChild.find((s) => s.program.id === "bootcamps")?.fit?.name === null && rankedHolderNamelessChild.find((s) => s.program.id === "youth-programs")?.fit === null);

const nothingFits = suggestProgramsFor([self(2.0)], listedPrograms, ["bootcamps", "private-lessons"]);
check("nothing fits → today's list, no fit", ids(nothingFits) === "youth-programs" && nothingFits.every((s) => s.fit === null), ids(nothingFits));
const noPlayers = suggestProgramsFor([], listedPrograms, []);
check("no players → every eligible program, no fit", ids(noPlayers) === "youth-programs,bootcamps,private-lessons" && noPlayers.every((s) => s.fit === null));
check("a retired program is never suggested", !ids(suggestProgramsFor([], programs, [])).includes("group-lessons") && !ids(suggestProgramsFor([], programs, [])).includes("high-performance"));

console.log("suggestionsSubCopy");
check("household with a fit", suggestionsSubCopy([self(null), maya], household) === "Programs that fit the players on your account.");
check("single ranked player", suggestionsSubCopy([self(2.5)], single) === "Programs built for your level.");
const ageOnly = suggestProgramsFor([self(null)], listedPrograms, []);
check("unranked holder → age group", suggestionsSubCopy([self(null)], ageOnly) === "Programs for your age group.", suggestionsSubCopy([self(null)], ageOnly));
check("fallback → not enrolled yet", suggestionsSubCopy([self(2.0)], nothingFits) === "Programs you're not enrolled in yet.");
check("programFitsAge: a minor fits youth, an adult fits adult", programFitsAge(youth, true) && !programFitsAge(youth, false) && programFitsAge(adult, false));

// ── The card, rendered ──────────────────────────────────────────────────────
console.log("ProgramCard markup");
const render = (el: React.ReactElement) => renderToStaticMarkup(el);
const card = render(createElement(ProgramCard, { program: youth }));
check("one link per card", count(card, "<a ") === 1, `${count(card, "<a ")} links`);
const titleLink = card.match(/<h3[^>]*><a ([^>]*)>Youth Bootcamps<\/a><\/h3>/)?.[1] ?? "";
check("the link is the title, stretched", titleLink.includes('href="/programs/youth-programs"') && titleLink.includes("after:absolute after:inset-0"), titleLink);
check("the photo is drawn with its real alt text, inside a 16:10 box", card.includes("<img") && card.includes(`alt="${youth.photo!.alt}"`) && card.includes("aspect-[16/10]"));
check("no court plate on the card", !card.includes("<svg") || !card.includes('viewBox="0 100 1600 800"'));
check("the eyebrow is the audience and the day", card.includes("Juniors and teens · Saturdays"));
check("the status chip sits over the photo, before the eyebrow", at(card, "Groups forming") < at(card, "Juniors and teens · Saturdays") && card.includes('class="absolute right-3 top-3 flex rounded-full bg-[#061427]"'));
check("the eyebrow has its line to itself (the title follows it directly)", /<p class="[^"]*">Juniors and teens · Saturdays<\/p><h3/.test(card));
const beforeLink = card.slice(0, card.indexOf("<a "));
check("only the article and the photo column are positioned before the link", count(beforeLink, "relative") === 2 && !/<div class="flex min-w-0 flex-1 flex-col[^"]*relative/.test(card));
check("a real spec list with Ages, When and Price", card.includes("<dl") && /<dt[^>]*>Ages<\/dt>/.test(card) && /<dt[^>]*>When<\/dt>/.test(card) && /<dt[^>]*>Price<\/dt>/.test(card));
check("Ages reads the groups' range", /<dt[^>]*>Ages<\/dt><dd[^>]*>7–17<\/dd>/.test(card));
check("When lists one line per group with its start and name", groupsForProgram("youth-programs").every((g) => card.includes(formatGroupStart(g)) && card.includes(`>${g.name}<`)));
check("no Next row without a cohort", !/<dt[^>]*>Next<\/dt>/.test(card));
const [priceLead, ...priceRest] = PRICE_SUMMARY.split(" · ");
const priceDd = card.match(/<dt[^>]*>Price<\/dt><dd[^>]*>([\s\S]*?)<\/dd>/)?.[1] ?? "";
check("the price is stacked: lead in white, total in white/60, no middot", priceDd.includes(`font-semibold text-white">${priceLead}<`) && priceRest.every((part) => priceDd.includes(`text-white/60">${part}<`)) && !priceDd.includes("·"), priceDd);
check("the Level block names the span", card.includes(`>${formatTierSpan(youth.levelMin, youth.levelMax)}<`) && card.includes("1.0–5.5"));
check("the rail is in span mode", card.includes('aria-label="Built for Beginner to Elite, levels 1.0 to 5.5"'));
check("the level note is under the rail", card.includes(youth.levelNote!));
check("the CTA line is decoration", /<span aria-hidden="true"[^>]*>View Program/.test(card));
check("no Learn more, no second button, no gradient scrim", !card.includes("Learn more") && !card.includes("<button") && !card.includes("bg-gradient-to-t"));

const withCohort = render(createElement(ProgramCard, { program: youth, nextCohort: cohort }));
check("a public cohort → the lime chip and the Next row", withCohort.includes("Next cohort Oct 18") && /<dt[^>]*>Next<\/dt>/.test(withCohort));
const nextParts = formatCohortSchedule(cohort).split(" · ");
const nextDd = withCohort.match(/<dt[^>]*>Next<\/dt><dd[^>]*>([\s\S]*?)<\/dd><\/div>/)?.[1] ?? "";
check("Next: every part is its own nowrap span, the middot attached to the part before it", nextParts.slice(0, -1).every((part) => nextDd.includes(`<span class="whitespace-nowrap">${part}<span aria-hidden="true"> ·</span></span>`)) && nextDd.includes(`<span class="whitespace-nowrap">${nextParts[nextParts.length - 1]}</span>`), nextDd);

const fitMaya = render(createElement(ProgramCard, { program: youth, fit: { name: "Maya", level: 2.5 } }));
check("fit → Fits Maya eyebrow", fitMaya.includes("Fits Maya") && !fitMaya.includes("Juniors and teens · Saturdays"));
check("fit → the caption names her tier and level", fitMaya.includes("Maya: Novice · 2.5"));
check("fit → the rail carries her marker", fitMaya.includes("Maya&#x27;s tier, Novice, is in this range.") || fitMaya.includes("Maya's tier, Novice, is in this range."));
const fitYou = render(createElement(ProgramCard, { program: adult, fit: { name: null, level: 2.5 } }));
check("fit with no name → Fits you, Your level", fitYou.includes("Fits you") && fitYou.includes("Your level: Novice · 2.5"));
const outOfRange = render(createElement(ProgramCard, { program: adult, fit: { name: "Maya", level: 6.5 } }));
check("a fit outside the span keeps the plain eyebrow", outOfRange.includes("Adults · Sundays") && !outOfRange.includes("Fits Maya"));

const adultCard = render(createElement(ProgramCard, { program: adult }));
check("Adult Bootcamps: 16 and up, the three classes by name", adultCard.includes(">16 and up<") && ["Newer players", "Intermediate", "Advanced"].every((s) => adultCard.includes(`>${s}<`)));
check("Adult Bootcamps span reads Beginner – Elite", adultCard.includes(">Beginner – Elite<"));

const privateCard = render(createElement(ProgramCard, { program: privateLessons }));
check("Private Lessons: any age, by arrangement, rates on request, all levels", privateCard.includes(">Any age<") && privateCard.includes(">By arrangement<") && privateCard.includes(`>${PRIVATE_LESSONS_PRICE}<`) && privateCard.includes(">All levels<"));
check(
  "Private Lessons: no status chip, so By arrangement reads twice (eyebrow, When row), never three times, never Groups forming",
  count(privateCard, "By arrangement") === 2 && !privateCard.includes('class="absolute right-3 top-3') && !privateCard.includes("Groups forming"),
  `${count(privateCard, "By arrangement")} × By arrangement`
);
check("the youth card keeps its chip over the photo", card.includes('class="absolute right-3 top-3 flex rounded-full bg-[#061427]"'));

const h2 = render(createElement(ProgramCard, { program: youth, headingLevel: 2 }));
check("headingLevel 2 renders an h2", h2.includes("<h2") && !h2.includes("<h3"));
check("from md the card lies on its side, at lg it stacks again", card.includes("md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:flex") && card.includes("md:aspect-auto md:h-full") && card.includes("lg:aspect-[16/10]"));

console.log("ProgramCardList");
const grid = render(createElement(ProgramCardList, { programs: listedPrograms, publicCohorts: [cohort] }));
check("a real list of cards, three across from lg", grid.startsWith('<ul role="list"') && grid.includes("lg:grid-cols-3") && count(grid, "<article") === listedPrograms.length);
check("one link per card across the list", count(grid, "<a ") === listedPrograms.length);
check("the list passes the next cohort to its program", grid.includes("Next cohort Oct 18"));
check("every listed photo is drawn once", listedPrograms.every((p) => count(grid, `alt="${p.photo!.alt}"`) === 1));

// ── Surfaces ────────────────────────────────────────────────────────────────
console.log("Surfaces");
const cardSrc = read("src/components/sections/ProgramCard.tsx");
check("card: no Learn more, no hover-only strip, no second button", !cardSrc.includes("Learn more") && !cardSrc.includes("group-hover:max-h") && count(cardSrc, "<Link") === 1);
check("card: stretched link and has-focus ring", cardSrc.includes("after:absolute after:inset-0 after:z-10") && cardSrc.includes("has-[a:focus-visible]:ring-2"));
check("card: no scale on hover, no plate import", !cardSrc.includes("hover:scale") && !cardSrc.includes("ProgramPlate"));
check("card: the photo through next/image with sizes", cardSrc.includes('from "next/image"') && cardSrc.includes("sizes={PHOTO_SIZES}"));
check("card: one StatusChip, rendered inside the photo column", count(cardSrc, "<StatusChip status={status} />") === 1);
const gridSrc = read("src/components/sections/ProgramsGrid.tsx");
check("grid renders ProgramCardList and reads cohorts once", gridSrc.includes("<ProgramCardList") && count(gridSrc, "getPublicCohorts()") === 1);
check("grid: the quiz line with the locked label", gridSrc.includes("Not sure which fits?") && gridSrc.includes("{QUIZ_CTA_LABEL}") && gridSrc.includes("our coaches place you by level and schedule"));
const home = read("src/app/page.tsx");
check("home: the three listed programs with the quiz line", home.includes("programs={listedPrograms}") && home.includes("quizLine"));
const programsPage = read("src/app/programs/page.tsx");
check("/programs: tier legend in the header", /aria-labelledby="levels"[\s\S]*<TierLine variant="ladder"/.test(programsPage));
check("/programs: the legend line", programsPage.includes("Seven tiers, {TIER_LADDER_SPAN}."));
check("/programs: the catalog of groups, then the quiz band, then the newsletter", programsPage.includes("<ProgramCatalog") && at(programsPage, "<ProgramCatalog") < at(programsPage, "<QuizBand") && at(programsPage, "<QuizBand") < at(programsPage, "<EmailCapture"));
check("/programs: the header carries the primary quiz CTA", /source="programs-header"[\s\S]*data-quiz-cta/.test(programsPage));
check("/programs: the next cohort per group is read once on the server", programsPage.includes("nextCohortForGroup(publicCohorts, g)") && count(programsPage, "getPublicCohorts()") === 1);
const detail = read("src/app/programs/[slug]/page.tsx");
check("detail: the photo hero with its alt, 16:10, priority", /<Image[\s\S]*?src=\{program\.photo\.src\}[\s\S]*?alt=\{program\.photo\.alt\}[\s\S]*?priority/.test(detail) && detail.includes("aspect-[16/10]") && !detail.includes("ProgramPlate"));
check("detail: the ages chip and the span chip under the description (L8)", detail.includes("{agesChipLabel(groups)}") && detail.includes("<TierRangeBadges levelMin={range.min} levelMax={range.max} />"));
check("detail: the groups as cards, the quiz as their action", detail.includes("<ProgramGroupCard") && detail.includes('source="program-group"') && detail.includes("nextCohortForGroup(publicCohorts, g)"));
check("detail: Levels in this program ladder in span mode", detail.includes("Levels in this program") && /<TierLine variant="ladder" orientation="vertical"[^>]*span=\{range\}/.test(detail));
check("detail: How tiers work link", detail.includes('href="/assessment#ladder"'));
check("detail: cohort cards carry the mark and the rail", detail.includes("<PlateMark plate={program.plate}") && detail.includes("artFocusForCohort(program, cohort)") && /tierGated &&[\s\S]*<TierLine[\s\S]*variant="rail"/.test(detail));
check("detail: the start date helper is shared", detail.includes("formatStartDate(") && !detail.includes("fmtStartDate"));
const panelOpen = at(detail, "<ProgramViewerPanel");
const panelClose = at(detail, "</ProgramViewerPanel>");
check(
  "detail: the assessment button is inside the viewer panel (a guest's), for a scheduled program only",
  panelOpen < at(detail, 'href="/assessment/book"') && at(detail, 'href="/assessment/book"') < panelClose && /\{!arranged && \(\s*<>\s*<TrackedButton[\s\S]{0,200}?href="\/assessment\/book"/.test(detail)
);
check(
  "detail: a program booked by arrangement offers the inbox outside the viewer panel, so a signed-in holder sees it too",
  at(detail, "href={`mailto:${CONTACT_EMAIL}`}") > panelClose && /\{arranged && \(\s*<Button[^>]*href=\{`mailto:\$\{CONTACT_EMAIL\}`\}/.test(detail)
);
const dashboardPage = read("src/app/dashboard/page.tsx");
check("dashboard: suggestions through suggestProgramsFor", dashboardPage.includes("suggestProgramsFor(roster, listedPrograms, enrolledProgramIds)"));
const dashboardView = read("src/app/dashboard/DashboardView.tsx");
check("dashboard: renders ProgramCardList with fits and the sub-copy", dashboardView.includes("<ProgramCardList") && dashboardView.includes("suggestionsSubCopy(roster, suggestions)") && dashboardView.includes("fits="));
check("dashboard: the aside is the locked secondary label", dashboardView.includes("Browse Programs →") && !dashboardView.includes("View all"));
const pkg = JSON.parse(read("package.json")) as { scripts: { test: string } };
check("npm test runs this file", pkg.scripts.test.includes("npx tsx src/scripts/test-program-catalog.ts"));
check("design-system.md documents the program cards", read("ops/briefs/design-system.md").includes("## Program cards"));

if (failed > 0) {
  console.log(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll program catalog checks passed.");
