// The quiz self-estimate and what the site may say about it (audit M17, M21;
// design specs §3.5).
//
// The quiz asks each player where their game is right now; that self-report
// is deliberately coarse. The placement-grade level is set by the coach, on
// court or when he places the player. What the site shows before then is a
// *provisional tier* (owner decision D4, 2026-10-09) — always named as
// provisional, never a level number, and nothing at all for "Not sure" or
// "Prefer not to say". Deterministic (no runtime inference), so the copy
// stays honest.

import { tierById, type Tier, type TierId } from "@/lib/tiers";

export type SelfLevel = "new" | "rally" | "competitive" | "elite";

/** A self-estimate answer: a level, "unsure", or "" (prefer not to say). */
export type SelfLevelValue = SelfLevel | "unsure" | "";

export type SelfLevelOption = {
  value: SelfLevelValue;
  /** First person, for the player answering about themselves. */
  label: string;
  /** Third person, for a parent or partner answering about someone else. */
  labelOther: string;
};

/**
 * The one self-estimate list (audit M21), shared by the quiz, the booking
 * form and the admin. "elite" is the high-performance track; every list that
 * offers it passes it through unchanged. The coach's on-court level is the
 * source of truth; this is only a starting point.
 */
export const SELF_LEVELS: readonly SelfLevelOption[] = [
  { value: "", label: "Prefer not to say", labelOther: "Prefer not to say" },
  { value: "new", label: "Just starting out", labelOther: "Just starting out" },
  { value: "rally", label: "I can rally", labelOther: "They can rally" },
  { value: "competitive", label: "I play competitively", labelOther: "They play competitively" },
  { value: "elite", label: "Elite — high-performance track", labelOther: "Elite — high-performance track" },
  { value: "unsure", label: "Not sure", labelOther: "Not sure" },
];

/** The option's words for whoever is answering. Empty for an unknown value. */
export function selfLevelLabel(value: string, { self }: { self: boolean }): string {
  const option = SELF_LEVELS.find((o) => o.value === value);
  if (!option) return "";
  return self ? option.label : option.labelOther;
}

/**
 * Tentative NTRP-style band derived from the intake self-report, or `null`
 * when the player named no level (undefined, "", "unsure" or anything
 * unmapped). The default used to be "2.5–3.0", which gave "Not sure" a
 * level it never claimed (audit M17). No surface renders this band any more
 * — the provisional tier below is what the quiz shows — but the admin and
 * older data paths still read it.
 */
export function tentativeLevelLabel(level?: string | null): string | null {
  switch (level) {
    case "new":
      return "1.5–2.0";
    case "rally":
      return "2.5–3.0";
    case "competitive":
      return "3.5–4.0";
    case "elite":
      return "4.5+";
    default:
      return null;
  }
}

/**
 * Self-estimate → provisional tier (owner decision D4, 2026-10-09):
 * new → Love, rally → Rally, competitive → Deuce, elite → Break. "competitive"
 * lands on Deuce because recommend.ts sends competitive players to High
 * Performance, whose span starts at Deuce (3.0); test-tiers.ts pins the two
 * together. An entry missing here means that answer shows no tier.
 */
export const PROVISIONAL_TIER: Partial<Record<SelfLevel, TierId>> = {
  new: 1,
  rally: 2,
  competitive: 3,
  elite: 4,
};

/**
 * The provisional tier for a self-estimate, or `null` for "", "unsure", an
 * unmapped value and undefined. Every surface that shows it says
 * "provisional" or "likely" beside the name.
 */
export function provisionalTierFor(value: string | null | undefined): Tier | null {
  const level = selfEstimateToLevel(value);
  if (!level) return null;
  const id = PROVISIONAL_TIER[level];
  return id === undefined ? null : tierById(id);
}

/**
 * The per-person self-estimate select → the level the recommender and the
 * Sheet speak. "Not sure" and "Prefer not to say" name no level, and the
 * player is placed by the coach like everyone else.
 */
export function selfEstimateToLevel(
  value: string | null | undefined
): SelfLevel | undefined {
  return value === "new" ||
    value === "rally" ||
    value === "competitive" ||
    value === "elite"
    ? value
    : undefined;
}
