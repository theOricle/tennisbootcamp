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
  CAMP_PRICE_SUMMARY,
  PRICE_SUMMARY,
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
import { tierForLevel } from "../lib/tiers";
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
  const banded = slots.filter((s) => s.levelMin !== undefined || s.levelMax !== undefined);
  check(`${p.id}: slots are all banded or none`, banded.length === 0 || banded.length === slots.length);
  if (banded.length > 0 && banded.length === slots.length) {
    let ok = true;
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      if (s.levelMin === undefined || s.levelMax === undefined || !onGrid(s.levelMin) || !onGrid(s.levelMax) || s.levelMin > s.levelMax) ok = false;
      if (i > 0 && s.levelMin !== slots[i - 1].levelMax! + 0.5) ok = false;
    }
    check(`${p.id}: slot bands are contiguous, ascending and non-overlapping`, ok);
    check(`${p.id}: slot bands together cover the program span`, slots[0].levelMin === p.levelMin && slots[slots.length - 1].levelMax === p.levelMax);
    check(`${p.id}: slot bands are whole tiers (x.0–y.5)`, slots.every((s) => Number.isInteger(s.levelMin!) && s.levelMax! % 1 === 0.5));
  }
  for (const s of slots) {
    if (s.ageBand) check(`${p.id}: slot ${s.time} ageBand within the program's bands`, p.ageBands.includes(s.ageBand));
  }
}
for (const p of listedPrograms) {
  check(`${p.id}: levelNote set`, !!p.levelNote);
  check(`${p.id}: priceSummary from the constants`, p.priceSummary === (p.comingSoon ? CAMP_PRICE_SUMMARY : PRICE_SUMMARY), p.priceSummary);
  if (!p.comingSoon) check(`${p.id}: enrollmentStatus set (owner D11)`, p.enrollmentStatus === "forming");
}
const listedPlates = listedPrograms.map((p) => p.plate).filter((id) => id !== "court");
check("listed programs never share a plate", new Set(listedPlates).size === listedPlates.length);
check("PRICE_SUMMARY is one line from the constants", /^\$\d+ a session · \$\d+ for \w+ weeks?$/.test(PRICE_SUMMARY), PRICE_SUMMARY);

// Owner decision 2026-10-09 (D2/D3), shipped visible: pinned so a drift shows.
console.log("Level spans (owner D2/D3, 2026-10-09)");
const byId = Object.fromEntries(programs.map((p) => [p.id, p]));
check("Youth Programs 1.0–4.5 (Love – Break)", byId["youth-programs"].levelMin === 1.0 && byId["youth-programs"].levelMax === 4.5);
check("High Performance 3.0–7.0 (Deuce and up)", byId["high-performance"].levelMin === 3.0 && byId["high-performance"].levelMax === 7.0);
check("High Performance floor is Deuce, matching the quiz map competitive → Deuce (D4)", tierForLevel(byId["high-performance"].levelMin)?.name === "Deuce");
check("Adult Bootcamps 1.0–5.5 (Love – Ace)", byId["bootcamps"].levelMin === 1.0 && byId["bootcamps"].levelMax === 5.5);
check("Adult 4:00 Love – Rally", byId["bootcamps"].timetable?.[0].levelMin === 1.0 && byId["bootcamps"].timetable?.[0].levelMax === 2.5);
check("Adult 5:00 Deuce", byId["bootcamps"].timetable?.[1].levelMin === 3.0 && byId["bootcamps"].timetable?.[1].levelMax === 3.5);
check("Adult 6:00 Break – Ace", byId["bootcamps"].timetable?.[2].levelMin === 4.0 && byId["bootcamps"].timetable?.[2].levelMax === 5.5);
check("Kids' Summer Camp all levels 1.0–7.0", byId["kids-summer-camp"].levelMin === 1.0 && byId["kids-summer-camp"].levelMax === 7.0);
check("Youth slots carry their age band", byId["youth-programs"].timetable?.[0].ageBand === "junior" && byId["youth-programs"].timetable?.[1].ageBand === "teen");
check("High Performance is any age", ageBandsLabel(byId["high-performance"].ageBands) === "Any age");
check("camp CTA goes to the notify form", byId["kids-summer-camp"].ctaHref === "/programs/kids-summer-camp#notify");
// The recommender and the structured data match these strings; keep them.
check("slot group strings unchanged", byId["bootcamps"].timetable?.map((s) => s.group).join("|") === "Newer players|Intermediate|Advanced" && byId["youth-programs"].timetable?.map((s) => s.group).join("|") === `${AGE_BAND_LABELS.junior}|${AGE_BAND_LABELS.teen}`);

