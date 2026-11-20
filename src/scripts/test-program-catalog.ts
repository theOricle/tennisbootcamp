// Run from project root: npx tsx src/scripts/test-program-catalog.ts
//
// Pins audit PR G (2026-10-09, "Program catalog cards") as rebuilt by audit
// PR K (owner decisions 2026-10-12): three programs with photographs, their
// timetables and level spans derived from the groups, the catalog helpers
// (status precedence, eyebrow, slot and group text, the fit rules and the
// dashboard suggestions), the program card rendered to markup (one link per
// card, a real spec list, the photo with its alt, the Level block, the
// dashboard fit marker) and the surfaces that use it, as source checks since
// the repo has no DOM test runner. Since the simpler site (backlog #69,
// owner-approved design 2026-11-17) the spec sheet is the dashboard's card,
// and the home page shows the same component in its compact variant, pinned
// here too. Exits non-zero on any failure. The cohort length and totals come
// from the constants; this file never spells them.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  COHORT_LENGTH,
  COHORT_TOTAL_LABEL,
  PRICE_SUMMARY,
  PRIVATE_LESSONS_PRICE,
  SESSION_PRICE_LABEL,
  groupsForProgram,
  listedPrograms,
  programGroups,
  programs,
} from "../content/programs";
import { AGE_BANDS, ageBandIsMinor } from "../lib/ageBand";
import { formatCohortSchedule, formatStartDate } from "../lib/cohorts";
import { PROVISIONAL_TIER } from "../lib/level";
import { recommendPrograms } from "../lib/recommend";
import { formatTierSpan, tierById } from "../lib/tiers";
import {
  agesChipLabel,
  cohortMatchesGroup,
  formatClassTime,
  formatGroupStart,
  formatGroupWhen,
  formatSlotWhen,
  groupAgeLabel,
  groupLevelRange,
  groupStatus,
  priceParts,
  programAgeLabel,
  programEyebrow,
  programFitsAge,
  programFitsPlayer,
  programLevelRange,
  programLevelTags,
  programStatus,
  programTakesPlayerAge,
  programWhoWhenLine,
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
    `${p.id}: span is the union of its groups' tier bands`,
    !!range && range.min === Math.min(...groups.map((g) => groupLevelRange(g).min)) && range.max === Math.max(...groups.map((g) => groupLevelRange(g).max))
  );
  const slots = p.timetable ?? [];
  check(`${p.id}: one timetable slot per scheduled group, in lineup order`, slots.length === scheduled.length && slots.every((s, i) => s.group === scheduled[i].name && s.day === scheduled[i].day));
  check(`${p.id}: slot times come from the groups' 24-hour clock`, slots.every((s, i) => s.time === formatClassTime(scheduled[i].start!, scheduled[i].end!)));
  check(`${p.id}: every slot carries its group's level tag`, slots.every((s, i) => s.level === scheduled[i].level && slotLevelRange(s)?.min === groupLevelRange(scheduled[i]).min));
  if (scheduled.length > 0) {
    check(`${p.id}: enrollmentStatus set (owner D11)`, p.enrollmentStatus === "forming");
    check(`${p.id}: schedule names the day and every start`, !!p.schedule && p.schedule.includes(`${scheduled[0].day}s`) && scheduled.every((g) => p.schedule!.includes(twelveHourStart(g.start!))));
  }
}
check("Private Lessons: no timetable, by arrangement, rates on request", !privateLessons.timetable && privateLessons.schedule === "By arrangement" && privateLessons.priceSummary === PRIVATE_LESSONS_PRICE && !!privateLessons.priceLine?.startsWith(PRIVATE_LESSONS_PRICE));
check("Private Lessons: any age, all levels", programAgeLabel(groupsForProgram("private-lessons")) === "Any age" && formatTierSpan(privateLessons.levelMin, privateLessons.levelMax) === "All levels");
check("High Performance and Kids' Summer Camp are off the listing", !listedPrograms.some((p) => p.id === "high-performance" || p.id === "kids-summer-camp"));
check("High Performance stays resolvable by id for old rows", byId["high-performance"]?.unlisted === true && byId["high-performance"].title === "High Performance");
// Re-pinned for backlog #70 (owner, 2026-11-17: the whole price only). It read "(the session price) a session · (the total) for (the length)".
check("PRICE_SUMMARY is one line from the constants: the cohort total for the cohort length, the whole price", PRICE_SUMMARY === `${COHORT_TOTAL_LABEL} for ${COHORT_LENGTH}` && /^\$\d+ for \w+ weeks?$/.test(PRICE_SUMMARY), PRICE_SUMMARY);
check("…with no per-session figure in it", !/session/i.test(PRICE_SUMMARY) && !PRICE_SUMMARY.includes(SESSION_PRICE_LABEL) && !PRICE_SUMMARY.includes("·"), PRICE_SUMMARY);
check("a price splits into the amount and what it buys; a price with no amount stays whole", priceParts(PRICE_SUMMARY).join("|") === `${COHORT_TOTAL_LABEL}|for ${COHORT_LENGTH}` && priceParts(PRIVATE_LESSONS_PRICE).join("|") === PRIVATE_LESSONS_PRICE && priceParts("$52.50 for one week").join("|") === "$52.50|for one week" && priceParts("From $40").length === 1);
for (const p of listedPrograms) {
  check(`${p.id}: the price sentence on its page carries no per-session figure`, !/a session|per session/i.test(p.priceLine ?? "") && !(p.priceLine ?? "").includes(SESSION_PRICE_LABEL), p.priceLine);
}
for (const p of listedPrograms.filter((program) => program.timetable?.length)) {
  check(`${p.id}: the price sentence is the whole price, then the $20 mechanic in full`, p.priceLine === `${PRICE_SUMMARY}. If you took the $20 assessment, that $20 comes off the price.`, p.priceLine);
}

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
// Since the simpler site (backlog #69) a group's chip no longer carries the
// next cohort: the start date joins the card's when line, and the chip says
// how a player gets in. The seat rules are pinned in test-program-groups.ts.
check("the next cohort is never a group's chip", groupStatus(first7)?.kind === "open" && groupStatus({ ...hp, status: "full" })?.kind === "full" && [groupStatus(first7), groupStatus(first7, 8), groupStatus(hp), groupStatus(hp, 8)].every((status) => status?.kind !== "next-cohort"));
check("full, then invite only, then open to join", groupStatus({ ...first7, status: "full" })?.label === "Full" && groupStatus({ ...first7, status: "invite-only" })?.label === "Invite only" && groupStatus(first7)?.label === "Open to join" && groupStatus(first7)?.kind === "open");
check("by approval (High Performance), never when full or invite only", groupStatus(hp)?.label === "By approval" && groupStatus(hp)?.kind === "approval" && groupStatus({ ...hp, status: "full" })?.label === "Full" && groupStatus({ ...hp, status: "invite-only" })?.label === "Invite only");
check("an arranged group shows no chip", groupStatus(solo) === null);

