// Run from project root: npx tsx src/scripts/test-plates.ts
//
// Pins audit PR F (2026-10-09, "Program data model and Court Plates"):
// the structured program fields (M37) and the owner's decided level spans,
// and the code-drawn Court Plates that replaced the retired PNGs (H1). The
// physics checks keep every plate honest: every flight clears the net, every
// ball lands in the court, in every cohort variant. Exits non-zero on any
// failure.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  PRICE_SUMMARY,
  PRIVATE_LESSONS_PRICE,
  groupById,
  groupsForProgram,
  listedPrograms,
  programs,
} from "../content/programs";
import {
  AGE_BANDS,
  AGE_BAND_DISPLAY_ORDER,
  AGE_BAND_LABELS,
  ageBandsLabel,
  audienceLabel,
  isAgeBand,
} from "../lib/ageBand";
import { LEVEL_STEPS, tierById, tierForLevel, type TierId } from "../lib/tiers";
import { slotLevelRange } from "../lib/programCatalog";
import {
  COURT,
  anchorPoints,
  flightsOf,
  insideDoublesCourt,
  plateShapes,
  plateSvgString,
  project,
} from "../lib/plates/geometry";
import { PLATE_IDS, PLATE_SPECS, MARK_SPECS, isPlateId, plateSpec } from "../lib/plates/specs";
import { PLATE_FRAMES, PLATE_SAFE_AREA, type PlateFrame } from "../lib/plates/tokens";
import {
  artFocusForCohort,
  fnv1a32,
  plateVariant,
  resolvePlateSpec,
  type PlateVariant,
} from "../lib/plates/variant";
import { ProgramPlate } from "../components/plates/ProgramPlate";
import { PlateMark } from "../components/plates/PlateMark";
import { AgeBandChips } from "../components/programs/AgeBandChips";
import { ArtGallery } from "../app/admin/art/ArtGallery";

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
const onGrid = (n: number) => Number.isFinite(n) && n >= 1 && n <= 7 && Math.round(n * 2) === n * 2;

// ── Program data model (M37) ────────────────────────────────────────────────
console.log("Program data model (M37)");
for (const p of programs) {
  check(`${p.id}: plate is in the registry`, isPlateId(p.plate), String(p.plate));
  check(`${p.id}: plateAlt is set`, p.plateAlt.length > 0);
  check(`${p.id}: no imageSrc key`, !("imageSrc" in p));
  check(`${p.id}: ageBands set and valid`, p.ageBands.length > 0 && p.ageBands.every(isAgeBand));
  check(`${p.id}: ageBands in display order, no repeats`, p.ageBands.join() === AGE_BAND_DISPLAY_ORDER.filter((b) => p.ageBands.includes(b)).join());
  check(`${p.id}: ageGroup is derived from ageBands`, p.ageGroup === ageBandsLabel(p.ageBands), `${p.ageGroup}`);
  const hasMin = p.levelMin !== undefined;
  const hasMax = p.levelMax !== undefined;
  check(`${p.id}: level span is both bounds or neither`, hasMin === hasMax);
  if (hasMin && hasMax) {
    check(`${p.id}: span on the half-step grid, 1.0 ≤ min ≤ max ≤ 7.0`, onGrid(p.levelMin!) && onGrid(p.levelMax!) && p.levelMin! <= p.levelMax!, `${p.levelMin}–${p.levelMax}`);
  }
  const slots = p.timetable ?? [];
  const tagged = slots.filter((s) => s.level !== undefined);
  check(`${p.id}: slots all carry a level tag or none`, tagged.length === 0 || tagged.length === slots.length);
  if (tagged.length > 0 && tagged.length === slots.length) {
    // One level tag per group (owner, 2026-10-13). Groups split by level
    // alone (Adult Bootcamps: one age range) climb strictly, one distinct
    // tier each; groups split by age first (Youth Bootcamps) climb too, and
    // their tags together span the program.
    const groups = groupsForProgram(p.slug);
    const oneAgeRange = new Set(groups.map((g) => `${g.ageMin}-${g.ageMax}`)).size === 1;
    const levels = slots.map((s) => s.level as number);
    check(`${p.id}: every slot tag is a tier id, in ascending order`, levels.every((l) => Number.isInteger(l) && l >= 1 && l <= 5) && levels.every((l, i) => i === 0 || l > levels[i - 1]));
    if (oneAgeRange) check(`${p.id}: one distinct tier per slot (one age range)`, new Set(levels).size === levels.length);
    const bands = slots.map((s) => slotLevelRange(s)!);
    check(`${p.id}: the tags' bands together cover the program span`, Math.min(...bands.map((b) => b.min)) === p.levelMin && Math.max(...bands.map((b) => b.max)) === p.levelMax);
    check(`${p.id}: every tag's band is its tier's`, slots.every((s) => slotLevelRange(s)?.min === tierById(s.level as TierId).levelMin && slotLevelRange(s)?.max === tierById(s.level as TierId).levelMax));
  }
}
for (const p of listedPrograms) {
  check(`${p.id}: levelNote set`, !!p.levelNote);
  check(`${p.id}: priceSummary from the constants`, p.priceSummary === (p.timetable?.length ? PRICE_SUMMARY : PRIVATE_LESSONS_PRICE), p.priceSummary);
  if (p.timetable?.length) check(`${p.id}: enrollmentStatus set (owner D11)`, p.enrollmentStatus === "forming");
}
const listedPlates = listedPrograms.map((p) => p.plate).filter((id) => id !== "court");
check("listed programs never share a plate", new Set(listedPlates).size === listedPlates.length);
check("PRICE_SUMMARY is one line from the constants", /^\$\d+ a session · \$\d+ for \w+ weeks?$/.test(PRICE_SUMMARY), PRICE_SUMMARY);

