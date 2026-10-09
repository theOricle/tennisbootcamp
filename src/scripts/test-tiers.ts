// Run from project root: npx tsx src/scripts/test-tiers.ts
//
// Pins audit PR E (2026-10-09, "Tier system"): the tier helpers
// (tierForLevel across every step, tierProgress captions, formatTierSpan,
// LEVEL_OPTIONS), the colour ramp (every tier colour at least 4.5:1 on the
// navy and on a card, navy on gold, seven distinct colours), the class
// literals (every hex equals TIERS[id].color), the emblem frame escalation
// (every adjacent pair differs in a frame feature; shapes serialise with no
// className and deterministically), the two cohort gates agreeing on
// whole-tier bands, and the surfaces (H6, M29, M36, L18, L28) as source
// checks, since the repo has no DOM test runner. Exits non-zero on any
// failure.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  LEVEL_OPTIONS,
  LEVEL_STEPS,
  TIERS,
  TIER_COLORS,
  TIER_COUNT,
  TIER_RERATE_LINE,
  coversWholeLadder,
  formatLevelBand,
  formatTierLevel,
  formatTierSpan,
  levelWithinRange,
  nextTier,
  tierById,
  tierForLevel,
  tierIdsInRange,
  tierInCohortRange,
  tierOrdinal,
  tierProgress,
  type TierId,
} from "../lib/tiers";
import {
  FIELD_TINT,
  FUTURE_INK,
  NAVY,
  PIP_UNLIT,
  TIER_FRAME,
  TIER_PIP,
  TIER_PIP_OUTLINE,
  TIER_RULE,
  frameFeatures,
  tierStyle,
} from "../lib/tierStyle";
import {
  BEVEL_HEX,
  EMBLEM_SHAPES,
  GHOST_SHAPES,
  NOTCHED_HEX,
  TIER_IDS,
  emblemLabel,
  emblemSvgString,
  emblemVariantForSize,
} from "../components/tiers/emblemGeometry";

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

// ── Helpers ─────────────────────────────────────────────────────────────────
console.log("Tier helpers");
const expectedTier = [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7];
check("thirteen half steps, 1.0 to 7.0", LEVEL_STEPS.length === 13 && LEVEL_STEPS[0] === 1 && LEVEL_STEPS[12] === 7);
check(
  "tierForLevel across every step",
  LEVEL_STEPS.every((step, i) => tierForLevel(step)?.id === expectedTier[i])
);
check("0.5 clamps to Love", tierForLevel(0.5)?.id === 1);
check("8 clamps to Grand Slam", tierForLevel(8)?.id === 7);
check('"3.5" (a Postgres numeric string) is Deuce', tierForLevel("3.5")?.id === 3);
check("null, undefined and \"\" are unranked", tierForLevel(null) === null && tierForLevel(undefined) === null && tierForLevel("") === null);
check("TIER_COUNT is 7", TIER_COUNT === 7 && TIERS.length === 7);
check("tierById and nextTier", tierById(3).name === "Deuce" && nextTier(tierById(3))?.name === "Break" && nextTier(tierById(7)) === null);
check("tierOrdinal", tierOrdinal(tierById(3)) === "Tier 3 of 7");
check("formatTierLevel", formatTierLevel(2.5) === "Rally · 2.5" && formatTierLevel(null) === "");
check("tier names are the locked seven", TIERS.map((t) => t.name).join("|") === "Love|Rally|Deuce|Break|Ace|Match Point|Grand Slam");
check("no blurb carries a filler intensifier (voice.md rule 1)", TIERS.every((t) => !/\b(real|really|truly|actually|very|super)\b/i.test(t.blurb)));

