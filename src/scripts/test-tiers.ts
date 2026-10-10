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
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TierLine } from "../components/tiers/TierLine";
import { RankCard, type RankCardPlayer } from "../components/tiers/RankCard";
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
  placedSpanFor,
  tierById,
  tierEmblemPath,
  tierForLevel,
  tierIdsInRange,
  tierInCohortRange,
  tierOrdinal,
  tierProgress,
  type TierId,
} from "../lib/tiers";
import {
  PROVISIONAL_TIER,
  SELF_LEVELS,
  provisionalTierFor,
  tentativeLevelLabel,
} from "../lib/level";
import { programs } from "../content/programs";
import type { Recommendation } from "../lib/recommend";
import {
  DASHBOARD_URL,
  INK_BODY,
  INK_MUTED,
  INK_STRONG,
  buildAssessmentCompleteEmail,
  buildCohortConfirmedEmail,
  buildCohortInviteEmail,
  buildPaymentReceivedEmail,
  buildRecommendationEmail,
  cohortInviteSubject,
  tierLineTable,
  tierStandingLine,
} from "../lib/emailBodies";
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

// Rendered markup (fix round 1): the line is connected, the ghost is even,
// and the marker is in the accessible name.
const render = (props: Parameters<typeof TierLine>[0]) => renderToStaticMarkup(createElement(TierLine, props));
const markerRail = render({ variant: "rail", span: { min: 3, max: 5.5 }, marker: { level: 2.5, label: "You" } });
check("a marker rail names the marker in its aria-label", markerRail.includes('aria-label="Built for Deuce to Ace, levels 3.0 to 5.5. Your tier, Rally, is outside this range."'));
check("a named marker inside the span reads the same way", render({ variant: "rail", span: { min: 2, max: 3.5 }, marker: { level: 2.5, label: "Maya" } }).includes("Maya&#x27;s tier, Rally, is in this range."));
check("a marker rail has no sr-only text (nothing inside role=img is read)", !markerRail.includes("sr-only") && !line.includes('<span className="sr-only">\n            {marker'));
check("a span rail without a marker keeps its plain label", render({ variant: "rail", span: { min: 3, max: 5.5 } }).includes('aria-label="Built for Deuce to Ace, levels 3.0 to 5.5"'));
const ghostRail = render({ variant: "rail", labels: "ends" });
check("the ghost rail's two ends share one style", /<span class="text-white\/60">Love<\/span><span class="text-white\/60">Grand Slam<\/span>/.test(ghostRail));
check("a ranked rail still emphasises its left end", render({ variant: "rail", level: 2.5, labels: "ends" }).includes('<span class="font-semibold text-white">Rally · Level 2.5</span>'));
const horizontal = render({ variant: "ladder", orientation: "horizontal" });
check("horizontal connectors reach 2px past each cell to bridge the 4px gap", horizontal.includes("gap-x-1") && horizontal.includes("absolute -left-0.5 right-1/2") && horizontal.includes("absolute left-1/2 -right-0.5") && !horizontal.includes("absolute left-0 ") && !horizontal.includes(" right-0 "));
const vertical = render({ variant: "ladder", orientation: "vertical" });
check("the vertical emblem column stretches through the row's py-2 so connectors meet across rows", vertical.includes("relative -my-2 flex self-stretch items-center justify-center") && vertical.includes("items-center gap-4 py-2") && !vertical.includes("min-h-[44px]"));
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
check(
  "the band splits into two columns at lg, never md (the ladder keeps the full width to 1024)",
  band.includes("lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-center lg:gap-12") && band.includes("mt-8 min-w-0 lg:mt-0") && !band.includes("md:grid") && !band.includes("md:mt-0")
);
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
// Only membership: another PR may append its own script after this one.
check("test-tiers is in the npm test chain", JSON.parse(read("package.json")).scripts.test.includes("src/scripts/test-tiers.ts"));

// ═══════════════════════════════════════════════════════════════════════════
// Audit PR H (2026-10-10): player tier moments — the quiz's provisional tier
// (M17, owner D4), the dashboard and /profile RankCard (M24, L17 owner D6-B,
// L31), the tier emails (M35, L22, owner D9) and the emblem PNG route.
// ═══════════════════════════════════════════════════════════════════════════