// Owner lineup 2026-10-13 (one level tag per group): the spans are the union
// of the groups' tier bands, pinned here so a drift shows.
console.log("Level tags and spans (owner lineup, 2026-10-13)");
const byId = Object.fromEntries(programs.map((p) => [p.id, p]));
check("Youth Bootcamps spans 1.0–7.0 (Beginner, Novice and High Performance tags)", byId["youth-programs"].levelMin === 1.0 && byId["youth-programs"].levelMax === 7.0);
check("High Performance group is tagged High Performance (5.0–7.0)", groupById("high-performance")?.level === 5 && tierById(5).levelMin === 5 && tierById(5).levelMax === 7);
check("the quiz map still sends competitive → Intermediate, and the recommender puts High Performance first by approval (D4, 2026-10-13)", tierForLevel(3)?.name === "Intermediate" && groupById("high-performance")?.joining === "approval");
check("Adult Bootcamps spans 1.0–4.5 (Beginner, Intermediate and Advanced tags)", byId["bootcamps"].levelMin === 1.0 && byId["bootcamps"].levelMax === 4.5);
check("Adult 4:00 Beginner, 5:00 Intermediate, 6:00 Advanced", byId["bootcamps"].timetable?.map((s) => s.level).join("|") === "1|3|4");
check("Youth 12:00 Beginner, 1:00 Novice, 2:00 High Performance", byId["youth-programs"].timetable?.map((s) => s.level).join("|") === "1|2|5");
check("Private Lessons all levels 1.0–7.0", byId["private-lessons"].levelMin === 1.0 && byId["private-lessons"].levelMax === 7.0 && groupById("private-lessons")?.level === null);
check("Private Lessons is any age", ageBandsLabel(byId["private-lessons"].ageBands) === "Any age");
// The recommender and the structured data match these strings; keep them.
check("slot group strings are the level-led group names", byId["bootcamps"].timetable?.map((s) => s.group).join("|") === "Beginner Adult Bootcamp|Intermediate Adult Bootcamp|Advanced Adult Bootcamp" && byId["youth-programs"].timetable?.map((s) => s.group).join("|") === "Beginner Junior Bootcamp|Novice Youth Bootcamp|High Performance Youth Bootcamp");
check("the retired High Performance entry is unlisted and keeps its plate", byId["high-performance"].unlisted === true && byId["high-performance"].plate === "high-performance");