console.log("tierProgress captions");
check("1.0 → Next tier: Rally at 2.0.", tierProgress(1)?.caption === "Next tier: Rally at 2.0." && tierProgress(1)?.step === 1);
check("2.5 → Halfway to Deuce. Next tier at 3.0.", tierProgress(2.5)?.caption === "Halfway to Deuce. Next tier at 3.0." && tierProgress(2.5)?.step === 2);
check("6.5 → Halfway to Grand Slam. Next tier at 7.0.", tierProgress(6.5)?.caption === "Halfway to Grand Slam. Next tier at 7.0.");
check("7.0 → Top of the ladder.", tierProgress(7)?.caption === "Top of the ladder." && tierProgress(7)?.next === null && tierProgress(7)?.steps === 1);
check("unranked has no progress", tierProgress(null) === null);

console.log("formatTierSpan and friends");
check('single tier → "Deuce"', formatTierSpan(3, 3.5) === "Deuce" && formatTierSpan(3, 3) === "Deuce");
check('spread → "Love – Rally"', formatTierSpan(1, 2.5) === "Love – Rally");
check('reaches the top → "Break and up"', formatTierSpan(4, 7) === "Break and up");
check('whole ladder → "All levels"', formatTierSpan(1, 7) === "All levels" && coversWholeLadder(1, 7) && !coversWholeLadder(1, 6.5));
check("unset → \"\"", formatTierSpan(null, null) === "" && formatTierSpan(undefined, "") === "");
check("one bound repeats the other", formatTierSpan(3, null) === "Deuce" && formatTierSpan(null, "4.0") === "Break");
check("tierIdsInRange is inclusive and ascending", tierIdsInRange(3, 4.5).join(",") === "3,4" && tierIdsInRange(null, null).length === 0 && tierIdsInRange(1, 7).length === 7);
check("formatLevelBand", formatLevelBand(1, 4.5) === "1.0–4.5" && formatLevelBand(4, 4) === "4.0" && formatLevelBand(null, null) === "" && formatLevelBand("3.0", "3.5") === "3.0–3.5");
check("LEVEL_OPTIONS has 13 entries", LEVEL_OPTIONS.length === 13);
check('LEVEL_OPTIONS reads "3.0 · Deuce"', LEVEL_OPTIONS[4].value === "3.0" && LEVEL_OPTIONS[4].label === "3.0 · Deuce" && LEVEL_OPTIONS[12].label === "7.0 · Grand Slam");
check("the re-rate line is null until the owner gives it (L18)", TIER_RERATE_LINE === null);

console.log("Cohort gates agree on whole-tier bands");
let agree = true;
for (let minId = 1; minId <= 7; minId++) {
  for (let maxId = minId; maxId <= 7; maxId++) {
    const min = minId;
    const max = maxId === 7 ? 7 : maxId + 0.5;
    for (const level of LEVEL_STEPS) {
      if (levelWithinRange(level, min, max) !== tierInCohortRange(level, min, max)) agree = false;
    }
  }
}
check("levelWithinRange === tierInCohortRange for every whole-tier band", agree);

// ── Colour ramp ─────────────────────────────────────────────────────────────
console.log("Colour ramp (owner D1)");
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const chan = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * chan((n >> 16) & 255) + 0.7152 * chan((n >> 8) & 255) + 0.0722 * chan(n & 255);
}
function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
const CARD = "#122032";
for (const t of TIERS) {
  check(`${t.name} ${t.color} ≥ 4.5:1 on navy and on a card`, contrast(t.color, NAVY) >= 4.5 && contrast(t.color, CARD) >= 4.5, `${contrast(t.color, NAVY).toFixed(2)} / ${contrast(t.color, CARD).toFixed(2)}`);
}
check("navy on gold ≥ 4.5:1", contrast(NAVY, TIER_COLORS[7]) >= 4.5, contrast(NAVY, TIER_COLORS[7]).toFixed(2));
check("seven distinct colours", new Set(TIERS.map((t) => t.color)).size === 7);
check("gold is the approved #E3C46F, used only at Grand Slam", TIER_COLORS[7] === "#E3C46F" && TIERS.filter((t) => t.color === "#E3C46F").length === 1);
check("Deuce and Break are the two lime tokens", TIER_COLORS[3] === "#8CC63F" && TIER_COLORS[4] === "#B4E655");
check("TIER_COLORS is derived from TIERS", TIERS.every((t) => TIER_COLORS[t.id] === t.color));

