// Tier identity layer — a pure *display* derivation over the numeric level.
//
// The coach assigns a placement-grade numeric level on court (profiles.level and
// assessment_bookings.level_result, NTRP-style 1.0–7.0 in half steps). Tiers
// give that number a name to climb toward. The first four tiers span one whole
// level each, so a half step reads as progress *within* a tier: level 2.5 is
// "Novice · 2.5", still Novice, halfway to Intermediate. The top tier, High
// Performance, runs 5.0–7.0: five half steps that still show progress inside
// it, and 7.0 is the top of the ladder.
//
// Five tiers (owner, 2026-10-13): Beginner, Novice, Intermediate, Advanced,
// High Performance. They replaced the seven plain names of 2026-10-12 (Elite,
// Pro and World Class folded into High Performance), which had replaced the
// tennis-score names (Love … Grand Slam). The stored value is always the
// number and never moved; LEGACY_TIER_SLUGS keeps every old emblem URL working.
//
// High Performance is also the name of the competitive youth group (the High
// Performance Youth Bootcamp, by approval). Copy keeps the two apart: "the High
// Performance tier" is a level any player can reach; the group is "the High
// Performance Youth Bootcamp" or "the competitive track" (ops/briefs/voice.md).
//
// This module is deterministic and data-only (no JSX, no DB). Every surface that
// shows a tier derives it here — the stored value is always the number. The
// tier colour ramp (audit H6, owner D1; five colours since 2026-10-13) lives
// here too, as display data; the Tailwind class literals built from it are in
// src/lib/tierStyle.ts.

export type TierId = 1 | 2 | 3 | 4 | 5;

export type Tier = {
  /** Whole-number tier, 1–5. */
  id: TierId;
  /** Display name. */
  name: string;
  /** URL/CSS-safe slug. */
  slug: string;
  /** The lowest level in the tier (x.0). */
  levelMin: number;
  /** The highest level in the tier (x.5, or 7.0 at the top). */
  levelMax: number;
  /** Inclusive numeric level band this tier covers, e.g. "2.0–2.5". */
  band: string;
  /** One-line coach-voiced read on what this tier means. */
  blurb: string;
  /**
   * The tier's colour in the ramp slate → light slate → lime → lime → gold
   * (owner D1; five steps since 2026-10-13). Graphics only (emblems, pips,
   * connectors, the RankCard rule); tier names stay white text. Every value is
   * at least 4.5:1 on the navy and on a card (pinned by test-tiers.ts).
   */
  color: string;
};

/** The lowest and highest level on the ladder. */
export const LEVEL_MIN = 1;
export const LEVEL_MAX = 7;

function bandLabel(min: number, max: number): string {
  return min === max ? min.toFixed(1) : `${min.toFixed(1)}–${max.toFixed(1)}`;
}

function tier(t: Omit<Tier, "band">): Tier {
  return { ...t, band: bandLabel(t.levelMin, t.levelMax) };
}

/** The ladder, low to high. Index 0 is Beginner (tier 1). */
export const TIERS: readonly Tier[] = [
  tier({
    id: 1,
    name: "Beginner",
    slug: "beginner",
    levelMin: 1,
    levelMax: 1.5,
    blurb: "First swings. You're learning the court.",
    color: "#7D8CA3",
  }),
  tier({
    id: 2,
    name: "Novice",
    slug: "novice",
    levelMin: 2,
    levelMax: 2.5,
    blurb: "You can keep the ball alive across the net.",
    color: "#AEBBCD",
  }),
  tier({
    id: 3,
    name: "Intermediate",
    slug: "intermediate",
    levelMin: 3,
    levelMax: 3.5,
    blurb: "Consistent strokes. You play points out.",
    color: "#8CC63F",
  }),
  tier({
    id: 4,
    name: "Advanced",
    slug: "advanced",
    levelMin: 4,
    levelMax: 4.5,
    blurb: "You break down a rally and take control.",
    color: "#B4E655",
  }),
  tier({
    id: 5,
    name: "High Performance",
    slug: "high-performance",
    levelMin: 5,
    levelMax: 7,
    blurb: "Weapons on serve and groundstrokes. Tournament-tested.",
    color: "#E3C46F",
  }),
] as const;

/** How many tiers there are — copy says "Tier 3 of {TIER_COUNT}". */
export const TIER_COUNT = TIERS.length;

/** The top tier (High Performance), the one that runs to 7.0. */
export const TOP_TIER: Tier = TIERS[TIERS.length - 1];

