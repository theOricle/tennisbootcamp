// Tier identity layer — a pure *display* derivation over the numeric level.
//
// The coach assigns a placement-grade numeric level on court (profiles.level and
// assessment_bookings.level_result, NTRP-style 1.0–7.0 in half steps). Tiers
// give that number a name to climb toward. Each tier spans one whole level, so a
// half step reads as progress *within* a tier: level 2.5 is "Rally · 2.5", still
// a Rally, halfway to Deuce.
//
// This module is deterministic and data-only (no JSX, no DB). Every surface that
// shows a tier derives it here — the stored value is always the number.

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
};

/** The ladder, low to high. Index 0 is Love (tier 1). */
export const TIERS: readonly Tier[] = [
  {
    id: 1,
    name: "Love",
    slug: "love",
    band: "1.0–1.5",
    blurb: "First swings. You're learning the court.",
  },
  {
    id: 2,
    name: "Rally",
    slug: "rally",
    band: "2.0–2.5",
    blurb: "You can keep the ball alive across the net.",
  },
  {
    id: 3,
    name: "Deuce",
    slug: "deuce",
    band: "3.0–3.5",
    blurb: "Consistent strokes, real points, balanced play.",
  },
  {
    id: 4,
    name: "Break",
    slug: "break",
    band: "4.0–4.5",
    blurb: "You break down a rally and take control.",
  },
  {
    id: 5,
    name: "Ace",
    slug: "ace",
    band: "5.0–5.5",
    blurb: "Weapons on serve and groundstrokes.",
  },
  {
    id: 6,
    name: "Match Point",
    slug: "match-point",
    band: "6.0–6.5",
    blurb: "Tournament-tested. You close matches out.",
  },
  {
    id: 7,
    name: "Grand Slam",
    slug: "grand-slam",
    band: "7.0",
    blurb: "The top of the ladder.",
  },
] as const;

/** Coerce a level that may arrive as a number, a Postgres numeric string, or null. */
function toLevelNumber(level: number | string | null | undefined): number | null {
  if (level === null || level === undefined || level === "") return null;
  const n = typeof level === "string" ? Number(level) : level;
  return Number.isFinite(n) ? n : null;
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