// ── Class literals ──────────────────────────────────────────────────────────
console.log("Class literals (tierStyle.ts)");
const HEX_IN_CLASS = /#[0-9A-Fa-f]{6}/g;
for (const id of TIER_IDS) {
  const hex = TIERS[id - 1].color;
  const pip = TIER_PIP[id];
  const outline = TIER_PIP_OUTLINE[id];
  const rule = TIER_RULE[id];
  const all = [pip, outline, rule].flatMap((c) => c.match(HEX_IN_CLASS) ?? []);
  check(`tier ${id}: every hex in the class strings equals ${hex}`, all.length === 3 && all.every((h) => h === hex));
  check(`tier ${id}: literal shapes`, pip === `bg-[${hex}]` && outline === `border border-[${hex}] bg-transparent` && rule === `border-t-2 border-t-[${hex}]`);
}
check("the unlit pip is white/10", PIP_UNLIT === "bg-white/[0.10]");
check("tierStyle resolves a level and nulls when unranked", tierStyle(2.5)?.id === 2 && tierStyle(2.5)?.hex === TIER_COLORS[2] && tierStyle(null) === null);
check("the future ink is the flat white/40", FUTURE_INK === "#6A727D");
check("field tints", FIELD_TINT.empty === NAVY && FIELD_TINT.lime === "#1E312D" && FIELD_TINT.platinum === "#253243" && FIELD_TINT.gold === "#E3C46F");