// ── Age band helpers ────────────────────────────────────────────────────────
console.log("Age band helpers");
check("AGE_BAND_LABELS byte-identical", AGE_BAND_LABELS.adult === "Adult (18+)" && AGE_BAND_LABELS.teen === "Teen (14–17)" && AGE_BAND_LABELS.junior === "Junior (7–13)");
check("AGE_BANDS unchanged", AGE_BANDS.join() === "adult,teen,junior");
check("ageBandsLabel: juniors and teens", ageBandsLabel(["junior", "teen"]) === "Junior (7–13) · Teen (14–17)");
check("ageBandsLabel: order is fixed", ageBandsLabel(["teen", "junior"]) === "Junior (7–13) · Teen (14–17)");
check("ageBandsLabel: adults", ageBandsLabel(["adult"]) === "Adult (18+)");
check("ageBandsLabel: any age", ageBandsLabel(["adult", "junior", "teen"]) === "Any age");
check("ageBandsLabel: none", ageBandsLabel([]) === "");
check("audienceLabel: juniors and teens", audienceLabel(["junior", "teen"]) === "Juniors and teens");
check("audienceLabel: adults", audienceLabel(["adult"]) === "Adults");
check("audienceLabel: any age", audienceLabel(["junior", "teen", "adult"]) === "Any age");
check("audienceLabel: none", audienceLabel([]) === "");
check("ageBand.ts comment no longer names Group Lessons or Bootcamps 14+", !/Group Lessons|Bootcamps \(Ages 14\+\)/.test(read("src/lib/ageBand.ts")));

// ── Projection pins ─────────────────────────────────────────────────────────
console.log("Court Plates: camera");
const L = COURT.halfLength;
const DW = COURT.halfDoubles;
const corners: [number, number][] = [project(-L, -DW), project(L, -DW), project(L, DW), project(-L, DW)].map((p) => [p[0], p[1]]);
const PINNED = [[70, 765], [1539, 523], [1241, 259], [114, 397]];
PINNED.forEach(([x, y], i) => {
  check(`doubles corner ${i + 1} at (${x}, ${y}) ±1`, Math.abs(corners[i][0] - x) <= 1 && Math.abs(corners[i][1] - y) <= 1, `${corners[i].map(Math.round)}`);
});
check("ad side mirrors v, never u", project(3, 2, 0, "ad")[0] !== project(-3, 2, 0, "deuce")[0] && Math.abs(project(3, 2, 0, "ad")[0] - project(3, -2, 0, "deuce")[0]) < 1e-9);

// ── Compositions ────────────────────────────────────────────────────────────
console.log("Court Plates: compositions");
for (const id of PLATE_IDS) {
  const spec = PLATE_SPECS[id];
  check(`${id}: spec id matches its key`, spec.id === id);
  check(`${id}: has a mark`, !!MARK_SPECS[id]);
  check(`${id}: at most 4 traces, 1 zone, 2 markers`, spec.traces.length <= 4 && (spec.markers?.length ?? 0) <= 2);
  const signatures = spec.traces.filter((t) => t.role === "signature");
  check(`${id}: exactly one signature trace`, signatures.length === 1);
  check(`${id}: the signature travels left to right`, signatures.every((t) => t.to[0] > t.from[0]));
  check(`${id}: cites the program copy`, spec.copy.length > 0);
}
check("every program's plate resolves", programs.every((p) => plateSpec(p.plate).id === p.plate));
check("an unknown id falls back to court", plateSpec("nope").id === "court" && plateSpec(undefined).id === "court");