/**
 * "Beginner to High Performance": the ladder's two ends, for every sentence
 * that names the whole ladder ("Five tiers, Beginner to High Performance.").
 * Derived, so no copy surface types a tier name of its own.
 */
export const TIER_LADDER_SPAN = `${TIERS[0].name} to ${TOP_TIER.name}`;

/** "five" — the tier count in words, for copy ("one of five tiers"). */
export const TIER_COUNT_WORD = ["zero", "one", "two", "three", "four", "five", "six", "seven"][TIER_COUNT] ?? String(TIER_COUNT);

/**
 * "a Beginner group" · "an Intermediate group": the indefinite article for a
 * phrase that leads with a tier name. Two of the plain names start with a
 * vowel (Intermediate, Advanced), so copy never hard-codes "a".
 */
export function withArticle(phrase: string): string {
  return `${/^[aeiou]/i.test(phrase.trim()) ? "an" : "a"} ${phrase}`;
}

/**
 * Every retired slug and the slug it became: the tennis-score names (Love …
 * Grand Slam, retired 2026-10-12) and the three top names that folded into
 * High Performance (Elite, Pro, World Class, retired 2026-10-13; 5.0 and up
 * is one tier now). next.config.ts turns these into permanent redirects, so a
 * tier-emblem image in an email sent before either rename still loads.
 */
export const LEGACY_TIER_SLUGS: Readonly<Record<string, string>> = {
  love: "beginner",
  rally: "novice",
  deuce: "intermediate",
  break: "advanced",
  ace: "high-performance",
  "match-point": "high-performance",
  "grand-slam": "high-performance",
  elite: "high-performance",
  pro: "high-performance",
  "world-class": "high-performance",
};

/** The tier colours by id, derived from TIERS (one source). */
export const TIER_COLORS: Record<TierId, string> = Object.fromEntries(
  TIERS.map((t) => [t.id, t.color])
) as Record<TierId, string>;

/** The thirteen half steps a level can take, 1.0 … 7.0. */
export const LEVEL_STEPS: readonly number[] = Array.from(
  { length: (LEVEL_MAX - LEVEL_MIN) * 2 + 1 },
  (_, i) => LEVEL_MIN + i * 0.5
);

/**
 * The one level picker list for admin selects (audit M29): "3.0 · Intermediate",
 * "5.5 · High Performance". Replaces the three bare "1.0"…"7.0" arrays the
 * admin clients used to keep.
 */
export const LEVEL_OPTIONS: readonly { value: string; label: string }[] =
  LEVEL_STEPS.map((n) => ({
    value: n.toFixed(1),
    label: `${n.toFixed(1)} · ${tierForLevel(n)?.name ?? ""}`,
  }));

/**
 * How and when a level moves (audit L18, owner D7). Null until the owner gives the
 * sentence; every surface that would show it renders nothing while null.
 */
export const TIER_RERATE_LINE: string | null = null;

/** Coerce a level that may arrive as a number, a Postgres numeric string, or null. */
function toLevelNumber(level: number | string | null | undefined): number | null {
  if (level === null || level === undefined || level === "") return null;
  const n = typeof level === "string" ? Number(level) : level;
  return Number.isFinite(n) ? n : null;
}

/** The numeric level, or null when unranked — the same coercion every helper uses. */
export function levelNumber(
  level: number | string | null | undefined
): number | null {
  return toLevelNumber(level);
}

/** A level clamped onto the ladder, 1.0–7.0. */
function clampLevel(n: number): number {
  return Math.min(LEVEL_MAX, Math.max(LEVEL_MIN, n));
}

/**
 * The tier for a numeric level, or `null` when unranked. Each tier owns the
 * levels from its levelMin up to the next tier's levelMin — 2.5 → Novice, and
 * 5.0, 6.0 and 7.0 are all High Performance — and an out-of-range value is
 * clamped onto the ladder, so it can never index off it.
 */
export function tierForLevel(
  level: number | string | null | undefined
): Tier | null {
  const n = toLevelNumber(level);
  if (n === null) return null;
  const clamped = clampLevel(n);
  for (let i = TIERS.length - 1; i >= 0; i--) {
    if (clamped >= TIERS[i].levelMin) return TIERS[i];
  }
  return TIERS[0];
}

/** The tier by id. */
export function tierById(id: TierId): Tier {
  return TIERS[id - 1];
}