// ── Self-estimate → provisional tier (M17, D4) ──────────────────────────────
console.log("Self-estimate and provisional tier (M17, owner D4)");
check("tentativeLevelLabel is null for undefined, \"\" and \"unsure\"", tentativeLevelLabel(undefined) === null && tentativeLevelLabel("") === null && tentativeLevelLabel("unsure") === null && tentativeLevelLabel(null) === null);
check("tentativeLevelLabel still names the four bands", tentativeLevelLabel("new") === "1.5–2.0" && tentativeLevelLabel("rally") === "2.5–3.0" && tentativeLevelLabel("competitive") === "3.5–4.0" && tentativeLevelLabel("elite") === "4.5+");
check("PROVISIONAL_TIER is the D4 map: new→Love, rally→Rally, competitive→Deuce, elite→Break", PROVISIONAL_TIER.new === 1 && PROVISIONAL_TIER.rally === 2 && PROVISIONAL_TIER.competitive === 3 && PROVISIONAL_TIER.elite === 4);
check("provisionalTierFor names the tier", provisionalTierFor("new")?.name === "Love" && provisionalTierFor("rally")?.name === "Rally" && provisionalTierFor("competitive")?.name === "Deuce" && provisionalTierFor("elite")?.name === "Break");
check("provisionalTierFor is null for \"\", \"unsure\", undefined, null and an unknown value", provisionalTierFor("") === null && provisionalTierFor("unsure") === null && provisionalTierFor(undefined) === null && provisionalTierFor(null) === null && provisionalTierFor("bogus") === null);
check("SELF_LEVELS includes elite, unsure and prefer-not-to-say", SELF_LEVELS.some((o) => o.value === "elite") && SELF_LEVELS.some((o) => o.value === "unsure") && SELF_LEVELS.some((o) => o.value === ""));
{
  // recommend.ts sends competitive and elite players to High Performance, so
  // their provisional tiers must sit inside its span (owner D2 and D4 agree).
  const hp = programs.find((p) => p.id === "high-performance");
  const inHp = (v: string) => {
    const t = provisionalTierFor(v);
    return !!hp && !!t && levelWithinRange(t.id, hp.levelMin, hp.levelMax);
  };
  check("competitive and elite provisional tiers sit inside the High Performance span", inHp("competitive") && inHp("elite"));
  const youth = programs.find((p) => p.id === "youth-programs");
  const adult = programs.find((p) => p.id === "bootcamps");
  const inBoth = (v: string) => {
    const t = provisionalTierFor(v);
    return !!youth && !!adult && !!t && levelWithinRange(t.id, youth.levelMin, youth.levelMax) && levelWithinRange(t.id, adult.levelMin, adult.levelMax);
  };
  check("new and rally provisional tiers sit inside the Youth and Adult spans", inBoth("new") && inBoth("rally"));
}

// ── placedSpanFor (L17, owner D6-B) ─────────────────────────────────────────
console.log("Placed state (L17, owner D6-B)");
{
  const cohorts = [
    { id: "a", startDate: "2026-11-01", levelMin: 3, levelMax: 3.5 },
    { id: "b", startDate: "2026-10-18", levelMin: 2, levelMax: 2.5 },
    { id: "open", startDate: "2026-10-01", levelMin: null, levelMax: null },
  ];
  const rows = [
    { cohort_id: "a", participant_name: "Maya Chen" },
    { cohort_id: "open", participant_name: "Maya Chen" },
    { cohort_id: "b", participant_name: "Leo Chen" },
  ];
  const maya = { level: null, full_name: "Maya Chen" };
  check("a levelled player is never Placed", placedSpanFor({ level: 2.5, full_name: "Maya Chen" }, rows, cohorts) === null);
  check("a household player matches rows by name, case-insensitive", JSON.stringify(placedSpanFor({ level: null, full_name: "maya chen" }, rows, cohorts)) === JSON.stringify({ min: 3, max: 3.5 }));
  check("an untiered cohort never places anyone", placedSpanFor(maya, [{ cohort_id: "open", participant_name: "Maya Chen" }], cohorts) === null);
  check("no matching row → null", placedSpanFor({ level: null, full_name: "Sam Chen" }, rows, cohorts) === null);
  check("a nameless player in a household matches nothing", placedSpanFor({ level: null, full_name: null }, rows, cohorts) === null);
  check("a solo account claims every row and the earliest banded cohort wins", JSON.stringify(placedSpanFor({ level: null, full_name: null }, rows, cohorts, { soloAccount: true })) === JSON.stringify({ min: 2, max: 2.5 }));
  check("a Postgres numeric string level reads as a level", placedSpanFor({ level: "3.0", full_name: "Maya Chen" }, rows, cohorts) === null);
}

