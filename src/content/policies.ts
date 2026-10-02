// Interim Program Policies (backlog #2a) — the configurable values rendered by
// /legal/refund-policy and echoed in the enroll wizard. Change a number here and
// both surfaces move together.

/** No-reason cancellation window, in days, with no fee of any kind inside it. */
export const COOLING_OFF_DAYS = 10;

/** Administration fee (CAD) on a refund after the cooling-off window, 7+ days out. */
export const ADMIN_FEE_CAD = 25;

/** Make-up weeks appended after the final week for fall 2026 cohorts (season closes Nov 15). */
export const MAKEUP_WEEKS_FALL_2026 = 0;

/** Make-up weeks appended after the final week for every other cohort. */
export const MAKEUP_WEEKS_DEFAULT = 2;

/** How long the $20 assessment credit stays valid, in months. */
export const ASSESSMENT_CREDIT_MONTHS = 12;

/** Date these policies take effect. Must equal the date the change merges. */
export const EFFECTIVE_DATE = "October 5, 2026";