// ── Physics: every variant, both sides ──────────────────────────────────────
console.log("Court Plates: physics and safe area");
type Case = { label: string; id: (typeof PLATE_IDS)[number]; variant: PlateVariant };
const cases: Case[] = [];
for (const id of PLATE_IDS) {
  for (const side of ["deuce", "ad"] as const) {
    cases.push({ label: `${id} base ${side}`, id, variant: { side, profileTier: null, profileLevel: null, emphasis: null } });
    for (const level of LEVEL_STEPS) {
      cases.push({ label: `${id} level ${level} ${side}`, id, variant: plateVariant({ plate: id, levelMin: level, levelMax: Math.min(7, level + 0.5), seed: side === "ad" ? "b" : null }) });
    }
    if (id === "bootcamps") {
      for (const focus of [0, 1, 2]) {
        cases.push({ label: `${id} focus ${focus} ${side}`, id, variant: { side, profileTier: null, profileLevel: null, emphasis: focus } });
      }
    }
  }
}
const physicsFailures: string[] = [];
const safeFailures: string[] = [];
for (const c of cases) {
  const spec = resolvePlateSpec(c.id, c.variant);
  for (const [i, fl] of flightsOf(spec).entries()) {
    if (fl.clearance === null || fl.clearance < 0.3) physicsFailures.push(`${c.label} trace ${i}: clearance ${fl.clearance?.toFixed(2) ?? "none"}`);
    if (!insideDoublesCourt(fl.landing)) physicsFailures.push(`${c.label} trace ${i}: lands at ${fl.landing}`);
  }
  for (const [x, y] of anchorPoints(spec, c.variant.side)) {
    if (x < PLATE_SAFE_AREA.x0 || x > PLATE_SAFE_AREA.x1 || y < PLATE_SAFE_AREA.y0 || y > PLATE_SAFE_AREA.y1) {
      safeFailures.push(`${c.label}: (${Math.round(x)}, ${Math.round(y)})`);
    }
  }
}
check(`every flight clears the net by 0.3 m and lands in the doubles court (${cases.length} variants)`, physicsFailures.length === 0, `\n      ${physicsFailures.join("\n      ")}`);
check("markers, bounces and zone vertices stay in the safe area", safeFailures.length === 0, `\n      ${safeFailures.join("\n      ")}`);
check("bootcamps focus 1 lights the intermediate flight", resolvePlateSpec("bootcamps", { side: "deuce", profileTier: null, profileLevel: null, emphasis: 1 }).traces[1].role === "signature");
check("bootcamps focus keeps exactly one signature", [0, 1, 2].every((f) => resolvePlateSpec("bootcamps", { side: "deuce", profileTier: null, profileLevel: null, emphasis: f }).traces.filter((t) => t.role === "signature").length === 1));
const youthLow = resolvePlateSpec("youth-programs", { side: "deuce", profileTier: 1, profileLevel: 1, emphasis: null }).traces.find((t) => t.role === "signature")!;
const youthMid = resolvePlateSpec("youth-programs", { side: "deuce", profileTier: 5, profileLevel: 5.5, emphasis: null }).traces.find((t) => t.role === "signature")!;
const youthHigh = resolvePlateSpec("youth-programs", { side: "deuce", profileTier: 5, profileLevel: 7, emphasis: null }).traces.find((t) => t.role === "signature")!;
check("youth profile: a higher level lands deeper and flies flatter, inside High Performance too", youthHigh.to[0] > youthMid.to[0] && youthMid.to[0] > youthLow.to[0] && youthHigh.apex < youthMid.apex && youthMid.apex < youthLow.apex);
check("kids plate has no profile", resolvePlateSpec("kids-summer-camp", { side: "deuce", profileTier: 5, profileLevel: 7, emphasis: null }) === PLATE_SPECS["kids-summer-camp"]);

// ── Markup ──────────────────────────────────────────────────────────────────
console.log("Court Plates: markup");
const FORBIDDEN = ["<text", "<image", ' id="', "gradient", "<defs", "<clipPath", "clip-path=", "<mask", "<filter", "<use", "href="];
const FRAMES: PlateFrame[] = ["master", "band", "strip"];
const markupFailures: string[] = [];
for (const id of PLATE_IDS) {
  for (const frame of FRAMES) {
    const a = plateSvgString(PLATE_SPECS[id], frame, { density: "compact" });
    const b = plateSvgString(PLATE_SPECS[id], frame, { density: "compact" });
    if (a !== b) markupFailures.push(`${id} ${frame}: not deterministic`);
    if (Buffer.byteLength(a) > 10 * 1024) markupFailures.push(`${id} ${frame}: ${Buffer.byteLength(a)} bytes`);
    for (const f of FORBIDDEN) if (a.includes(f)) markupFailures.push(`${id} ${frame}: contains ${f}`);
    if (!a.includes(`viewBox="${PLATE_FRAMES[frame].viewBox}"`)) markupFailures.push(`${id} ${frame}: wrong viewBox`);
    if (!a.includes('vector-effect="non-scaling-stroke"')) markupFailures.push(`${id} ${frame}: compact needs vector-effect`);
  }
  const fixed = plateSvgString(PLATE_SPECS[id], "strip", { density: "fixed", renderWidth: 1200, width: 1200, height: 380 });
  if (fixed.includes("vector-effect")) markupFailures.push(`${id} fixed: must not use vector-effect`);
  if (!fixed.includes('width="1200" height="380"')) markupFailures.push(`${id} fixed: needs its own size`);
}
check("plate strings: deterministic, ≤10 KB, no text, image, id, gradient, defs, clip, mask or filter", markupFailures.length === 0, `\n      ${markupFailures.join("\n      ")}`);
check("fixed density scales strokes into viewBox units", plateShapes(PLATE_SPECS.court, { density: "fixed", scale: 1.5 }).find((s) => s.layer === "trace")?.width === 2.75 * 1.5);
check("every shape has an attribute colour, never a class", plateShapes(PLATE_SPECS["youth-programs"], { density: "hero" }).every((s) => s.fill !== undefined));
check("coming soon dashes the traces and empties the bounces", plateShapes(PLATE_SPECS.court, { density: "compact", comingSoon: true }).some((s) => s.layer === "trace" && s.dash?.join(" ") === "10 7") && plateShapes(PLATE_SPECS.court, { density: "compact", comingSoon: true }).every((s) => s.layer !== "bounce" || s.fill === "none"));