// ── RankCard (M24) rendered ─────────────────────────────────────────────────
console.log("RankCard (M24)");
const rankFixture = (over: Partial<RankCardPlayer>): RankCardPlayer => ({
  id: "p1",
  full_name: "Maya Chen",
  relationship: "self",
  is_minor: false,
  level: 2.5,
  level_assessed_at: "2026-10-04T15:00:00.000Z",
  level_notes: null,
  ...over,
});
const renderCard = (props: Parameters<typeof RankCard>[0]) => renderToStaticMarkup(createElement(RankCard, props));
const compact = renderCard({ player: rankFixture({}), layout: "compact", isSelf: true });
check("compact: eyebrow, ordinal, name, level, caption and Set by", ["Your tier", "Tier 2 of 7", ">Rally<", "Level 2.5", "Halfway to Deuce. Next tier at 3.0.", "Set by Sina · Oct 4"].every((s) => compact.includes(s)));
check("compact: the rail is a meter with the position", compact.includes('role="meter"') && compact.includes("aria-valuenow=\"2\""));
check("compact: the tier-colour top rule is the only block of colour", compact.includes("border-t-2 border-t-[#AEBBCD]") && !compact.includes("bg-[#AEBBCD]/"));
const wide = renderCard({ player: rankFixture({}), layout: "wide", isSelf: true });
check("wide: an 80px emblem, the blurb, a ladder at md and the rail below md", wide.includes('width="80"') && wide.includes("You can keep the ball alive across the net.") && wide.includes("<ol") && wide.includes("hidden md:grid") && wide.includes("md:hidden"));
const child = renderCard({ player: rankFixture({ full_name: "Leo Chen", relationship: "child", is_minor: true, level: 4 }), layout: "compact", isSelf: false });
check("a child's eyebrow reads First · Child · Under 18", child.includes("Leo · Child · Under 18") && child.includes("Next tier: Ace at 5.0."));
const unranked = renderCard({ player: rankFixture({ level: null, level_assessed_at: null }), layout: "compact", isSelf: true });
check("unranked: the ghost, the one word, the sentence, and no pitch on the dashboard", unranked.includes(">Unranked<") && unranked.includes("Your tier shows here once Sina sets your level.") && !unranked.includes("Book Your Assessment") && unranked.includes("Unranked. Seven tiers, Love to Grand Slam."));
const profileUnranked = renderCard({ player: rankFixture({ level: null, level_assessed_at: null }), layout: "compact", isSelf: true, assessmentLink: true });
check("profile unranked: the exact button label and the full $20 sentence", profileUnranked.includes(">Book Your Assessment<") && profileUnranked.includes("The assessment is $20 — enroll in a program afterward and that $20 comes off the price.") && profileUnranked.includes('href="/assessment/book"'));
const placed = renderCard({ player: rankFixture({ level: null, level_assessed_at: null }), layout: "compact", isSelf: true, placedSpan: { min: 3, max: 3.5 } });
check("placed: the group, the span rail, the sentence, and never Unranked or a pitch", placed.includes(">Deuce group<") && placed.includes("You train in a Deuce group. Sina sets your exact level once he has seen you play.") && placed.includes("Built for Deuce, levels 3.0 to 3.5") && !placed.includes("Unranked") && !placed.includes("Book Your Assessment"));
check("placed, third person", renderCard({ player: rankFixture({ full_name: "Leo Chen", relationship: "child", level: null }), layout: "compact", isSelf: false, placedSpan: { min: 2, max: 3.5 } }).includes("Leo trains in a Rally – Deuce group. Sina sets their exact level once he has seen them play."));
check("the re-rate line is absent while null (L18)", TIER_RERATE_LINE === null && !compact.includes("re-rated"));

