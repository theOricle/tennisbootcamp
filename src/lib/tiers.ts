// Tier identity layer — a pure *display* derivation over the numeric level.
//
// The coach assigns a placement-grade numeric level on court (profiles.level and
// assessment_bookings.level_result, NTRP-style 1.0–7.0 in half steps). Tiers
// give that number a name to climb toward. Each tier spans one whole level, so a
// half step reads as progress *within* a tier: level 2.5 is "Rally · 2.5", still
// a Rally, halfway to Deuce.
//
// This module is deterministic and data-only (no JSX, no DB). Every surface that
// shows a tier derives it here — the stored value is always the number. The
// tier colour ramp (audit H6, owner D1) lives here too, as display data; the
// Tailwind class literals built from it are in src/lib/tierStyle.ts.

export type TierId = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type Tier = {
  /** Whole-number tier, 1–7. */
  id: TierId;
  /** Display name. */
  name: string;
  /** URL/CSS-safe slug. */
  slug: string;
  /** Inclusive numeric level band this tier covers, e.g. "2.0–2.5". */
  band: string;
  /** One-line coach-voiced read on what this tier means. */
  blurb: string;
  /**
   * The tier's colour in the ramp slate → lime → platinum → gold (owner D1).
   * Graphics only (emblems, pips, connectors, the RankCard rule); tier names
   * stay white text. Every value is at least 4.5:1 on the navy and on a card
   * (pinned by test-tiers.ts).
   */
  color: string;
  /** Plain-language label (owner D8). Unset until decided; renders nothing. */
  plain?: string;
};

/** The ladder, low to high. Index 0 is Love (tier 1). */
export const TIERS: readonly Tier[] = [
  {
    id: 1,
    name: "Love",
    slug: "love",
    band: "1.0–1.5",
    blurb: "First swings. You're learning the court.",
    color: "#7D8CA3",
  },
  {
    id: 2,
    name: "Rally",
    slug: "rally",
    band: "2.0–2.5",
    blurb: "You can keep the ball alive across the net.",
    color: "#AEBBCD",
  },
  {
    id: 3,
    name: "Deuce",
    slug: "deuce",
    band: "3.0–3.5",
    blurb: "Consistent strokes. Points played out, balanced play.",
    color: "#8CC63F",
  },
  {
    id: 4,
    name: "Break",
    slug: "break",
    band: "4.0–4.5",
    blurb: "You break down a rally and take control.",
    color: "#B4E655",
  },
  {
    id: 5,
    name: "Ace",
    slug: "ace",
    band: "5.0–5.5",
    blurb: "Weapons on serve and groundstrokes.",
    color: "#D2F28A",
  },
  {
    id: 6,
    name: "Match Point",
    slug: "match-point",
    band: "6.0–6.5",
    blurb: "Tournament-tested. You close matches out.",
    color: "#E6EBF0",
  },
  {
    id: 7,
    name: "Grand Slam",
    slug: "grand-slam",
    band: "7.0",
    blurb: "The top of the ladder.",
    color: "#E3C46F",
  },
] as const;

/** How many tiers there are — copy says "Tier 3 of {TIER_COUNT}". */
export const TIER_COUNT = TIERS.length;

/** The tier colours by id, derived from TIERS (one source). */
export const TIER_COLORS: Record<TierId, string> = Object.fromEntries(
  TIERS.map((t) => [t.id, t.color])
) as Record<TierId, string>;

/** The thirteen half steps a level can take, 1.0 … 7.0. */
export const LEVEL_STEPS: readonly number[] = Array.from(
  { length: 13 },
  (_, i) => 1 + i * 0.5
);

/**
 * The one level picker list for admin selects (audit M29): "3.0 · Deuce".
 * Replaces the three bare "1.0"…"7.0" arrays the admin clients used to keep.
 */
export const LEVEL_OPTIONS: readonly { value: string; label: string }[] =
  LEVEL_STEPS.map((n) => ({
    value: n.toFixed(1),
    label: `${n.toFixed(1)} · ${tierForLevel(n)?.name ?? ""}`,
  }));