console.log("cohorts and groups");
const first = programGroups.find((g) => g.id === "youth-7-10")!;
check("a Saturday 12:00 youth cohort trains in the 7–10 group", cohortMatchesGroup(cohort, first) && !cohortMatchesGroup(cohort, hp));
check("a cohort of another program never matches", !cohortMatchesGroup({ ...cohort, programId: "bootcamps" }, first));
check("an arranged group never matches a cohort", !cohortMatchesGroup({ ...cohort, programId: "private-lessons" }, solo));
// Backlog #85 (owner, 2026-11-19): a group card no longer shows "its next
// cohort" found by day and time; every open block is a card of its own,
// matched to its group by program and level (test-group-blocks.ts). The
// enroll page still finds a cohort's group by its class, pinned above.
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
    // The first group's tag is the provisional tier or the tier beside it
    // (one tag per group, owner 2026-10-13), except the competitive track,
    // which leads for a competitive or tournament youth by approval.
    const first = top?.groups[0];
    const inGroup = !first || tierId === undefined || first.level === null || first.id === "high-performance" || Math.abs(first.level - tierId) <= 1;
    check(`${band} (${level ?? "no level"}) → ${top?.program.id} fits the card's rule and its first group`, fits && inGroup);
  }
}
const competitiveTier = tierById(PROVISIONAL_TIER.competitive!);
check("the High Performance group's tag is the top tier, above the competitive provisional tier", hp.level === 5 && competitiveTier.id < hp.level);

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
// Re-pinned for backlog #70: the dashboard's card stacked the session price over the total; it stacks the total over the cohort length now.
const [priceLead, priceRest] = priceParts(PRICE_SUMMARY);
const priceDd = card.match(/<dt[^>]*>Price<\/dt><dd[^>]*>([\s\S]*?)<\/dd>/)?.[1] ?? "";
check("the price is stacked: the cohort total in white, the cohort length in white/60, no middot", priceLead === COHORT_TOTAL_LABEL && priceRest === `for ${COHORT_LENGTH}` && priceDd.includes(`font-semibold text-white">${priceLead}<`) && priceDd.includes(`text-white/60">${priceRest}<`) && !priceDd.includes("·"), priceDd);
check("the dashboard's card shows the whole price and no per-session figure", !/a session|per session/i.test(card) && !card.includes(SESSION_PRICE_LABEL));
check("the Levels block shows one tag per group level, in ladder order: Beginner, Novice, High Performance", JSON.stringify(programLevelTags(groupsForProgram("youth-programs"))) === "[1,2,5]" && at(card, ">Beginner</span>") < at(card, ">Novice</span>") && at(card, ">Novice</span>") < at(card, ">High Performance</span>") && card.includes(">Levels</p>"));
check("no span text, no band, no rail on the card", !card.includes(formatTierSpan(youth.levelMin, youth.levelMax) + "<") && !card.includes("1.0–7.0") && !card.includes('aria-label="Built for') && !card.includes('role="meter"'));
check("the level note is under the tags", card.includes(youth.levelNote!) && at(card, youth.levelNote!) > at(card, ">High Performance</span>"));
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
check("fit → no rail marker on the card any more (tags only)", !fitMaya.includes("is in this range"));
const fitYou = render(createElement(ProgramCard, { program: adult, fit: { name: null, level: 2.5 } }));
check("fit with no name → Fits you, Your level", fitYou.includes("Fits you") && fitYou.includes("Your level: Novice · 2.5"));
const outOfRange = render(createElement(ProgramCard, { program: adult, fit: { name: "Maya", level: 6.5 } }));
check("a fit outside the span keeps the plain eyebrow", outOfRange.includes("Adults · Sundays") && !outOfRange.includes("Fits Maya"));