// ── Surfaces (M24, L17, L31; source checks) ─────────────────────────────────
console.log("Dashboard and profile surfaces (M24, L31)");
const indexSrc = read("src/components/tiers/index.tsx");
check("TierStatus and UnrankedChip are gone", !indexSrc.includes("export function TierStatus") && !indexSrc.includes("export function UnrankedChip") && !indexSrc.toLowerCase().includes("unranked — book your assessment"));
check("nothing imports TierStatus or UnrankedChip", ["src/app/dashboard/DashboardView.tsx", "src/app/profile/page.tsx", "src/app/admin/tiers/TierGallery.tsx"].every((f) => !/\b(TierStatus|UnrankedChip)\b/.test(read(f))));
const dash = read("src/app/dashboard/DashboardView.tsx");
check("dashboard: the tier section mounts the RankCard, wide for one player and compact per household player", dash.includes('aria-labelledby="tiers"') && dash.includes('layout="wide"') && dash.includes('layout="compact"') && dash.includes("Your players' tiers") && dash.includes("Each player's level, set by Sina."));
check("dashboard: no badge in the header or the side card", !dash.includes("TierBadge") && !dash.includes("<TierChip") && !/Unranked\s*<\/span>/.test(dash));
check("dashboard: My programs carries age chips, the cohort span and a flush strip plate", dash.includes("<AgeBandChips bands={program.ageBands} />") && dash.includes("<TierRangeBadges levelMin={cohort.levelMin} levelMax={cohort.levelMax} />") && dash.includes('frame="strip"') && dash.includes("aspect-[3/1]"));
check("dashboard: Open for your tier shows the span rail with the You marker and a 56px mark", dash.includes('label: "You"') && dash.includes("span={{ min: c.levelMin, max: c.levelMax }}") && dash.includes("<PlateMark plate={program.plate} size={56}"));
check("dashboard: Edit profile and Past sessions are 44px targets (L31)", dash.includes('"inline-flex min-h-[44px] items-center rounded text-sm font-semibold text-white/70') && dash.includes("inline-flex min-h-[44px] cursor-pointer list-none items-center"));
check("dashboard: the holder's card shows in a household only when levelled or placed", dash.includes("p.id !== self?.id || hasLevel(p.level) || Boolean(placedSpans[p.id])"));
const dashPage = read("src/app/dashboard/page.tsx");
check("dashboard page: a RankCard ghost in the skeleton and placed spans from players.ts data", dashPage.includes("<RankCardGhost />") && dashPage.includes("placedSpanFor(player, rows, cohorts") && dashPage.includes("soloAccount: players.length === 1"));
const profile = read("src/app/profile/page.tsx");
check("/profile mounts the compact RankCard, reading the household through players.ts", profile.includes("<RankCard") && profile.includes('layout="compact"') && profile.includes("listParticipantsForAccount(userId, supabase)") && !profile.includes("TierStatus") && !profile.includes('"full_name, phone, level"'));
check("/profile offers the assessment only with no enrollment, and reads the Placed state", profile.includes("assessmentLink={rows.length === 0}") && profile.includes("placedSpanFor(player, rows, cohorts, { soloAccount })"));
check("/profile: the holder claims every row only on a one-person account, as the dashboard does", profile.includes('participants.length <= 1 && participants.every((p) => p.relationship === "self")') && !profile.includes("soloAccount: true"));
{
  // The household case the fix guards: a parent with no level, their child
  // Leo enrolled in a Deuce cohort. The parent's card never reads "Placed".
  const deuce = [{ id: "d", startDate: "2026-10-18", levelMin: 3, levelMax: 3.5 }];
  const leoRow = [{ cohort_id: "d", participant_name: "Leo Chen" }];
  const parent = { level: null, full_name: "Maya Chen" };
  check("/profile: a parent is not Placed by their child's cohort", placedSpanFor(parent, leoRow, deuce, { soloAccount: false }) === null && JSON.stringify(placedSpanFor({ level: null, full_name: "Leo Chen" }, leoRow, deuce, { soloAccount: false })) === JSON.stringify({ min: 3, max: 3.5 }));
}