const decorative = renderToStaticMarkup(createElement(ProgramPlate, { plate: "youth-programs", frame: "band", density: "compact" }));
const labelled = renderToStaticMarkup(createElement(ProgramPlate, { plate: "bootcamps", frame: "master", density: "hero", label: "Court diagram: three ball flights.", animate: true }));
check("ProgramPlate without a label is aria-hidden", decorative.includes('aria-hidden="true"') && !decorative.includes("role="));
check("ProgramPlate with a label is role=img", labelled.includes('role="img"') && labelled.includes('aria-label="Court diagram: three ball flights."') && !labelled.includes("aria-hidden"));
check("ProgramPlate renders a slice-cropped SVG", decorative.includes('preserveAspectRatio="xMidYMid slice"') && decorative.includes('viewBox="0 100 1600 800"'));
check("ProgramPlate markup carries no text or id", FORBIDDEN.filter((f) => f !== "clip-path=").every((f) => !decorative.includes(f) && !labelled.includes(f)));
check("animate wipes the traces and pops the marks, motion-safe only", labelled.includes("motion-safe:animate-plate-wipe") && labelled.includes("motion-safe:animate-plate-pop") && !decorative.includes("animate-plate"));
check("the decorative plate is not focusable", decorative.includes('focusable="false"'));
const unknown = renderToStaticMarkup(createElement(ProgramPlate, { plate: "retired-thing", frame: "strip", density: "compact" }));
check("an unknown plate id renders the court", unknown.length > 1000 && unknown.includes('viewBox="-100 215 1800 600"'));
check("ProgramPlate is deterministic", decorative === renderToStaticMarkup(createElement(ProgramPlate, { plate: "youth-programs", frame: "band", density: "compact" })));
// The dashed state comes from the caller's flag alone (PR #83 fix round 1):
// a spec never forces it, so every surface goes solid together when the
// program's `comingSoon` flips in programs.ts.
const COMING_SOON_ATTR = 'stroke-dasharray="10 7"';
check("no PlateSpec carries a comingSoon of its own", Object.values(PLATE_SPECS).every((s) => !("comingSoon" in s)));
const kidsOpen = renderToStaticMarkup(createElement(ProgramPlate, { plate: "kids-summer-camp", frame: "band", density: "compact" }));
const kidsSoon = renderToStaticMarkup(createElement(ProgramPlate, { plate: "kids-summer-camp", frame: "band", density: "compact", comingSoon: true }));
check("the Kids plate is solid without the flag", !kidsOpen.includes(COMING_SOON_ATTR));
check("the Kids plate is dashed with the flag", kidsSoon.includes(COMING_SOON_ATTR));
check("the flag changes nothing but the dash and the bounce fill", kidsOpen.length !== kidsSoon.length && kidsOpen.replace(/<\/?path[^>]*>/g, "") === kidsSoon.replace(/<\/?path[^>]*>/g, ""));
const mark = renderToStaticMarkup(createElement(PlateMark, { plate: "high-performance", size: 48 }));
check("PlateMark is decorative, 96-unit box, ≤2 KB", mark.includes('aria-hidden="true"') && mark.includes('viewBox="0 0 96 96"') && Buffer.byteLength(mark) <= 2048, String(Buffer.byteLength(mark)));
check("PlateMark falls back to court", renderToStaticMarkup(createElement(PlateMark, { plate: "whatever" })) === renderToStaticMarkup(createElement(PlateMark, { plate: "court" })));
const markFocus = renderToStaticMarkup(createElement(PlateMark, { plate: "bootcamps", focusSlot: 0 }));
check("PlateMark focus changes the Adult mark", markFocus !== renderToStaticMarkup(createElement(PlateMark, { plate: "bootcamps" })));
const chipsYouth = renderToStaticMarkup(createElement(AgeBandChips, { bands: ["teen", "junior"] }));
const chipsAny = renderToStaticMarkup(createElement(AgeBandChips, { bands: ["junior", "teen", "adult"] }));
check("AgeBandChips: one chip per band in display order", chipsYouth.indexOf("Junior (7–13)") < chipsYouth.indexOf("Teen (14–17)") && (chipsYouth.match(/<li/g) ?? []).length === 2);
check("AgeBandChips: all three bands read Any age", chipsAny.includes("Any age") && !chipsAny.includes("Adult (18+)"));
check("AgeBandChips: the glyph is decorative", chipsYouth.includes('aria-hidden="true"') && chipsYouth.includes("<svg"));
check("AgeBandChips: none renders nothing", renderToStaticMarkup(createElement(AgeBandChips, { bands: [] })) === "");

