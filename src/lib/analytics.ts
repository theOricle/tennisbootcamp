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

// ─── Funnel-flip events (Phase 2) ─────────────────────────────────────────────

/**
 * A player taps a "Book Your Assessment" CTA. `source` distinguishes where:
 * "hero" | "navbar" | "intake-result".
 */
export function trackAssessmentCtaClick(source: string) {
  trackEvent("assessment_cta_click", { source });
}

// ─── Friction-pass events (Phase 2.6) ─────────────────────────────────────────

/**
 * Player submits the request-a-time form. `source` distinguishes why:
 * "no-slots" (grid was empty) | "prefer-direct" (secondary link).
 */
export function trackAssessmentRequestSubmit(source: string) {
  trackEvent("assessment_request_submit", { source });
}

// ─── Cohort events (Phase 3) ──────────────────────────────────────────────────
// GA fires client-side only, so server outcomes surface where the browser
// learns about them: invites from the admin screen after a successful send,
// paid/confirmed on the enrollment-confirmed page.

/** Admin sent cohort invites. */
export function trackCohortInviteSent(cohortId: string, count: number) {
  trackEvent("cohort_invite_sent", { cohort_id: cohortId, count });
}

/** An invited player completed payment (confirmed page, invite flow). */
export function trackCohortInvitePaid(cohortId: string) {
  trackEvent("cohort_invite_paid", { cohort_id: cohortId });
}

/** The cohort shows as confirmed when the payer lands on the confirmed page. */
export function trackCohortConfirmed(cohortId: string) {
  trackEvent("cohort_confirmed", { cohort_id: cohortId });
}