// ── Quiz (M17, L30) ─────────────────────────────────────────────────────────
console.log("Quiz result and self-estimate hint (M17, L30)");
const intake = read("src/app/intake/page.tsx");
check("\"You profile like\" is gone from the quiz", !intake.toLowerCase().includes("profile like") && !intake.includes("tentativeLevelLabel"));
check("the result shows a 56px provisional emblem, the name, a Provisional chip and the compact ladder", intake.includes('state="provisional"') && intake.includes("size={56}") && intake.includes(">Provisional</span>") && intake.includes("Your likely starting tier") && intake.includes('density="compact"'));
check("the null case thanks and shows the seven tiers, no guess", intake.includes("Thanks for telling us about") && intake.includes("Sina places every player on one of seven tiers, Love to Grand Slam."));
check("the result body is the copy deck's", intake.includes("From your answers. Sina confirms"));
check("a lone player who is not the holder is named on the result, by the email's rule", intake.includes("function otherPlayerFirst(") && intake.includes("firstName={otherPlayerFirst(result.name, form.name)}") && intake.includes("firstName={otherPlayerFirst(playerName, form.name)}") && intake.includes("playerName={results[0]?.name}"));
check("a household gets a provisional chip and rail per player, the ladder once", intake.includes("<TierChip level={tier.id} provisional />") && intake.includes("Likely starting tiers for your"));
check("the match card links to the program with its class line and price", intake.includes("href={`/programs/${program.slug}`}") && intake.includes("classLineFor(program, ageBand, tier)") && intake.includes("program.priceSummary"));
check("the next step is stated without a promised window (D21 open)", intake.includes("Sina emails you an invitation with the day, time and price.") && !/within (a|\d+) (day|hour)/i.test(intake));
check("no result control is under 44px", !/py-2\b/.test(intake.split("// ─── Main wizard")[0]));
const who = read("src/components/participants/WhoIsThisFor.tsx");
check("the quiz's self-estimate shows a provisional rail and the likely tier", who.includes("function LikelyTierHint") && who.includes("Likely tier:") && who.includes("provisional labels=\"none\"") && who.includes("tierHint={requireLevel}") && /\n\s*tierHint\s*\r?\n\s*\/>/.test(who));
check("the self-estimate note no longer says the level comes from the court", !who.includes("comes from the court"));
const route = read("src/app/api/intake/route.ts");
check("/api/intake passes the provisional tier to the email and nothing else changes", route.includes("provisionalTierFor(body.level)?.name ?? null") && !route.includes("tentativeLevelLabel") && route.includes("buildIntakeRow(") && route.includes("INTAKE_APPEND_RANGE_ALL"));