/** The tier by slug (live slugs only; a retired slug reads as null). */
export function tierBySlug(slug: string | null | undefined): Tier | null {
  if (!slug) return null;
  const key = slug.trim().toLowerCase();
  return TIERS.find((t) => t.slug === key) ?? null;
}

/** The tier above, or null at High Performance. */
export function nextTier(tier: Tier): Tier | null {
  return tier.id >= TIER_COUNT ? null : TIERS[tier.id];
}

/** "Tier 3 of 5". */
export function tierOrdinal(tier: Tier): string {
  return `Tier ${tier.id} of ${TIER_COUNT}`;
}

/** "2.5" — the numeric level rendered to one decimal (its stored precision). */
export function formatLevelNumber(
  level: number | string | null | undefined
): string {
  const n = toLevelNumber(level);
  return n === null ? "" : n.toFixed(1);
}

/**
 * "Novice · 2.5" — tier name plus the numeric level, so a player reads both where
 * they stand and how far into the tier they've climbed. Returns "" when unranked.
 */
export function formatTierLevel(
  level: number | string | null | undefined
): string {
  const tier = tierForLevel(level);
  if (!tier) return "";
  return `${tier.name} · ${formatLevelNumber(level)}`;
}

/** True when there is a real, coach-assigned level to show a tier for. */
export function hasLevel(level: number | string | null | undefined): boolean {
  return toLevelNumber(level) !== null;
}

export type TierProgress = {
  tier: Tier;
  /** The level, clamped into 1.0–7.0. */
  level: number;
  /** Which half step of the tier the player is on: x.0 is 1, x.5 is 2 (High Performance runs 1–5). */
  step: number;
  /** Half steps in the tier: 2, or 5 at High Performance (5.0–7.0). */
  steps: number;
  /** The tier above, or null at High Performance. */
  next: Tier | null;
  /**
   * The next level that changes the caption: the level the next tier starts
   * at, the next half step inside High Performance, or null at 7.0.
   */
  nextLevel: number | null;
  /** True at 7.0, the top of the ladder. */
  atTop: boolean;
  /**
   * "Next tier: Intermediate at 3.0." · "Halfway to Intermediate. Next tier at 3.0." ·
   * "High Performance runs 5.0–7.0. Next step: 6.0." · "Top of the ladder."
   */
  caption: string;
};

/**
 * Where a level sits inside its tier and what comes next, for the RankCard
 * footer and the rail's "you are here". Null when unranked. Inside the top
 * tier the half steps still count as progress: 5.5 is step 2 of 5 in High
 * Performance, and the caption names the next step until 7.0.
 */
export function tierProgress(
  level: number | string | null | undefined
): TierProgress | null {
  const tier = tierForLevel(level);
  const raw = toLevelNumber(level);
  if (!tier || raw === null) return null;
  const clamped = clampLevel(raw);
  const steps = Math.round((tier.levelMax - tier.levelMin) * 2) + 1;
  const step = Math.min(steps, Math.max(1, Math.round((clamped - tier.levelMin) * 2) + 1));
  const next = nextTier(tier);
  if (!next) {
    const atTop = clamped >= tier.levelMax;
    const nextStep = atTop ? null : Math.min(tier.levelMax, tier.levelMin + step * 0.5);
    return {
      tier,
      level: clamped,
      step,
      steps,
      next: null,
      nextLevel: nextStep,
      atTop,
      caption: atTop
        ? "Top of the ladder."
        : `${tier.name} runs ${tier.band}. Next step: ${nextStep!.toFixed(1)}.`,
    };
  }
  const halfway = step > 1;
  const nextLevel = next.levelMin;
  return {
    tier,
    level: clamped,
    step,
    steps,
    next,
    nextLevel,
    atTop: false,
    caption: halfway
      ? `Halfway to ${next.name}. Next tier at ${nextLevel.toFixed(1)}.`
      : `Next tier: ${next.name} at ${nextLevel.toFixed(1)}.`,
  };
}

// ─── Cohort level bands (Phase 3) ─────────────────────────────────────────────
// A cohort stores a numeric [level_min, level_max] band; tiers stay a display
// derivation over it. Both helpers treat a missing bound as open-ended and
// return null/false when the cohort isn't tier-gated at all (both bounds null).

/**
 * The tier range a cohort's numeric band covers, or `null` when the cohort has
 * no level band. A single-tier band returns min === max.
 */