// ── Emblem frames ───────────────────────────────────────────────────────────
console.log("Emblem frames (H6)");
for (let id = 1 as TierId; id < 7; id++) {
  const a = frameFeatures(id);
  const b = frameFeatures((id + 1) as TierId);
  const differs = Object.keys(a).some((k) => a[k] !== b[k]);
  check(`tier ${id} and ${id + 1} differ in a frame feature`, differs);
}
check("ring weight never falls up the ladder", TIER_IDS.every((id, i) => i === 0 || TIER_FRAME[id].ring >= TIER_FRAME[TIER_IDS[i - 1]].ring));
check("only Grand Slam has the gold field and navy ink", TIER_IDS.every((id) => (TIER_FRAME[id].field === "gold") === (id === 7) && (TIER_FRAME[id].ink === "navy") === (id === 7)));
check("Ace and up are notched; Match Point and up have the bevel", TIER_IDS.every((id) => TIER_FRAME[id].notched === id >= 5 && TIER_FRAME[id].bevel === id >= 6));
check("the notched hexagon is the spec'd polygon", NOTCHED_HEX.startsWith("28.11,5.26 35.89,5.26 53.11,15.24 57,22"));
check("the bevel stays inside the 64 grid", BEVEL_HEX.split(/\s+/).every((p) => p.split(",").every((v) => Number(v) >= 1 && Number(v) <= 63)));
check("a mark below 28px, the full emblem above", emblemVariantForSize(20) === "mark" && emblemVariantForSize(27) === "mark" && emblemVariantForSize(28) === "full");
check("the mark is one shape; the full emblem has a motif", TIER_IDS.every((id) => EMBLEM_SHAPES(id, "earned", "mark").length === 1 && EMBLEM_SHAPES(id, "earned", "full").length > 2));
check("future and provisional keep the outer ring only, plus the motif", TIER_IDS.every((id) => {
  const future = EMBLEM_SHAPES(id, "future");
  const prov = EMBLEM_SHAPES(id, "provisional");
  return future[0].kind === "polygon" && future[0].stroke === FUTURE_INK && prov[0].kind === "polygon" && prov[0].strokeDasharray === "5 4" && prov.slice(1).every((s) => s.opacity === 0.6);
}));
check("the ghost is one dashed grey hexagon", GHOST_SHAPES().length === 1 && GHOST_SHAPES()[0].strokeDasharray === "5 4" && GHOST_SHAPES()[0].stroke === FUTURE_INK);
check("labels", emblemLabel(3) === "Deuce, tier 3 of 7" && emblemLabel(2, "provisional") === "Likely Rally, provisional" && emblemLabel(null) === "Unranked" && emblemLabel(4, "ghost") === "Unranked");
const svg = emblemSvgString(3, { size: 128 });
check("emblemSvgString is a standalone 128px SVG with a label", svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="128" height="128" role="img" aria-label="Deuce, tier 3 of 7">') && svg.endsWith("</svg>"));
check("emblemSvgString carries no className and no gradient", !svg.includes("class") && !svg.includes("gradient") && !svg.includes("<text"));
check("emblemSvgString is deterministic", svg === emblemSvgString(3, { size: 128 }) && emblemSvgString(null) === emblemSvgString(null));
check("every tier serialises in every state", TIER_IDS.every((id) => (["earned", "future", "provisional", "ghost"] as const).every((s) => emblemSvgString(id, { state: s }).length > 100)));
check("every colour in the shapes is an attribute (no undefined fills)", TIER_IDS.every((id) => EMBLEM_SHAPES(id).every((s) => s.fill !== undefined || s.stroke !== undefined)));

// ── Surfaces (source checks) ────────────────────────────────────────────────
console.log("Surfaces (H6, M29, M36, L18, L28)");
const index = read("src/components/tiers/index.tsx");
const line = read("src/components/tiers/TierLine.tsx");
const badges = read("src/components/tiers/badges.tsx");
check("TierLadder is gone", !index.includes("export function TierLadder") && !line.includes("TierLadder"));
check("no horizontal scroller in the tier components", !["index.tsx", "TierLine.tsx", "badges.tsx", "RankCard.tsx"].some((f) => read(`src/components/tiers/${f}`).includes("overflow-x-auto")));
check("the rail is thirteen pips in seven rising groups", line.includes("flex flex-1 items-end gap-[2px]") && line.includes('7: "h-[18px]"') && line.includes('1: "h-[6px]"'));
check("the rail is a meter with the tier in its value text", line.includes('role: "meter"') && line.includes("aria-valuetext") && line.includes("aria-valuemax"));
check("a span rail says who it is built for", line.includes("Built for ${who}, levels"));
check("the ghost rail names all seven", line.includes("Unranked. Seven tiers, Love to Grand Slam."));
check("the ladder is an ordered list, Love first", line.includes("<ol aria-label={LADDER_LABEL}") && line.includes("flex flex-col-reverse"));
check("a provisional rung shows its band, never a level number", (line.match(/n\.state !== "provisional" \?/g) ?? []).length === 2);
check("the current rung is aria-current=step with an sr-only suffix", line.includes('aria-current={n.current ? "step" : undefined}') && line.includes("(your tier)") && line.includes("(likely tier, provisional)") && line.includes("(in this program)") && line.includes("(reached)"));
check("forced colours get a track border and Highlight pips", line.includes("forced-colors:border-[color:CanvasText]") && line.includes("forced-colors:bg-[color:Highlight]"));
check("emblems are never focusable and hide when decorative", badges.includes('focusable="false"') && badges.includes('"aria-hidden": true'));
check("no className fills in the emblem", !/className\s*[=:]/.test(read("src/components/tiers/emblemGeometry.ts")));

// Banned words and the text floor inside the tier UI (design specs §1.2).
const BANNED = ["unlock", "level up", "rank up", "next level", "journey", "Requires "];
const tierFiles = ["index.tsx", "TierLine.tsx", "RankCard.tsx", "badges.tsx"].map((f) => `src/components/tiers/${f}`).concat(["src/components/sections/TierBand.tsx", "src/app/admin/tiers/TierGallery.tsx"]);
for (const f of tierFiles) {
  const src = read(f);
  check(`${f}: no banned tier words`, !BANNED.some((w) => src.toLowerCase().includes(w.toLowerCase())));
  const low = [...src.matchAll(/text-white\/(\d+)(?![\w/.\]])/g)].filter((m) => Number(m[1]) < 55);
  const micro = /text-\[(?:[0-9]|1[01])px\]/.test(src);
  check(`${f}: text at white/55 or brighter, nothing below 12px`, low.length === 0 && !micro);
}