/**
 * How and when a level moves (audit L18, owner D7). Null until Sina gives the
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

/**
 * The tier for a numeric level, or `null` when unranked. Floors to the whole
 * tier — 2.5 → Rally (floor(2.5) = 2) — and clamps into 1–7 so an out-of-range
 * value can never index off the ladder.
 */
export function tierForLevel(
  level: number | string | null | undefined
): Tier | null {
  const n = toLevelNumber(level);
  if (n === null) return null;
  const floored = Math.floor(n);
  const clamped = Math.min(7, Math.max(1, floored)) as TierId;
  return TIERS[clamped - 1] ?? null;
}

/** The tier by id. */
export function tierById(id: TierId): Tier {
  return TIERS[id - 1];
}

/** The tier above, or null at Grand Slam. */
export function nextTier(tier: Tier): Tier | null {
  return tier.id >= 7 ? null : TIERS[tier.id];
}

/** "Tier 3 of 7". */
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
 * "Rally · 2.5" — tier name plus the numeric level, so a player reads both where
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
  /** Which half step of the tier the player is on: x.0 is 1, x.5 is 2. */
  step: 1 | 2;
  /** Half steps in the tier: 2, or 1 at Grand Slam. */
  steps: 1 | 2;
  next: Tier | null;
  /** The level the next tier starts at, or null at the top. */
  nextLevel: number | null;
  /**
   * "Next tier: Deuce at 3.0." · "Halfway to Deuce. Next tier at 3.0." ·
   * "Top of the ladder."
   */
  caption: string;
};

/**
 * Where a level sits inside its tier and what comes next, for the RankCard
 * footer and the rail's "you are here". Null when unranked.
 */
export function tierProgress(
  level: number | string | null | undefined
): TierProgress | null {
  const tier = tierForLevel(level);
  const raw = toLevelNumber(level);
  if (!tier || raw === null) return null;
  const clamped = Math.min(7, Math.max(1, raw));
  const next = nextTier(tier);
  if (!next) {
    return {
      tier,
      level: clamped,
      step: 1,
      steps: 1,
      next: null,
      nextLevel: null,
      caption: "Top of the ladder.",
    };
  }
  const halfway = clamped - tier.id >= 0.5;
  const nextLevel = next.id;
  return {
    tier,
    level: clamped,
    step: halfway ? 2 : 1,
    steps: 2,
    next,
    nextLevel,
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

/** "Deuce" for a single-tier band, "Deuce – Break" for a spread. */
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

/** True when a span runs the whole ladder, Love to Grand Slam (min ≤ 1, max ≥ 7). */
export function coversWholeLadder(
  levelMin: number | string | null | undefined,
  levelMax: number | string | null | undefined
): boolean {
  const range = tierRangeForLevels(levelMin, levelMax);
  return !!range && range.min.id <= 1 && range.max.id >= 7;
}

/**
 * The span as words: "Deuce" · "Love – Rally" · "Break and up" (reaches the
 * top) · "All levels" (the whole ladder) · "" when unset. Open-ended spans are
 * written as levelMax 7.0, never as a missing bound, because a missing bound
 * means min = max for a cohort.
 */
export function formatTierSpan(
  levelMin: number | string | null | undefined,
  levelMax: number | string | null | undefined
): string {
  const range = tierRangeForLevels(levelMin, levelMax);
  if (!range) return "";
  if (range.min.id <= 1 && range.max.id >= 7) return "All levels";
  if (range.max.id >= 7 && range.min.id > 1) return `${range.min.name} and up`;
  return range.min.id === range.max.id
    ? range.min.name
    : `${range.min.name} – ${range.max.name}`;
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
  const a = toLevelNumber(levelMin);
  const b = toLevelNumber(levelMax);
  if (a === null && b === null) return "";
  const min = Math.min(a ?? (b as number), b ?? (a as number));
  const max = Math.max(a ?? (b as number), b ?? (a as number));
  return min === max ? min.toFixed(1) : `${min.toFixed(1)}–${max.toFixed(1)}`;
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
 * Tier gate for the dashboard "Open for your tier" list: does the player's
 * tier fall inside the cohort's tier band?
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