export function tierRangeForLevels(
  levelMin: number | string | null | undefined,
  levelMax: number | string | null | undefined
): { min: Tier; max: Tier } | null {
  const minTier = tierForLevel(levelMin ?? levelMax);
  const maxTier = tierForLevel(levelMax ?? levelMin);
  if (!minTier || !maxTier) return null;
  return minTier.id <= maxTier.id
    ? { min: minTier, max: maxTier }
    : { min: maxTier, max: minTier };
}

/** "Intermediate" for a single-tier band, "Intermediate – Advanced" for a spread. */
export function formatTierRange(
  levelMin: number | string | null | undefined,
  levelMax: number | string | null | undefined
): string {
  const range = tierRangeForLevels(levelMin, levelMax);
  if (!range) return "";
  return range.min.id === range.max.id
    ? range.min.name
    : `${range.min.name} – ${range.max.name}`;
}

/** The numeric ends of a band, low then high, or null when unset. */
function bandEnds(
  levelMin: number | string | null | undefined,
  levelMax: number | string | null | undefined
): { lo: number; hi: number } | null {
  const a = toLevelNumber(levelMin);
  const b = toLevelNumber(levelMax);
  if (a === null && b === null) return null;
  const lo = Math.min(a ?? (b as number), b ?? (a as number));
  const hi = Math.max(a ?? (b as number), b ?? (a as number));
  return { lo, hi };
}

/** True when a span runs the whole ladder, 1.0 to 7.0 (min ≤ 1.0, max ≥ 7.0). */
export function coversWholeLadder(
  levelMin: number | string | null | undefined,
  levelMax: number | string | null | undefined
): boolean {
  const ends = bandEnds(levelMin, levelMax);
  return !!ends && ends.lo <= LEVEL_MIN && ends.hi >= LEVEL_MAX;
}

/**
 * The span as words: "Intermediate" · "Beginner – Novice" · "Advanced and up"
 * (reaches 7.0, the top of the ladder, from a lower tier) · "All levels" (the
 * whole ladder) · "" when unset. A band inside one tier reads that tier's
 * name, so 5.0–7.0 and 5.0–5.5 both read "High Performance"; a band that
 * ends inside High Performance from below (4.0–5.5) reads "Advanced – High
 * Performance", because 5.5 is not the top. Open-ended spans are written as
 * levelMax 7.0, never as a missing bound, because a missing bound means
 * min = max for a cohort.
 */
export function formatTierSpan(
  levelMin: number | string | null | undefined,
  levelMax: number | string | null | undefined
): string {
  const range = tierRangeForLevels(levelMin, levelMax);
  const ends = bandEnds(levelMin, levelMax);
  if (!range || !ends) return "";
  if (ends.lo <= LEVEL_MIN && ends.hi >= LEVEL_MAX) return "All levels";
  if (range.min.id === range.max.id) return range.min.name;
  if (ends.hi >= LEVEL_MAX) return `${range.min.name} and up`;
  return `${range.min.name} – ${range.max.name}`;
}

/** The tier ids a span covers, inclusive and ascending; [] when unset. */
export function tierIdsInRange(
  levelMin: number | string | null | undefined,
  levelMax: number | string | null | undefined
): TierId[] {
  const range = tierRangeForLevels(levelMin, levelMax);
  if (!range) return [];
  const ids: TierId[] = [];
  for (let id = range.min.id; id <= range.max.id; id++) ids.push(id as TierId);
  return ids;
}

/** "1.0–4.5" · "4.0" (min = max) · "" when unset. A missing bound repeats the other. */
export function formatLevelBand(
  levelMin: number | string | null | undefined,
  levelMax: number | string | null | undefined
): string {
  const ends = bandEnds(levelMin, levelMax);
  if (!ends) return "";
  return bandLabel(ends.lo, ends.hi);
}

/**
 * Numeric gate for /enroll: is this player's coach-assigned level inside the
 * cohort's [level_min, level_max] band (inclusive, missing bound = open)?
 * False when the player is unranked or the cohort has no band.
 */
export function levelWithinRange(
  level: number | string | null | undefined,
  levelMin: number | string | null | undefined,
  levelMax: number | string | null | undefined
): boolean {
  const n = toLevelNumber(level);
  const min = toLevelNumber(levelMin);
  const max = toLevelNumber(levelMax);
  if (n === null || (min === null && max === null)) return false;
  if (min !== null && n < min) return false;
  if (max !== null && n > max) return false;
  return true;
}

