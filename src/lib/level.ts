// Tentative level bands for the intake "you profile like…" reframe.
//
// The intake asks the player where they are in their journey; that self-report
// is deliberately coarse. The real, placement-grade level is assigned by the
// coach on court during the assessment — this helper only produces the
// *tentative* NTRP-style band we show alongside "you profile like a Level X
// player." Deterministic (no runtime inference), so the copy stays honest.

export type SelfLevel = "new" | "rally" | "competitive" | "elite";

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
