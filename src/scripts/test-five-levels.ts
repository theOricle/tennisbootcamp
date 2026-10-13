// Run from project root: npx tsx src/scripts/test-five-levels.ts
//
// Pins audit PR P (owner decisions 2026-10-13: "we should only have 5 lvls"
// and "just one tag for each program"):
//   1. five display tiers over the unchanged 1.0–7.0 levels, High
//      Performance holding 5.0–7.0 with progress inside it, the ten retired
//      slugs redirecting, the colour ramp and the emblem frames at five;
//   2. the TierLine's five groups sized by pip count, its `tiers` (set) mode,
//      and the LevelTag chip;
//   3. one level tag per group with level-led titles, the day never in a
//      title or eyebrow, the exact level filter with "Closest fit", the
//      recommender's one-tier reach, and the cards and pages that read tags
//      instead of spans;
//   4. every ladder surface counting five, in copy and in the briefs; the
//      /api/intake contract untouched.
// Exits non-zero on any failure.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  LEGACY_TIER_SLUGS,
  LEVEL_MAX,
  LEVEL_MIN,
  LEVEL_OPTIONS,
  LEVEL_STEPS,
  TIERS,
  TIER_COUNT,
  TIER_COUNT_WORD,
  TIER_LADDER_SPAN,
  TOP_TIER,
  formatTierSpan,
  tierBySlug,
  tierForLevel,
  tierOverlapsRange,
  tierProgress,
  withArticle,
  type TierId,
} from "../lib/tiers";
import { TIER_FRAME, TIER_PIP, FIELD_TINT } from "../lib/tierStyle";
import { EMBLEM_SHAPES, TIER_IDS, emblemLabel } from "../components/tiers/emblemGeometry";
import { TierLine } from "../components/tiers/TierLine";
import { LevelTag, TierChip } from "../components/tiers";
import { bootcampTitle, groupById, groupsForProgram, listedPrograms, programGroups } from "../content/programs";
import { groupLevelRange, groupTier, programLevelTags, slotLevelRange } from "../lib/programCatalog";
import {
  closestGroups,
  filterGroups,
  groupTakesTier,
  groupTakesTierNear,
  parseCatalogQuery,
  tierDistance,
  tierQueryFor,
} from "../lib/programFilters";
import { groupsFor, recommendPrograms } from "../lib/recommend";
import { levelNote } from "../lib/enrollPlayers";
import { ProgramGroupCard } from "../components/sections/ProgramGroupCard";
import { ProgramCard } from "../components/sections/ProgramCard";
import { ProgramCatalogView, type CatalogProgram } from "../components/sections/ProgramCatalog";
import { buildAssessmentCompleteEmail, buildCohortInviteEmail, cohortInviteSubject, tierStandingLine } from "../lib/emailBodies";
import nextConfig, { TIER_EMBLEM_REDIRECTS } from "../../next.config";

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
const read = (path: string) => readFileSync(join(ROOT, path), "utf8").replace(/\r\n/g, "\n");
const render = (el: React.ReactElement) => renderToStaticMarkup(el);
const at = (hay: string, needle: string) => hay.indexOf(needle);
const count = (hay: string, needle: string) => hay.split(needle).length - 1;
const ids = (list: { id: string }[]) => list.map((g) => g.id).join(",");
const params = (s: string) => new URLSearchParams(s);
const g = (id: string) => groupById(id)!;