const adultCard = render(createElement(ProgramCard, { program: adult }));
check("Adult Bootcamps: 16 and up, the three classes by their level-led names", adultCard.includes(">16 and up<") && ["Beginner Adult Bootcamp", "Intermediate Adult Bootcamp", "Advanced Adult Bootcamp"].every((s) => adultCard.includes(`>${s}<`)));
check("Adult Bootcamps shows three tags: Beginner, Intermediate, Advanced", JSON.stringify(programLevelTags(groupsForProgram("bootcamps"))) === "[1,3,4]" && !adultCard.includes("Beginner – ") && count(adultCard, "<li><span class=\"inline-flex min-h-6 items-center gap-1.5 rounded-full") === 3);

const privateCard = render(createElement(ProgramCard, { program: privateLessons }));
check("Private Lessons: any age, by arrangement, rates on request, all levels", privateCard.includes(">Any age<") && privateCard.includes(">By arrangement<") && privateCard.includes(`>${PRIVATE_LESSONS_PRICE}<`) && privateCard.includes(">All levels<") && programLevelTags(groupsForProgram("private-lessons")) === null);
check(
  "Private Lessons: no status chip, so By arrangement reads twice (eyebrow, When row), never three times, never Groups forming",
  count(privateCard, "By arrangement") === 2 && !privateCard.includes('class="absolute right-3 top-3') && !privateCard.includes("Groups forming"),
  `${count(privateCard, "By arrangement")} × By arrangement`
);
check("the youth card keeps its chip over the photo", card.includes('class="absolute right-3 top-3 flex rounded-full bg-[#061427]"'));

const h2 = render(createElement(ProgramCard, { program: youth, headingLevel: 2 }));
check("headingLevel 2 renders an h2", h2.includes("<h2") && !h2.includes("<h3"));
check("from md the card lies on its side, at lg it stacks again", card.includes("md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:flex") && card.includes("md:aspect-auto md:h-full") && card.includes("lg:aspect-[16/10]"));