// Home, /assessment, /about, booking (M36).
const home = read("src/app/page.tsx");
const band = read("src/components/sections/TierBand.tsx");
check("home mounts the TierBand after the TrustBar", home.indexOf("<TrustBar />") < home.indexOf("<TierBand />"));
check("the band says the seven tiers and links to the ladder", band.includes("Seven tiers. Love to Grand Slam.") && band.includes('href="/assessment#ladder"') && band.includes("How tiers work"));
check("the band carries the owner's body copy and no new button", band.includes("Every player trains at a tier.") && !band.includes("<Button"));
const assessment = read("src/app/assessment/page.tsx");
check("/assessment has the #ladder anchor with blurbs, responsive", assessment.includes('id="ladder"') && assessment.includes("scroll-mt-24") && assessment.includes('orientation="responsive" showBlurbs'));
check("/assessment shows the re-rate line only when set (L18)", assessment.includes("{TIER_RERATE_LINE && ("));
const about = read("src/app/about/page.tsx");
check("/about carries a compact responsive ladder", about.includes('variant="ladder"') && about.includes('orientation="responsive"') && about.includes('density="compact"'));
const booking = read("src/app/assessment/book/page.tsx");
check("booking shows the ghost rail under What you leave with", booking.includes("What you leave with") && booking.includes("You leave with your tier: one of seven, Love to Grand Slam.") && booking.includes('<TierLine variant="rail" size="sm" labels="ends"'));

// Admin (M29).
const players = read("src/app/admin/players/AdminPlayersClient.tsx");
const assessments = read("src/app/admin/assessments/AdminAssessmentsClient.tsx");
const cohorts = read("src/app/admin/cohorts/AdminCohortsClient.tsx");
const matrix = read("src/components/admin/AvailabilityMatrix.tsx");
for (const [name, src] of [["players", players], ["assessments", assessments], ["cohorts", cohorts]] as const) {
  check(`admin ${name}: LEVEL_OPTIONS, no list of its own`, src.includes("LEVEL_OPTIONS") && !src.includes("const LEVELS"));
}
check("the assessment picker starts empty", assessments.includes('useState("")') && !assessments.includes('useState("3.0")'));
check("Complete + send level waits for a level and confirms", assessments.includes("disabled={busy || !level}") && assessments.includes('setConfirming("complete")') && assessments.includes("Send {firstName}: {formatTierLevel(level)}"));
check("No-show confirms", assessments.includes('setConfirming("no_show")') && assessments.includes("Mark {firstName} as a no-show?"));
check("the cohort form previews the span live", cohorts.includes('variant="rail"') && cohorts.includes("Not tier-gated") && cohorts.includes("formatTierSpan"));
check("the matrix label reads tier words and the band", matrix.includes("formatTierSpan") && matrix.includes("formatLevelBand"));
check("admin rows show the tier with its level", players.includes("<TierChip level={player.level} showLevel />") && assessments.includes("showLevel"));
check("Unranked is the one no-level word", !/Unleveled</.test(players) && !players.includes('"Unleveled"') && !read("src/components/participants/WhoIsThisFor.tsx").includes("Not leveled yet") && index.includes("export function UnrankedTag"));

// Docs and the test chain.
check("design-system.md documents the tier tokens", read("ops/briefs/design-system.md").includes("## Tier tokens"));
check("test-tiers is last in the npm test chain", /test-tiers\.ts"?\s*,?\s*$/m.test(JSON.parse(read("package.json")).scripts.test + "\n"));

if (failed > 0) {
  console.log(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll tier checks passed.");