/** Every .ts/.tsx file under a source directory. */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${name}`;
    if (statSync(join(ROOT, rel)).isDirectory()) out.push(...sourceFiles(rel));
    else if (/\.tsx?$/.test(name)) out.push(rel);
  }
  return out;
}
function withoutComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");
}

async function main() {
  // ── 1. Five tiers ─────────────────────────────────────────────────────────
  console.log("Five tiers over thirteen half steps (owner, 2026-10-13)");
  check("five tiers, Beginner to High Performance", TIER_COUNT === 5 && TIER_COUNT_WORD === "five" && TIER_LADDER_SPAN === "Beginner to High Performance" && TOP_TIER.name === "High Performance");
  check("the bands: 1.0–1.5, 2.0–2.5, 3.0–3.5, 4.0–4.5, 5.0–7.0", TIERS.map((t) => t.band).join("|") === "1.0–1.5|2.0–2.5|3.0–3.5|4.0–4.5|5.0–7.0" && TIERS.every((t) => t.band === (t.levelMin === t.levelMax ? t.levelMin.toFixed(1) : `${t.levelMin.toFixed(1)}–${t.levelMax.toFixed(1)}`)));
  check("the bands tile the ladder with no gap and no overlap", TIERS.every((t, i) => i === 0 || t.levelMin === TIERS[i - 1].levelMax + 0.5) && TIERS[0].levelMin === LEVEL_MIN && TOP_TIER.levelMax === LEVEL_MAX);
  check("the stored level never moved: thirteen half steps, 1.0 to 7.0", LEVEL_STEPS.length === 13 && LEVEL_STEPS[0] === 1 && LEVEL_STEPS[12] === 7);
  check("5.0, 5.5, 6.0, 6.5 and 7.0 are all High Performance", [5, 5.5, 6, 6.5, 7].every((l) => tierForLevel(l)?.id === 5) && tierForLevel(4.5)?.id === 4 && tierForLevel("6.5")?.id === 5);
  check("the colours: slate, light slate, lime secondary, lime primary, gold", TIERS.map((t) => t.color).join(",") === "#7D8CA3,#AEBBCD,#8CC63F,#B4E655,#E3C46F");
  check("the slugs are the names, and tierBySlug finds them", TIERS.map((t) => t.slug).join("|") === "beginner|novice|intermediate|advanced|high-performance" && tierBySlug("High-Performance")?.id === 5 && tierBySlug("elite") === null && tierBySlug("") === null);
  check("every blurb is plain coach voice: no intensifier, no exclamation mark, under 70 characters", TIERS.every((t) => !/\b(real|really|truly|actually|very|super)\b/i.test(t.blurb) && !t.blurb.includes("!") && t.blurb.length <= 70));
  check("the top blurb says what the top tier is, without naming the youth group", !/bootcamp|youth|approval/i.test(TOP_TIER.blurb) && TOP_TIER.blurb.length > 0);
  check("LEVEL_OPTIONS: 5.0 to 7.0 all read High Performance", LEVEL_OPTIONS.slice(8).every((o) => o.label === `${o.value} · High Performance`) && LEVEL_OPTIONS[8].value === "5.0" && LEVEL_OPTIONS[7].label === "4.5 · Advanced");
  check("withArticle: a High Performance group, an Advanced group", withArticle("High Performance group") === "a High Performance group" && withArticle("Advanced group") === "an Advanced group");

  console.log("Progress inside High Performance");
  const p50 = tierProgress(5)!;
  const p55 = tierProgress(5.5)!;
  const p70 = tierProgress(7)!;
  check("5.0 is step 1 of 5, next step 5.5, not the top", p50.step === 1 && p50.steps === 5 && p50.next === null && p50.nextLevel === 5.5 && !p50.atTop && p50.caption === "High Performance runs 5.0–7.0. Next step: 5.5.");
  check("5.5 is step 2 of 5, next step 6.0", p55.step === 2 && p55.nextLevel === 6 && p55.caption === "High Performance runs 5.0–7.0. Next step: 6.0.");
  check("7.0 is step 5 of 5, the top of the ladder", p70.step === 5 && p70.steps === 5 && p70.atTop && p70.nextLevel === null && p70.caption === "Top of the ladder.");
  check("4.5 still climbs to High Performance at 5.0", tierProgress(4.5)?.caption === "Halfway to High Performance. Next tier at 5.0." && tierProgress(4.5)?.steps === 2 && tierProgress(4)?.caption === "Next tier: High Performance at 5.0.");
  check("a level above 7.0 clamps to the top", tierProgress(9)?.atTop === true && tierProgress(9)?.level === 7);

  console.log("Spans in words");
  check("4.0–5.5 reads Advanced – High Performance (5.5 is not the top)", formatTierSpan(4, 5.5) === "Advanced – High Performance");
  check("4.0–7.0 reads Advanced and up; 5.0–7.0 and 5.0–5.5 read High Performance", formatTierSpan(4, 7) === "Advanced and up" && formatTierSpan(5, 7) === "High Performance" && formatTierSpan(5, 5.5) === "High Performance");
  check("1.0–7.0 reads All levels; 1.0–6.5 reads Beginner – High Performance", formatTierSpan(1, 7) === "All levels" && formatTierSpan(1, 6.5) === "Beginner – High Performance");
  check("tierOverlapsRange: High Performance meets any band that reaches 5.0; Novice meets 1.0–2.0; nothing meets an unset band", tierOverlapsRange(TOP_TIER, 4, 5) && !tierOverlapsRange(TOP_TIER, 3, 4.5) && tierOverlapsRange(TIERS[1], 1, 2) && !tierOverlapsRange(TIERS[1], 3, 3.5) && !tierOverlapsRange(TIERS[1], null, null));
  check("levelNote reads the whole tier: a tournament adult (Advanced) is inside a 4.0–7.0 band and outside 1.0–3.5", levelNote({ name: "Leo", level: null, selfLevel: "elite" }, { min: 4, max: 7 }) === "Leo: provisional Advanced, from the quiz. Our coaches confirm it on court in week one." && (levelNote({ name: "Leo", level: null, selfLevel: "elite" }, { min: 1, max: 3.5 }) ?? "").includes("outside this group's Beginner – Intermediate band"));

  console.log("Retired slugs redirect to their live tier");
  const served = nextConfig.redirects ? await nextConfig.redirects() : [];
  const RETIRED_TOP = ["ace", "match-point", "grand-slam", "elite", "pro", "world-class"];
  check("ten retired slugs", Object.keys(LEGACY_TIER_SLUGS).length === 10);
  check("ace, match-point, grand-slam, elite, pro and world-class all land on high-performance", RETIRED_TOP.every((old) => LEGACY_TIER_SLUGS[old] === "high-performance"));
  check("love, rally, deuce and break keep their 2026-10-12 targets", LEGACY_TIER_SLUGS.love === "beginner" && LEGACY_TIER_SLUGS.rally === "novice" && LEGACY_TIER_SLUGS.deuce === "intermediate" && LEGACY_TIER_SLUGS.break === "advanced");
  check("next.config serves every one permanently", TIER_EMBLEM_REDIRECTS.length === 10 && Object.entries(LEGACY_TIER_SLUGS).every(([old, live]) => served.some((r) => r.source === `/tier-emblem/${old}` && r.destination === `/tier-emblem/${live}` && r.permanent === true)));
  check("a retired slug in the catalog URL reads as any level", tierQueryFor("elite") === null && tierQueryFor("world-class") === null && tierQueryFor("high-performance")?.id === 5);

  console.log("Style maps and emblems at five");
  check("the class maps and frames cover 1–5 and nothing else", Object.keys(TIER_PIP).join() === "1,2,3,4,5" && Object.keys(TIER_FRAME).join() === "1,2,3,4,5" && !("platinum" in FIELD_TINT));
  check("High Performance: gold field, navy ink, notched, bevelled, ring 3", TIER_FRAME[5].field === "gold" && TIER_FRAME[5].ink === "navy" && TIER_FRAME[5].notched && TIER_FRAME[5].bevel && TIER_FRAME[5].ring === 3);
  check("Advanced keeps the lime field with studs and the tier-colour inner ring, so 4 and 5 differ in five features", TIER_FRAME[4].field === "lime" && TIER_FRAME[4].studs && TIER_FRAME[4].inner === "tier" && !TIER_FRAME[4].notched);
  check("five motifs, every one serialises; High Performance draws the trophy with laurel (seven shapes)", TIER_IDS.length === 5 && TIER_IDS.every((id) => EMBLEM_SHAPES(id).length > 2) && EMBLEM_SHAPES(5, "earned", "full").filter((s) => s.kind === "path" || s.kind === "line").length >= 7);
  check("labels count five", emblemLabel(5) === "High Performance, tier 5 of 5" && emblemLabel(1) === "Beginner, tier 1 of 5");

  // ── 2. TierLine and LevelTag ──────────────────────────────────────────────
  console.log("TierLine: five groups sized by pip count, a set mode");
  const line = read("src/components/tiers/TierLine.tsx");
  const rail = render(createElement(TierLine, { variant: "rail", level: 5.5, labels: "ends" }));
  check("the rail renders five groups, the last five pips wide", count(rail, 'class="flex flex-[2] items-end gap-[2px]"') === 4 && count(rail, 'class="flex flex-[5] items-end gap-[2px]"') === 1 && count(rail, "rounded-[1px]") === 13);
  check("5.5 lights ten pips, the current one ringed, and names the top at 7.0", count(rail, "bg-[#E3C46F]") === 2 && rail.includes("ring-[1.5px] ring-white") && rail.includes("High Performance · Level 5.5") && rail.includes("Top of the ladder · 7.0") && rail.includes('aria-valuemax="5"') && rail.includes("Next step: 6.0."));
  check("7.0 reads Top of the ladder with every pip lit", (() => { const top = render(createElement(TierLine, { variant: "rail", level: 7, labels: "ends" })); return top.includes(">Top of the ladder</span>") && !top.includes("· 7.0</span>") && count(top, "bg-[#E3C46F]") === 5; })());
  const setRail = render(createElement(TierLine, { variant: "rail", tiers: [1, 2, 5], labels: "ends" }));
  check("a set rail lights only the named tiers and says who it is built for", setRail.includes('aria-label="Built for Beginner, Novice and High Performance"') && count(setRail, "bg-[#7D8CA3]") === 2 && count(setRail, "bg-[#AEBBCD]") === 2 && !setRail.includes("bg-[#8CC63F]") && !setRail.includes("bg-[#B4E655]") && count(setRail, "bg-[#E3C46F]") === 5 && setRail.includes(">Beginner, Novice and High Performance</span>"));
  const setLadder = render(createElement(TierLine, { variant: "ladder", orientation: "vertical", density: "compact", tiers: [1, 3, 4] }));
  check("a set ladder marks the named rungs in this program and the rest as future", count(setLadder, "(in this program)") === 3 && setLadder.includes("Beginner<span class=\"sr-only\"> (in this program)") && setLadder.includes("Advanced<span class=\"sr-only\"> (in this program)") && !setLadder.includes("Novice<span class=\"sr-only\"> (in this program)"));
  const horizontal = render(createElement(TierLine, { variant: "ladder", orientation: "horizontal" }));
  check("the horizontal ladder is five columns, High Performance last with its 5.0–7.0 band", horizontal.includes("grid-cols-5") && count(horizontal, "<li ") === 5 && horizontal.lastIndexOf("5.0–7.0") > horizontal.lastIndexOf("4.0–4.5") && horizontal.includes("The five tiers, Beginner (lowest) to High Performance (highest)"));
  check("labels=all names the five groups with the groups' widths", (() => { const all = render(createElement(TierLine, { variant: "rail", level: 3, labels: "all" })); return count(all, 'class="flex-[2] font-semibold text-white"') === 3 && all.includes('class="flex-[5] text-white/55">High Performance<'); })());
  check("the ghost rail counts five", render(createElement(TierLine, { variant: "rail" })).includes('aria-label="Unranked. Five tiers, Beginner to High Performance."'));
  check("no seven left in the line", !/seven|grid-cols-7|md:grid-cols-7/i.test(line) && line.includes("5: \"flex-[5]\""));

  console.log("LevelTag");
  const tag = render(createElement(LevelTag, { level: 3 }));
  const anyTag = render(createElement(LevelTag, { level: null }));
  check("a tag is a chip with the 20px mark, the name and the ladder position for a reader", tag.includes('width="20"') && tag.includes(">Intermediate</span>") && tag.includes(", tier 3 of 5, levels 3.0–3.5") && tag.includes('aria-hidden="true"'));
  check("a null level reads All levels with no mark", anyTag.includes(">All levels</span>") && !anyTag.includes("<svg"));
  check("TierChip at 6.0 reads High Performance · 6.0", render(createElement(TierChip, { level: 6, showLevel: true })).includes(">High Performance</span>") && render(createElement(TierChip, { level: 6, showLevel: true })).includes("· 6.0"));

  // ── 3. One level tag per group ────────────────────────────────────────────
  console.log("One level tag per group, level-led titles (owner, 2026-10-13)");
  const expected: [string, TierId | null, string][] = [
    ["youth-7-10", 1, "Beginner Junior Bootcamp"],
    ["youth-11-15", 2, "Novice Youth Bootcamp"],
    ["high-performance", 5, "High Performance Youth Bootcamp"],
    ["adult-newer", 1, "Beginner Adult Bootcamp"],
    ["adult-intermediate", 3, "Intermediate Adult Bootcamp"],
    ["adult-advanced", 4, "Advanced Adult Bootcamp"],
    ["private-lessons", null, "One-to-one coaching"],
  ];
  for (const [id, level, name] of expected) {
    check(`${id}: level ${level ?? "any"}, "${name}"`, g(id).level === level && g(id).name === name, `${g(id).level} "${g(id).name}"`);
  }
  check("the ids did not move, so anchors, redirects and quiz links still land", ids(programGroups) === "youth-7-10,youth-11-15,high-performance,adult-newer,adult-intermediate,adult-advanced,private-lessons");
  check("no group carries a range", programGroups.every((x) => !("levelMin" in x) && !("levelMax" in x)));
  check("the titles come from the tier names", bootcampTitle(1, "Junior") === "Beginner Junior Bootcamp" && programGroups.filter((x) => x.day).every((x) => x.name === bootcampTitle(x.level as TierId, x.name.split(" ").slice(-2)[0] as "Junior" | "Youth" | "Adult")));
  check("the day and time stay out of every title", programGroups.every((x) => !/Saturday|Sunday|\d:\d\d|am\b|pm\b/.test(x.name)));
  check("groupTier and groupLevelRange derive the band from the tag", groupTier(g("high-performance"))?.name === "High Performance" && JSON.stringify(groupLevelRange(g("high-performance"))) === JSON.stringify({ min: 5, max: 7 }) && JSON.stringify(groupLevelRange(g("adult-intermediate"))) === JSON.stringify({ min: 3, max: 3.5 }) && JSON.stringify(groupLevelRange(g("private-lessons"))) === JSON.stringify({ min: 1, max: 7 }) && groupTier(g("private-lessons")) === null);
  check("timetable slots carry the tag", listedPrograms[0].timetable?.map((s) => s.level).join() === "1,2,5" && slotLevelRange(listedPrograms[0].timetable![2])?.max === 7);
  check("programLevelTags: Youth [1,2,5], Adult [1,3,4], Private null", JSON.stringify(programLevelTags(groupsForProgram("youth-programs"))) === "[1,2,5]" && JSON.stringify(programLevelTags(groupsForProgram("bootcamps"))) === "[1,3,4]" && programLevelTags(groupsForProgram("private-lessons")) === null && JSON.stringify(programLevelTags([])) === "[]");
  check("the program spans are the union of the tags' bands (internal)", listedPrograms[0].levelMin === 1 && listedPrograms[0].levelMax === 7 && listedPrograms[1].levelMin === 1 && listedPrograms[1].levelMax === 4.5);

  console.log("The level filter matches the tag exactly; Closest fit when nothing does");
  const tier = (slug: string) => tierBySlug(slug)!;
  check("exact: Intermediate matches the Intermediate Adult Bootcamp only, and any-level groups", groupTakesTier(g("adult-intermediate"), tier("intermediate")) && !groupTakesTier(g("adult-advanced"), tier("intermediate")) && !groupTakesTier(g("adult-newer"), tier("intermediate")) && groupTakesTier(g("private-lessons"), tier("intermediate")));
  check("distance and reach", tierDistance(g("adult-newer"), tier("intermediate")) === 2 && tierDistance(g("high-performance"), tier("advanced")) === 1 && groupTakesTierNear(g("high-performance"), tier("advanced"), 1) && !groupTakesTierNear(g("youth-7-10"), tier("intermediate"), 1));
  const filtered = (s: string) => ids(filterGroups(programGroups, parseCatalogQuery(params(s))));
  const closest = (s: string) => ids(closestGroups(programGroups, parseCatalogQuery(params(s))));
  check("age 9 at Intermediate: private lessons match exactly; Closest fit is the Beginner Junior Bootcamp", filtered("age=9&level=intermediate") === "private-lessons" && closest("age=9&level=intermediate") === "youth-7-10");
  check("age 14 at Advanced: Closest fit is High Performance (one away), not the Novice group (two)", closest("age=14&level=advanced") === "high-performance");
  check("adult at High Performance: Closest fit is the Advanced Adult Bootcamp", closest("age=adult&level=high-performance") === "adult-advanced");
  check("adult at Novice: a tie keeps both neighbours in lineup order", closest("age=adult&level=novice") === "adult-newer,adult-intermediate");
  check("an exact tagged match leaves Closest fit empty", closest("age=adult&level=intermediate") === "" && filtered("age=adult&level=intermediate") === "adult-intermediate,private-lessons");
  check("no level filter, no Closest fit", closest("age=9") === "" && closest("age=teen") === "");
  check("Closest fit respects the age: age 5 at any level has nothing near", closest("age=5&level=advanced") === "" && filtered("age=5&level=advanced") === "private-lessons");
  check("Closest fit never lists an any-level group", LEVEL_STEPS.every(() => !closest("age=9&level=advanced").includes("private-lessons")));

  console.log("The recommender reaches one tier either way; High Performance first for competitive youth");
  const base = { goals: [] as string[], programs: [] as string[], preferredLocationIds: [] as string[], availability: [] as string[] };
  const rec = (ageBand: "junior" | "teen" | "adult", level?: "new" | "rally" | "competitive" | "elite") =>
    recommendPrograms({ ...base, who: ageBand === "adult" ? "adult" : "youth", ageBand, level })[0];
  check("junior beginner → Beginner (exact) then Novice (one up)", ids(rec("junior", "new").groups) === "youth-7-10,youth-11-15");
  check("junior rally → Beginner and Novice (one either side)", ids(rec("junior", "rally").groups) === "youth-7-10,youth-11-15");
  check("junior competitive → High Performance first by approval, then Novice; never the Beginner group", ids(rec("junior", "competitive").groups) === "high-performance,youth-11-15");
  check("teen tournament → High Performance only (one up from Advanced)", ids(rec("teen", "elite").groups) === "high-performance");
  check("adult tournament → Intermediate and Advanced; never the youth group", ids(rec("adult", "elite").groups) === "adult-intermediate,adult-advanced");
  check("no fitting group → every group, so a card never goes blank", listedPrograms.every((p) => groupsFor(p, { ...base, ageBand: "junior", level: "elite" }).length > 0) && ids(groupsFor(listedPrograms[1], { ...base, ageBand: "adult", level: "new" })) === "adult-newer");

  console.log("Cards and pages read tags, never spans");
  const youth = listedPrograms[0];
  const card = render(createElement(ProgramGroupCard, { group: g("adult-intermediate"), program: listedPrograms[1] }));
  check("group card: the level-led title, the type as the eyebrow, no day there", card.includes(">Intermediate Adult Bootcamp</h3>") && card.includes(">Weekend group class</p>") && !/<p class="[^"]*">Sundays<\/p>/.test(card));
  check("group card: Level row first with one tag, then Ages, When (the day as a detail row), Where, Price", /<dt[^>]*>Level<\/dt><dd class="min-w-0"><span class="inline-flex[^"]*">.*?>Intermediate<\/span>/.test(card) && at(card, ">Level</dt>") < at(card, ">Ages</dt>") && /<dt[^>]*>When<\/dt><dd[^>]*>Sundays 5:00–6:00 pm<\/dd>/.test(card) && at(card, ">When</dt>") < at(card, ">Where</dt>"));
  check("group card: no range, no visible band, no rail, one link", !card.includes(" – ") && !/text-white\/60">3\.0–3\.5</.test(card) && !card.includes('aria-label="Built for') && !card.includes('role="meter"') && count(card, "<a ") === 1);
  const hp = render(createElement(ProgramGroupCard, { group: g("high-performance"), program: youth }));
  check("the High Performance card: the bootcamp title, the High Performance tag with the gold mark, By approval, the competitive note", hp.includes(">High Performance Youth Bootcamp</h3>") && hp.includes("#E3C46F") && hp.includes(", tier 5 of 5, levels 5.0–7.0") && hp.includes("By approval") && hp.includes("The competitive track"));
  const programCard = render(createElement(ProgramCard, { program: youth }));
  check("program card: Levels block lists the three tags in ladder order and the When row names the level-led groups", programCard.includes(">Levels</p>") && at(programCard, ">Beginner</span>") < at(programCard, ">Novice</span>") && at(programCard, ">Novice</span>") < at(programCard, ">High Performance</span>") && programCard.includes("Beginner Junior Bootcamp") && !programCard.includes('aria-label="Built for'));
  const privateCard = render(createElement(ProgramCard, { program: listedPrograms[2] }));
  check("private lessons card: one Level, All levels", privateCard.includes(">Level</p>") && privateCard.includes(">All levels</span>") && count(privateCard, "All levels") === 1);
  const catalogPrograms: CatalogProgram[] = listedPrograms.map((p) => ({ slug: p.slug, title: p.title, type: p.type, description: p.description, photo: p.photo, ageBands: p.ageBands, timetable: p.timetable, schedule: p.schedule }));
  const view = render(createElement(ProgramCatalogView, { programs: catalogPrograms, groups: programGroups, nextCohorts: {}, query: parseCatalogQuery(params("age=9&level=intermediate")), onChange: () => {} }));
  check("catalog: the five levels in the select, the intro says one level, Closest fit after the exact match", count(view, '<optgroup label="Exact age">') === 1 && TIERS.every((t) => new RegExp(`<option value="${t.slug}"( selected="")?>${t.name} · ${t.band.replace(/\./g, "\.")}</option>`).test(view)) && view.includes("an age range and one level") && view.includes(">Closest fit</h3>") && view.includes("No group is tagged Intermediate for age 9 yet.") && at(view, 'id="catalog-private-lessons"') < at(view, ">Closest fit</h3>") && view.includes('id="youth-7-10"'));
  check("Closest fit carries the week-one line and the move-or-refund promise, no legal terms", view.includes("Your coach confirms your level on court in week one.") && view.includes("If another group fits you better, we move you to it at the same price.") && !/\b\d+ days?\b|fee|%/.test(view.slice(at(view, ">Closest fit</h3>"), at(view, 'id="youth-7-10"'))));

  const detail = read("src/app/programs/[slug]/page.tsx");
  check("detail page: one LevelTag per group level, the ladder in set mode, no span chip", detail.includes("<LevelTag key={id} level={id} />") && detail.includes("tiers={tags}") && !detail.includes("<TierRangeBadges levelMin={range.min}") && !detail.includes("formatTierSpan(range") && detail.includes("an age range and one level"));
  check("the dashboard and the admin keep cohort bands: TierRangeBadges on cohorts only", read("src/app/dashboard/DashboardView.tsx").includes("<TierRangeBadges levelMin={cohort.levelMin}") && read("src/app/admin/cohorts/AdminCohortsClient.tsx").includes("LEVEL_OPTIONS"));
  const intake = read("src/app/intake/page.tsx");
  check("quiz result: the group line carries no span (the title leads with the level), and counts five", !intake.includes("formatTierSpan(g.") && intake.includes("one of ${TIER_COUNT_WORD} tiers"));

  // ── 4. Every surface counts five ──────────────────────────────────────────
  console.log("Every ladder surface counts five");
  const USER_FACING = ["src/app", "src/components", "src/lib", "src/content"].flatMap(sourceFiles);
  const sevenHits = USER_FACING.flatMap((f) =>
    withoutComments(read(f))
      .split("\n")
      .filter((l) => /\b[Ss]even[- ](tiers?|rung|emblems?)|one of seven|of 7\b|grid-cols-7\b/.test(l))
      .map((l) => `${f}: ${l.trim().slice(0, 90)}`)
  );
  check("no seven-tier copy, 'of 7' or seven-column ladder outside comments", sevenHits.length === 0, sevenHits.join(" | "));
  const topHits = USER_FACING.flatMap((f) =>
    withoutComments(read(f))
      .split("\n")
      .filter((l) => /\b(World Class|Grand Slam)\b/.test(l))
      .map((l) => `${f}: ${l.trim().slice(0, 90)}`)
  );
  check("no World Class or Grand Slam outside comments", topHits.length === 0, topHits.join(" | "));
  const band = read("src/components/sections/TierBand.tsx");
  check("home band: Five tiers. Beginner to High Performance.", band.includes("{COUNT} tiers.") && render(createElement(TierLine, { variant: "ladder", orientation: "horizontal", density: "compact" })).includes("High Performance") && band.includes("TIER_COUNT_WORD"));
  check("/assessment: a five-rung ladder, and the top rung's range explained", read("src/app/assessment/page.tsx").includes("{TIER_COUNT_WORD}-rung ladder") && read("src/app/assessment/page.tsx").includes("runs from 5.0 to 7.0"));
  check("/about, /programs and the booking page read the count from tiers.ts", read("src/app/about/page.tsx").includes("The {TIER_COUNT_WORD} tiers") && read("src/app/programs/page.tsx").includes("TIER_COUNT_WORD") && read("src/app/assessment/book/page.tsx").includes("one of {TIER_COUNT_WORD}"));
  const ghost = read("src/app/dashboard/page.tsx");
  check("the dashboard skeleton draws five rail groups, the last five pips wide", ghost.includes('{ height: "h-[18px]", flex: "flex-[5]", pips: 5 }') && count(ghost, "pips: 2") === 4);
  const gallery = read("src/app/admin/tiers/TierGallery.tsx");
  check("/admin/tiers shows five tiers, a 5.5 rail and the set mode", gallery.includes("Five tiers × four states") && gallery.includes("level={5.5}") && gallery.includes("tiers={[1, 2, 5]}"));

  console.log("Emails and the invite");
  check("tierStandingLine inside High Performance names the next step; 7.0 the top", tierStandingLine("5.5") === "Tier 5 of 5. High Performance runs 5.0–7.0. Next step: 6.0." && tierStandingLine("7.0") === "Tier 5 of 5. That's the top of the ladder.");
  const complete = buildAssessmentCompleteEmail({ name: "Maya Chen", levelLabel: "6.0", coachNote: "—" });
  check("assessment complete at 6.0: High Performance tier, the emblem, ten lit cells", complete.html.includes("You're in the High Performance tier.") && complete.html.includes("/tier-emblem/high-performance") && (complete.html.match(/bgcolor="#E3C46F"/g) ?? []).length === 3 && complete.html.includes(">High Performance</td>"));
  const inviteParams = { participantName: "Alex Kim", levelLabel: "5.0–7.0", tierNames: ["High Performance"], programTitle: "Youth Bootcamps", cohortLabel: "Fall HP", dayTimeLabel: "Saturdays 2–3pm", startDateLabel: "Oct 17", weeks: 6, priceCents: 21000, creditCents: 0, holdHours: 48, enrollUrl: "https://tennisbootcamp.ca/enroll/abc?invite=tok" };
  check("invite subject: Alex's High Performance group (5.0–7.0)", cohortInviteSubject(inviteParams) === "Alex's High Performance group (5.0–7.0) is forming — Saturdays 2–3pm, starts Oct 17" && buildCohortInviteEmail(inviteParams).html.includes("/tier-emblem/high-performance"));

  console.log("Briefs, the contract and the test chain");
  const voice = read("ops/briefs/voice.md");
  check("voice.md locks the five names and the level-led titles, and keeps the tier and the group apart", voice.includes("**Beginner, Novice, Intermediate, Advanced, High Performance**") && voice.includes("**Intermediate Adult Bootcamp**") && voice.includes("High Performance, the tier and the group") && voice.includes("never a range"));
  const ds = read("ops/briefs/design-system.md");
  check("design-system.md documents five tiers, the set mode and the LevelTag", ds.includes("| 5 | High Performance | 5.0–7.0 |") && ds.includes("`LevelTag`") && ds.includes("Closest fit") && !ds.includes("| 7 Grand Slam |"));
  const intakeRow = read("src/lib/intakeRow.ts");
  check("/api/intake is untouched: the 29-column builder reads no tier", intakeRow.includes("INTAKE_APPEND_RANGE_ALL") && !/TierId|from "@\/lib\/tiers"/.test(intakeRow));
  const pkg = JSON.parse(read("package.json")) as { scripts: { test: string } };
  check("npm test runs this file", pkg.scripts.test.includes("npx tsx src/scripts/test-five-levels.ts"));

  if (failed > 0) {
    console.log(`\n${failed} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll five-level checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