// ── Variants ────────────────────────────────────────────────────────────────
console.log("Court Plates: variants");
check("fnv1a32 test vectors", fnv1a32("") === 0x811c9dc5 && fnv1a32("a") === 0xe40c292c);
check("side is deterministic per seed", plateVariant({ plate: "court", seed: "cohort-1" }).side === plateVariant({ plate: "court", seed: "cohort-1" }).side);
check("no seed is the deuce side", plateVariant({ plate: "court" }).side === "deuce");
check("some seed lands on the ad side", ["a", "b", "c", "d", "e", "f"].some((s) => plateVariant({ plate: "court", seed: s }).side === "ad"));
check("profile tier and level come from the band's min", plateVariant({ plate: "youth-programs", levelMin: "3.5", levelMax: 4.5 }).profileTier === 3 && plateVariant({ plate: "youth-programs", levelMin: "3.5", levelMax: 4.5 }).profileLevel === 3.5);
check("profile tier falls back to max; 6.0 is High Performance at level 6.0", plateVariant({ plate: "youth-programs", levelMin: null, levelMax: 6 }).profileTier === 5 && plateVariant({ plate: "youth-programs", levelMin: null, levelMax: 6 }).profileLevel === 6);
check("no band, no profile", plateVariant({ plate: "youth-programs", levelMin: null, levelMax: null }).profileTier === null && plateVariant({ plate: "youth-programs", levelMin: null, levelMax: null }).profileLevel === null);
check("bootcamps emphasis by tier: ≤2 Beginner, 3 Intermediate, ≥4 Advanced", plateVariant({ plate: "bootcamps", levelMin: 2 }).emphasis === 0 && plateVariant({ plate: "bootcamps", levelMin: 3 }).emphasis === 1 && plateVariant({ plate: "bootcamps", levelMin: 4.5 }).emphasis === 2);
check("focusSlot wins over the tier", plateVariant({ plate: "bootcamps", levelMin: 5, focusSlot: 0 }).emphasis === 0);
check("emphasis is bootcamps only", plateVariant({ plate: "youth-programs", focusSlot: 1 }).emphasis === null);

const adult = byId["bootcamps"];
const youth = byId["youth-programs"];
const cohort = (day: "Sat" | "Sun", start: string) => ({ sessions: [{ day, start, end: "19:00" }] });
check("artFocusForCohort: Sun 16:00 → 0", artFocusForCohort(adult, cohort("Sun", "16:00")) === 0);
check("artFocusForCohort: Sun 17:00 → 1", artFocusForCohort(adult, cohort("Sun", "17:00")) === 1);
check("artFocusForCohort: Sun 18:00 → 2", artFocusForCohort(adult, cohort("Sun", "18:00")) === 2);
check("artFocusForCohort: Sat → null", artFocusForCohort(adult, cohort("Sat", "16:00")) === null);
check("artFocusForCohort: no match → null", artFocusForCohort(adult, cohort("Sun", "19:00")) === null);
check("artFocusForCohort: not bootcamps → null", artFocusForCohort(youth, cohort("Sat", "12:00")) === null);
check("artFocusForCohort: no sessions → null", artFocusForCohort(adult, { sessions: [] }) === null);