// ── Emails (M35, L22, owner D9) ─────────────────────────────────────────────
console.log("Emails (M35, L22, D9)");
for (const [name, hex] of [["INK_BODY", INK_BODY], ["INK_MUTED", INK_MUTED], ["INK_STRONG", INK_STRONG]] as const) {
  check(`${name} ${hex} ≥ 4.5:1 on navy and on a card`, contrast(hex, NAVY) >= 4.5 && contrast(hex, CARD) >= 4.5, `${contrast(hex, NAVY).toFixed(2)} / ${contrast(hex, CARD).toFixed(2)}`);
}
const rec: Recommendation = { program: programs[0], score: 10, reason: "Saturday class" };
const quizTier = buildRecommendationEmail("Maya Chen", [rec], "Rally");
const quizNull = buildRecommendationEmail("Maya Chen", [rec], null);
const quizChild = buildRecommendationEmail("Maya Chen", [rec], "Rally", "Leo Chen");
check("quiz email with a tier: provisional, in HTML and text", quizTier.html.includes("your likely tier is <strong style=\"color:#fff;\">Rally</strong>. It's provisional — I confirm it when I place you.") && quizTier.text.includes("your likely tier is Rally. It's provisional — I confirm it when I place you."));
check("quiz email without a tier: thanks, no level, no guess", quizNull.html.includes("Thanks for telling us about your game.") && !quizNull.html.toLowerCase().includes("profile like") && !/Level \d/.test(quizNull.html) && !/Level \d/.test(quizNull.text));
check("quiz email subject never claims a level", quizTier.subject === "Your Tennis Bootcamp answers are in — Maya" && quizNull.subject === quizTier.subject);
check("quiz email names the player in a household", quizChild.html.includes("Leo's likely tier is") && quizChild.html.includes("I place Leo") && quizChild.text.includes("Leo's likely tier is Rally"));
check("quiz email keeps the locked assessment mechanic and label", quizTier.html.includes(">Book Your Assessment<") && quizTier.text.includes("that $20 comes off the price"));
const complete = buildAssessmentCompleteEmail({ name: "Maya Chen", levelLabel: "3.0", coachNote: "Solid forehand." });
check("assessment complete: the emblem PNG, the tier sentence and the standing", complete.html.includes(`<img src="`) && complete.html.includes("/tier-emblem/deuce") && complete.html.includes('width="64"') && complete.html.includes("You're a Deuce.") && complete.html.includes("Tier 3 of 7. Next tier: Break at 4.0."));
check("assessment complete: a table-built tier line of thirteen bgcolor cells with Love and Grand Slam captions", (complete.html.match(/<td width="14" height="8" bgcolor="#/g) ?? []).length === 13 && complete.html.includes(">Love</td>") && complete.html.includes(">Grand Slam</td>"));
{
  // 13 × 14px cells + 6 × 2px + 6 × 6px gaps = 230px, inside the card's
  // ~261px content box on a 375px phone; the caption table matches it.
  const line = tierLineTable(3);
  const widths = [...line.matchAll(/<td width="(\d+)"/g)].map((m) => Number(m[1]));
  check("the tier line is 230px wide and its caption table matches", widths.reduce((a, b) => a + b, 0) === 230 && line.includes('width="230" style="border-collapse:collapse;width:230px;"'));
}
check("assessment complete: the text body carries the same facts", complete.text.includes("You're a Deuce.") && complete.text.includes("Tier 3 of 7. Next tier: Break at 4.0.") && complete.text.includes("Solid forehand.") && complete.text.includes(DASHBOARD_URL));
check("assessment complete: Browse Programs in the locked casing, and the dashboard button", complete.html.includes(">Browse Programs<") && !complete.html.includes("Browse programs") && complete.html.includes(">See it on your dashboard<"));
check("assessment complete: the sooner line leaves the label to the button", complete.html.includes(">Want to move sooner?</p>") && !complete.html.includes("sooner? Browse Programs") && complete.text.includes("Want to move sooner?\n\nBrowse Programs: ") &&!complete.text.includes("sooner? Browse Programs"));
const top = buildAssessmentCompleteEmail({ name: "Maya Chen", levelLabel: "7.0", coachNote: "—" });
check("Grand Slam reads as the top of the ladder", top.html.includes("Tier 7 of 7. That's the top of the ladder.") && top.text.includes("That's the top of the ladder."));
const childComplete = buildAssessmentCompleteEmail({ name: "Maya Chen", participantName: "Leo Chen", levelLabel: "2.5", coachNote: "—" });
check("a child's result greets the holder and names the player", childComplete.html.includes("Leo's read from the court is in, Maya.") && childComplete.html.includes("Leo is a Rally.") && !childComplete.html.includes("Nice work out there from"));
check("tierStandingLine and tierLineTable", tierStandingLine("2.5") === "Tier 2 of 7. Halfway to Deuce. Next tier at 3.0." && tierStandingLine("") === "" && (tierLineTable(2.5).match(/bgcolor="#AEBBCD"/g) ?? []).length === 2 && (tierLineTable(7).match(/bgcolor="#1C2A3C"/g) ?? []).length === 0);
const inviteBase = { participantName: "Alex Kim", levelLabel: "3.0", tierNames: ["Deuce"], programTitle: "Adult Bootcamps", cohortLabel: "Fall A", dayTimeLabel: "Saturdays 9–10am", startDateLabel: "Oct 17", weeks: 6, priceCents: 21000, creditCents: 0, holdHours: 48, enrollUrl: "https://tennisbootcamp.ca/enroll/abc?invite=tok" };
check("invite subject leads with the tier (D9)", cohortInviteSubject(inviteBase) === "Alex's Deuce group (3.0) is forming — Saturdays 9–10am, starts Oct 17");
check("invite subject: a spread, and the holder's own", cohortInviteSubject({ ...inviteBase, levelLabel: "3.0–4.5", tierNames: ["Deuce", "Break"] }).startsWith("Alex's Deuce – Break group (3.0–4.5) is forming") && cohortInviteSubject({ ...inviteBase, participantName: null }).startsWith("Your Deuce group (3.0) is forming"));
check("invite subject: an untiered cohort names the program", cohortInviteSubject({ ...inviteBase, levelLabel: null, tierNames: [] }) === "Alex's Adult Bootcamps group is forming — Saturdays 9–10am, starts Oct 17");
const invite = buildCohortInviteEmail(inviteBase);
const spreadInvite = buildCohortInviteEmail({ ...inviteBase, levelLabel: "3.0–4.5", tierNames: ["Deuce", "Break"] });
check("invite: the chip separator is a real colour, not template text", spreadInvite.html.includes(`<span style="color:${INK_MUTED};margin:0 6px;">–</span>`) && !spreadInvite.html.includes("${"));
check("invite chip carries a 16px emblem img with empty alt", invite.html.includes("/tier-emblem/deuce") && invite.html.includes('width="16"') && invite.html.includes('alt=""') && invite.html.includes("Alex's Deuce group (3.0) is forming."));
const confirmed = buildCohortConfirmedEmail({ cohortLabel: "Fall A", programTitle: "Adult Bootcamps", startDateLabel: "Oct 17", sessionLines: ["Sat Oct 17 · 9–10am"] });
const received = buildPaymentReceivedEmail({ programTitle: "Adult Bootcamps", cohortLabel: "Fall A", amountCents: 21000 });
for (const [label, email] of [["quiz", quizTier], ["assessment complete", complete], ["cohort confirmed", confirmed], ["payment received", received]] as const) {
  check(`${label} email links the dashboard in HTML and text`, email.html.includes(`href="${DASHBOARD_URL}"`) && email.html.includes("See it on your dashboard") && email.text.includes(`See it on your dashboard: ${DASHBOARD_URL}`));
  check(`${label} email has no rgba text colour (L22)`, !/color:\s*rgba\(/.test(email.html));
}
check("no email ships an unfilled template placeholder", ![quizTier, quizNull, quizChild, complete, top, childComplete, invite, spreadInvite, confirmed, received].some((e) => e.html.includes("${") || e.text.includes("${")));
check("every email body is at least 13px text", ![quizTier, complete, confirmed, received, invite].some((e) => /font-size:1[0-2]px/.test(e.html)));
check("tierEmblemPath", tierEmblemPath(tierById(3)) === "/tier-emblem/deuce" && tierEmblemPath(tierById(6)) === "/tier-emblem/match-point");
const pngRoute = read("src/app/tier-emblem/[slug]/route.tsx");
check("the emblem PNG route is static over the seven slugs and renders emblemSvgString", pngRoute.includes('export const dynamic = "force-static"') && pngRoute.includes("export const dynamicParams = false") && pngRoute.includes("export function generateStaticParams") && pngRoute.includes("emblemSvgString(tier.id, { size: EMBLEM_PNG_SIZE })") && pngRoute.includes("TIERS.map((t) => ({ slug: t.slug }))"));
check("the enroll summary carries the strip plate", read("src/app/enroll/[cohortId]/EnrollWizard.tsx").includes('frame="strip"'));
check("the Sheet row builder is untouched by this PR", read("src/lib/intakeRow.ts").includes("INTAKE_APPEND_RANGE_ALL") && !read("src/lib/intakeRow.ts").includes("provisional"));

if (failed > 0) {
  console.log(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll tier checks passed.");