/**
 * Does any half step of this tier sit inside the band? True for Novice
 * against 1.0–2.0 (2.0 is in), false against 3.0–3.5. High Performance
 * (5.0–7.0) overlaps any band that reaches 5.0. False when the band is unset.
 */
export function tierOverlapsRange(
  tier: Pick<Tier, "levelMin" | "levelMax">,
  levelMin: number | string | null | undefined,
  levelMax: number | string | null | undefined
): boolean {
  const ends = bandEnds(levelMin, levelMax);
  if (!ends) return false;
  return tier.levelMax >= ends.lo && tier.levelMin <= ends.hi;
}

/**
 * The one rule for "may this player join this banded cohort" (audit M27):
 * the cohort has a band, and the player's coach-assigned level is inside it,
 * numerically and inclusive. The dashboard's "Open for your tier" list, the
 * /enroll page, /api/enroll, /api/checkout and /api/enroll/etransfer all
 * read this, so a cohort the list offers is a cohort the gate admits. Admin
 * bands may sit on half steps (3.0–3.0 is an Intermediate cohort a 3.5 player is not
 * in), which is why nothing compares whole tiers any more.
 */
export function cohortAdmitsLevel(
  level: number | string | null | undefined,
  levelMin: number | string | null | undefined,
  levelMax: number | string | null | undefined
): boolean {
  const banded = toLevelNumber(levelMin) !== null || toLevelNumber(levelMax) !== null;
  return banded && levelWithinRange(level, levelMin, levelMax);
}

/**
 * Whole-tier comparison: does the player's tier fall inside the cohort's tier
 * band? Display only. It used to drive "Open for your tier" and disagreed
 * with the numeric gate on half-step bands (audit M27); access decisions use
 * cohortAdmitsLevel.
 */
export function tierInCohortRange(
  level: number | string | null | undefined,
  levelMin: number | string | null | undefined,
  levelMax: number | string | null | undefined
): boolean {
  const tier = tierForLevel(level);
  const range = tierRangeForLevels(levelMin, levelMax);
  if (!tier || !range) return false;
  return tier.id >= range.min.id && tier.id <= range.max.id;
}

// ─── Placed state (audit L17, owner D6-B) ────────────────────────────────────
// A quiz-placed player has no coach-set level, but when the coach has put them in a
// level-banded cohort the band says where they train. The RankCard shows that
// as "Intermediate group" instead of "Unranked" — a fact, never an assessment pitch.

export type PlacedSpan = { min: number | null; max: number | null };

/**
 * The level band of a cohort this player is enrolled in, or null: when the
 * player already has a level (the rank shows instead), when they have no
 * enrollment, or when none of their cohorts is tier-gated. Enrollment rows
 * carry the player's name, not an id, so a row matches a player by name
 * (trimmed, case-insensitive); an account with one player claims every row
 * on it, the pre-household behaviour. The earliest-starting banded cohort
 * wins when there are several.
 */
export function placedSpanFor(
  player: { level: number | string | null | undefined; full_name: string | null },
  enrollments: readonly { cohort_id: string; participant_name: string | null }[],
  cohorts: readonly {
    id: string;
    startDate: string;
    levelMin?: number | string | null;
    levelMax?: number | string | null;
  }[],
  { soloAccount = false }: { soloAccount?: boolean } = {}
): PlacedSpan | null {
  if (toLevelNumber(player.level) !== null) return null;
  const name = (player.full_name ?? "").trim().toLowerCase();
  const mine = enrollments.filter((e) => {
    if (soloAccount) return true;
    const who = (e.participant_name ?? "").trim().toLowerCase();
    return name.length > 0 && who === name;
  });
  const banded = mine
    .map((e) => cohorts.find((c) => c.id === e.cohort_id))
    .filter(
      (c): c is NonNullable<typeof c> =>
        !!c && tierRangeForLevels(c.levelMin, c.levelMax) !== null
    )
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  const cohort = banded[0];
  if (!cohort) return null;
  return {
    min: toLevelNumber(cohort.levelMin ?? cohort.levelMax),
    max: toLevelNumber(cohort.levelMax ?? cohort.levelMin),
  };
}

// ─── Email emblem (audit M35, design specs §3.9) ─────────────────────────────

/**
 * The path of a tier's emblem PNG, served by src/app/tier-emblem/[slug]/
 * route.tsx (prerendered at build time). Emails prefix it with the site URL.
 */
export function tierEmblemPath(tier: Pick<Tier, "slug">): string {
  return `/tier-emblem/${tier.slug}`;
}