// ── The compact card (home) ─────────────────────────────────────────────────
console.log("ProgramCard, compact (the home page)");
const compact = render(createElement(ProgramCard, { program: youth, variant: "compact" }));
const compactPrivate = render(createElement(ProgramCard, { program: privateLessons, variant: "compact" }));
check("one link, the title, stretched over the card, to the program's page", count(compact, "<a ") === 1 && /<h3[^>]*><a [^>]*href="\/programs\/youth-programs"[^>]*>Youth Bootcamps<\/a><\/h3>/.test(compact) && compact.includes("after:absolute after:inset-0"));
check("the photo with its real alt text", compact.includes("<img") && compact.includes(`alt="${youth.photo!.alt}"`));
check("one line of who and when, derived from the groups", compact.includes(">Ages 7–17 · Saturdays</p>") && programWhoWhenLine(groupsForProgram("youth-programs")) === "Ages 7–17 · Saturdays" && programWhoWhenLine(groupsForProgram("bootcamps")) === "16 and up · Sundays" && programWhoWhenLine(groupsForProgram("private-lessons")) === "Any age · By arrangement");
// Re-pinned for backlog #70 (owner, 2026-11-17: no price on the home page). The card showed the session price under who and when.
check("no price on the home card: no dollar sign, no per-session figure, no total; and the card file types none", !compact.includes("$") && !/a session|per session/i.test(compact) && !compact.includes(SESSION_PRICE_LABEL) && !compact.includes(COHORT_TOTAL_LABEL) && !/\$\d/.test(read("src/components/sections/ProgramCard.tsx")));
check("the home card: the title, then who and when, then the link line, and nothing between", /<\/h3><p class="[^"]*">Ages 7–17 · Saturdays<\/p><span aria-hidden="true"[^>]*>See groups/.test(compact));
check("See groups for a program with groups", compact.includes(">See groups") && !compact.includes("View Program"));
// Re-pinned for backlog #70: "Rates on request" left the home card with the other prices; it stays on /programs and on the program's page.
check("private lessons: any age, by arrangement, See details, and no price line (Rates on request is on its page)", compactPrivate.includes(">Any age · By arrangement</p>") && !compactPrivate.includes(PRIVATE_LESSONS_PRICE) && compactPrivate.includes(">See details") && /<a [^>]*href="\/programs\/private-lessons"/.test(compactPrivate));
check("no description, no labelled rows, no levels block, no chip", !compact.includes(youth.description) && !compact.includes("<dl") && !compact.includes(">Levels</p>") && !compact.includes("Groups forming") && !compact.includes("uppercase"));
check("the photo sits left on phones and on top from md", compact.includes("grid-cols-[116px_minmax(0,1fr)]") && compact.includes("md:flex md:flex-col") && compact.includes("md:aspect-[16/10]"));
check("headingLevel still sets the title's rank", render(createElement(ProgramCard, { program: youth, variant: "compact", headingLevel: 2 })).includes("<h2") && !compact.includes("<h2"));
const compactList = render(createElement(ProgramCardList, { programs: listedPrograms, variant: "compact" }));
check("the compact list: a real list, three across from md, one link per card", compactList.startsWith('<ul role="list"') && compactList.includes("md:grid-cols-3") && !compactList.includes("lg:grid-cols-3") && count(compactList, "<article") === listedPrograms.length && count(compactList, "<a ") === listedPrograms.length);
check("the dashboard's card did not change: the spec sheet is the default", card === render(createElement(ProgramCard, { program: youth, variant: "spec" })) && card.includes("<dl") && card.includes(">Levels</p>"));

console.log("ProgramCardList");
const grid = render(createElement(ProgramCardList, { programs: listedPrograms, publicCohorts: [cohort] }));
check("a real list of cards, three across from lg", grid.startsWith('<ul role="list"') && grid.includes("lg:grid-cols-3") && count(grid, "<article") === listedPrograms.length);
check("one link per card across the list", count(grid, "<a ") === listedPrograms.length);
check("the list passes the next cohort to its program", grid.includes("Next cohort Oct 18"));
check("every listed photo is drawn once", listedPrograms.every((p) => count(grid, `alt="${p.photo!.alt}"`) === 1));

