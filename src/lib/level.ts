// Tentative level bands for the intake "you profile like…" reframe.
//
// The intake asks the player where they are in their journey; that self-report
// is deliberately coarse. The real, placement-grade level is assigned by the
// coach on court during the assessment — this helper only produces the
// *tentative* NTRP-style band we show alongside "you profile like a Level X
// player." Deterministic (no runtime inference), so the copy stays honest.

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

/** Tentative NTRP-style band derived from the intake self-report. */
export function tentativeLevelLabel(level?: string): string {
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
      return "2.5–3.0";
  }
}

/**
 * The per-person self-estimate select → the level the recommender and the
 * Sheet speak. "Not sure" and "Prefer not to say" name no level, and the
 * player is placed on court like everyone else.
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