// ── Surfaces and the retired files ──────────────────────────────────────────
console.log("Surfaces");
// Owner, 2026-10-12: photographs of people replaced the plates on the cards
// and the page hero; the plates stay on the dashboard strip, the admin marks
// and the OG card.
const detail = read("src/app/programs/[slug]/page.tsx");
check("detail page hero is the program's photo, 16:10, in a figure, no plate", detail.includes('from "next/image"') && detail.includes("aspect-[16/10]") && detail.includes("<figure") && !detail.includes("<ProgramPlate"));
const card = read("src/components/sections/ProgramCard.tsx");
check("program card draws the photo through next/image, 16:10, no plate", card.includes('from "next/image"') && card.includes("aspect-[16/10]") && !card.includes("<ProgramPlate"));
check("program card draws nothing over the photo but the chip", !card.includes("bg-gradient-to-t"));
const og = read("src/app/programs/[slug]/opengraph-image.tsx");
check("OG card embeds the strip plate at fixed density with a fallback", og.includes('"strip"') && og.includes('density: "fixed"') && og.includes("catch"));
check("the OG card passes the program's comingSoon flag", og.includes("!!program.comingSoon"));
check("the dashboard strip, the enroll summary and the admin preview keep the plate", ["src/app/dashboard/DashboardView.tsx", "src/app/enroll/[cohortId]/EnrollWizard.tsx", "src/components/admin/PlayerPreview.tsx"].every((f) => read(f).includes("<ProgramPlate")));
const galleryFile = read("src/app/admin/art/ArtGallery.tsx");
check("the admin gallery draws each plate in the program's own state", galleryFile.includes("comingSoon={programOf(id)?.comingSoon}"));
// PR #83 fix round 2: the retired Group Lessons entry is unlisted and still
// points at "court", so the gallery's lookup must skip unlisted programs or
// the fallback row inherits that program's title and its coming-soon dashes.
check("the admin gallery looks a plate's program up among listed programs only", galleryFile.includes("p.plate === id && !p.unlisted"));
const gallery = renderToStaticMarkup(createElement(ArtGallery));
const platesSection = gallery.slice(gallery.indexOf('aria-labelledby="plates"'), gallery.indexOf('aria-labelledby="hero"'));
// Private Lessons has no plate of its own and sits on "court" (2026-10-12), so
// the court row carries that listed title; it would read as the fallback only
// if no listed program used it.
check("the gallery's court row is titled by the listed program on it, else as the fallback", platesSection.includes("Private Lessons") || platesSection.includes("Fallback (any new program)"));
check("the retired High Performance plate is titled by its own name", platesSection.includes("Retired plate:"));
check("no retired program is named anywhere in the gallery", !gallery.includes("Group Lessons"));
const dashedPlates = platesSection.split("<svg").slice(1).filter((s) => s.includes(COMING_SOON_ATTR)).length;
const expectedDashed = listedPrograms.filter((p) => p.comingSoon).length * FRAMES.length;
check(`in "Every plate, every frame" only listed coming-soon programs draw dashed (${expectedDashed} plates)`, dashedPlates === expectedDashed, `${dashedPlates} dashed`);
check("the admin home links to the art gallery", read("src/app/admin/page.tsx").includes('href: "/admin/art"'));
const tw = read("tailwind.config.js");
check("tailwind has the plate keyframes", tw.includes('"plate-wipe"') && tw.includes('"plate-pop"') && tw.includes("backwards"));
check("the admin gallery is gated and noindex", read("src/app/admin/art/page.tsx").includes("getAdminUser()") && read("src/app/admin/art/page.tsx").includes("index: false"));
for (const file of ["kids-summer-camp.png", "bootcamps.png", "group-lessons.png"]) {
  check(`public/images/programs/${file} is gone`, !existsSync(join(ROOT, "public", "images", "programs", file)));
}
check("design-system.md documents the Court Plates", read("ops/briefs/design-system.md").includes("## Court Plates"));

if (failed > 0) {
  console.log(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll plate checks passed.");