// ── Surfaces ────────────────────────────────────────────────────────────────
console.log("Surfaces");
const cardSrc = read("src/components/sections/ProgramCard.tsx");
check("card: no Learn more, no hover-only strip, no second button (one Link in each variant)", !cardSrc.includes("Learn more") && !cardSrc.includes("group-hover:max-h") && count(cardSrc, "<Link") === 2 && count(cardSrc, "<Link href={p.ctaHref} className={STRETCHED_LINK}>") === 2);
check("card: stretched link and has-focus ring", cardSrc.includes("after:absolute after:inset-0 after:z-10") && cardSrc.includes("has-[a:focus-visible]:ring-2"));
check("card: no scale on hover, no plate import", !cardSrc.includes("hover:scale") && !cardSrc.includes("ProgramPlate"));
check("card: the photo through next/image with sizes", cardSrc.includes('from "next/image"') && cardSrc.includes("sizes={PHOTO_SIZES}"));
check("card: one StatusChip, rendered inside the photo column", count(cardSrc, "<StatusChip status={status} />") === 1);
const gridSrc = read("src/components/sections/ProgramsGrid.tsx");
check("home grid renders the compact ProgramCardList and reads no cohort", gridSrc.includes('<ProgramCardList programs={programs} variant="compact" />') && !gridSrc.includes("getPublicCohorts") && !gridSrc.includes("async "));
check("home grid: the five levels as a strip under the cards, no quiz line", gridSrc.includes("<LevelsStrip") && !gridSrc.includes("QUIZ_CTA_LABEL") && !gridSrc.includes("Not sure which fits?"));
const home = read("src/app/page.tsx");
check("home: the three listed programs", home.includes("<ProgramsGrid programs={listedPrograms} />"));
const programsPage = read("src/app/programs/page.tsx");
const catalogSrc = read("src/components/sections/ProgramCatalog.tsx");
const stripSrc = read("src/components/sections/LevelsStrip.tsx");
check("/programs: the five levels as a strip, under the dropdowns and above the quiz side line", programsPage.includes("levels={<LevelsStrip") && at(catalogSrc, "<Filters query={query}") < at(catalogSrc, "{levels}") && at(catalogSrc, "{levels}") < at(catalogSrc, "<QuizSideLine") && !programsPage.includes("<TierLine"));
check("the strip reads the count and the names from tiers.ts, and links to the ladder", stripSrc.includes("TIER_COUNT_WORD") && stripSrc.includes("TIERS.map") && stripSrc.includes("<LevelTag level={tier.id} plain") && stripSrc.includes('href="/assessment#ladder"') && !/Beginner|Novice|Intermediate|Advanced|Five/.test(stripSrc.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")));
check("/programs: the catalog of groups, then Good to know; no quiz band and no newsletter band", programsPage.includes("<ProgramCatalog") && at(programsPage, "<ProgramCatalog") < at(programsPage, "<GoodToKnow") && !programsPage.includes("<QuizBand") && !programsPage.includes("<EmailCapture"));
check("/programs: no lime button in the header band; the quiz is the side line", !programsPage.includes('variant="primary"') && !programsPage.includes("data-quiz-cta") && catalogSrc.includes('<QuizSideLine source="programs-filters"'));
// Re-pinned for backlog #85: one card per open block, built once on the server.
check("/programs: the open blocks are read once on the server, and every card is built from them", programsPage.includes("groupCards(programGroups, publicCohorts, seats)") && count(programsPage, "getPublicCohorts()") === 1 && programsPage.includes("cards={cards}"));
const detail = read("src/app/programs/[slug]/page.tsx");
check("detail: the photo hero with its alt, 16:10, priority", /<Image[\s\S]*?src=\{program\.photo\.src\}[\s\S]*?alt=\{program\.photo\.alt\}[\s\S]*?priority/.test(detail) && detail.includes("aspect-[16/10]") && !detail.includes("ProgramPlate"));
check("detail: the ages chip and one level tag per group level under the description (L8; owner 2026-10-13)", detail.includes("{agesChipLabel(groups)}") && detail.includes("<LevelTag key={id} level={id} />") && !detail.includes("<TierRangeBadges levelMin={range.min}"));
// Re-pinned for backlog #85: a card per open block of the program, with its seats.
check("detail: the groups as cards, one per open block, with its seats", detail.includes("<ProgramGroupCard") && detail.includes("groupCards(groups, openCohorts, seatCounts)") && detail.includes("block={block}"));
check("detail: Levels in this program lights the groups' tags on the ladder", detail.includes("Levels in this program") && /<TierLine variant="ladder" orientation="vertical"[^>]*tiers=\{tags\}/.test(detail) && detail.includes("programLevelTags(groups)"));
// One name for one link (fix round, 2026-11-17): the home page and /programs read "How levels work →" to the same ladder.
check("detail: the ladder link reads How levels work, like the strip's", /<Link href="\/assessment#ladder" className=\{`mt-2 \$\{TEXT_LINK_LIME\}`\}>\s*How levels work →\s*<\/Link>/.test(detail) && !detail.includes("How tiers work"));
// The closing one block below reads "Groups are open to join.", so the empty state no longer opens on "Groups are forming."
check("detail: with no public cohort, the line says the dates are not public yet, and no longer that groups are forming", detail.includes("Cohort dates aren&apos;t public yet.{\" \"}") && !/>\s*Groups are forming\./.test(detail) && !detail.includes("Groups are forming. Cohort dates"));
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
