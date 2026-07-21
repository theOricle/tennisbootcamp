import { sendGAEvent } from "@next/third-parties/google";

/**
 * Fire a GA4 event. No-ops in dev/test when NEXT_PUBLIC_GA_ID is unset,
 * and when called outside a browser context.
 */
export function trackEvent(
  name: string,
  params?: Record<string, string | number | boolean>
) {
  if (typeof window === "undefined") return;
  if (!process.env.NEXT_PUBLIC_GA_ID) return;
  sendGAEvent("event", name, params ?? {});
}

// ─── Assessment funnel events (Phase 1) ───────────────────────────────────────

/** Player submits the assessment booking form. */
export function trackAssessmentBookStart() {
  trackEvent("assessment_book_start");
}

/** Booking confirmed (payment complete or free-mode). */
export function trackAssessmentBookComplete() {
  trackEvent("assessment_book_complete");
}

/** Admin marks a booking complete with a level. */
export function trackAssessmentCompletedAdmin() {
  trackEvent("assessment_completed_admin");
}