// Owner D10 (only confirmed facts; PR #83 fix round 1): the camp page says
// what each day covers will be posted later, so no camp field may describe
// how the camp runs. The figcaption renders only when plateCaption is set.
console.log("Kids' Summer Camp states only confirmed facts (owner D10)");
check("camp has no plateCaption", byId["kids-summer-camp"].plateCaption === undefined, String(byId["kids-summer-camp"].plateCaption));
check("camp levelNote is the level range alone", byId["kids-summer-camp"].levelNote === "First time on court to a few years in", byId["kids-summer-camp"].levelNote);
check("camp plateAlt describes the drawing, not the camp", byId["kids-summer-camp"].plateAlt.startsWith("Court diagram:"));

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
    cases.push({ label: `${id} base ${side}`, id, variant: { side, profileTier: null, emphasis: null } });
    for (let tier = 1; tier <= 7; tier++) {
      cases.push({ label: `${id} tier ${tier} ${side}`, id, variant: plateVariant({ plate: id, levelMin: tier, levelMax: tier + 0.5, seed: side === "ad" ? "b" : null }) });
    }
    if (id === "bootcamps") {
      for (const focus of [0, 1, 2]) {
        cases.push({ label: `${id} focus ${focus} ${side}`, id, variant: { side, profileTier: null, emphasis: focus } });
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
check("bootcamps focus 1 lights the intermediate flight", resolvePlateSpec("bootcamps", { side: "deuce", profileTier: null, emphasis: 1 }).traces[1].role === "signature");
check("bootcamps focus keeps exactly one signature", [0, 1, 2].every((f) => resolvePlateSpec("bootcamps", { side: "deuce", profileTier: null, emphasis: f }).traces.filter((t) => t.role === "signature").length === 1));
const youthLow = resolvePlateSpec("youth-programs", { side: "deuce", profileTier: 1, emphasis: null }).traces.find((t) => t.role === "signature")!;
const youthHigh = resolvePlateSpec("youth-programs", { side: "deuce", profileTier: 7, emphasis: null }).traces.find((t) => t.role === "signature")!;
check("youth profile: a higher tier lands deeper and flies flatter", youthHigh.to[0] > youthLow.to[0] && youthHigh.apex < youthLow.apex);
check("kids plate has no profile", resolvePlateSpec("kids-summer-camp", { side: "deuce", profileTier: 7, emphasis: null }) === PLATE_SPECS["kids-summer-camp"]);

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
check("profile tier comes from the band's min", plateVariant({ plate: "youth-programs", levelMin: "3.5", levelMax: 4.5 }).profileTier === 3);
check("profile tier falls back to max", plateVariant({ plate: "youth-programs", levelMin: null, levelMax: 5 }).profileTier === 5);
check("no band, no profile", plateVariant({ plate: "youth-programs", levelMin: null, levelMax: null }).profileTier === null);
check("bootcamps emphasis by tier: ≤2 newer, 3 intermediate, ≥4 advanced", plateVariant({ plate: "bootcamps", levelMin: 2 }).emphasis === 0 && plateVariant({ plate: "bootcamps", levelMin: 3 }).emphasis === 1 && plateVariant({ plate: "bootcamps", levelMin: 4.5 }).emphasis === 2);
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
const detail = read("src/app/programs/[slug]/page.tsx");
check("detail page draws the plate hero with its alt and the one-shot animation", /<ProgramPlate[\s\S]*?frame="master"[\s\S]*?density="hero"[\s\S]*?label=\{program\.plateAlt\}[\s\S]*?animate/.test(detail));
check("detail page hero is 16:10 in a figure with the caption", detail.includes("aspect-[16/10]") && detail.includes("<figcaption") && detail.includes("program.plateCaption"));
check("detail page no longer imports next/image", !detail.includes('from "next/image"'));
const card = read("src/components/sections/ProgramCard.tsx");
check("program card draws the band plate, decorative, 2:1", card.includes('frame="band"') && card.includes("aspect-[2/1]") && !card.includes("next/image"));
check("program card draws nothing over the plate", !card.includes("bg-gradient-to-t"));
const og = read("src/app/programs/[slug]/opengraph-image.tsx");
check("OG card embeds the strip plate at fixed density with a fallback", og.includes('"strip"') && og.includes('density: "fixed"') && og.includes("catch"));
check("card, detail hero and OG card all pass the program's comingSoon flag", card.includes("comingSoon={p.comingSoon}") && detail.includes("comingSoon={program.comingSoon}") && og.includes("!!program.comingSoon"));
const galleryFile = read("src/app/admin/art/ArtGallery.tsx");
check("the admin gallery draws each plate in the program's own state", galleryFile.includes("comingSoon={programOf(id)?.comingSoon}"));
// PR #83 fix round 2: the retired Group Lessons entry is unlisted and still
// points at "court", so the gallery's lookup must skip unlisted programs or
// the fallback row inherits that program's title and its coming-soon dashes.
check("the admin gallery looks a plate's program up among listed programs only", galleryFile.includes("p.plate === id && !p.unlisted"));
const gallery = renderToStaticMarkup(createElement(ArtGallery));
const platesSection = gallery.slice(gallery.indexOf('aria-labelledby="plates"'), gallery.indexOf('aria-labelledby="hero"'));
check("the gallery's court row is titled as the fallback", platesSection.includes("Fallback (any new program)"));
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
