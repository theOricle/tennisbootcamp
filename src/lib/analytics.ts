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

// ─── Invite tokens out of GA (backlog #23) ────────────────────────────────────
// Invite links carry a personal token (/enroll/…?invite=<token>); Stripe
// returns carry row, invite=1 or booking= parameters. GA gets the URL with the
// invite parameter removed and the hash dropped. Every other parameter
// (utm_*, gclid, fbclid, row, booking) reaches GA byte for byte, because ad
// attribution depends on them. Pages read their own URLs untouched; only what
// GA sees is trimmed.

/** The URL without its invite parameter or hash; "" when it doesn't parse (an empty referrer). */
export function withoutInvite(url: string): string {
  try {
    const u = new URL(url);
    const kept = u.search
      .slice(1)
      .split("&")
      .filter((pair) => {
        if (!pair) return false;
        const key = pair.split("=")[0].replace(/[+]/g, " ");
        try {
          return decodeURIComponent(key) !== "invite";
        } catch {
          return key !== "invite";
        }
      });
    return u.origin + u.pathname + (kept.length ? `?${kept.join("&")}` : "");
  } catch {
    return "";
  }
}

/**
 * Inline script for the root layout, run before gtag's own config so the
 * first page_view already has the trimmed URL and referrer. Mirrors
 * withoutInvite — it has to run before the app bundle loads.
 */
export const GA_STRIP_QUERY_SCRIPT = `
window.dataLayer = window.dataLayer || [];
(function () {
  function gtag() { window.dataLayer.push(arguments); }
  function clean(u) {
    try {
      var x = new URL(u);
      var kept = x.search.slice(1).split("&").filter(function (pair) {
        if (!pair) return false;
        var key = pair.split("=")[0].replace(/[+]/g, " ");
        try { return decodeURIComponent(key) !== "invite"; } catch (e) { return key !== "invite"; }
      });
      return x.origin + x.pathname + (kept.length ? "?" + kept.join("&") : "");
    } catch (e) { return ""; }
  }
  gtag("set", {
    page_location: clean(window.location.href),
    page_referrer: clean(document.referrer)
  });
})();
`;

/**
 * After a client-side navigation (never on the first load, where the config's
 * own page_view already goes out trimmed): keep GA's location and referrer
 * trimmed for later events, and send the page_view ourselves. GA4's own
 * history-change page views are switched off in the GA4 admin, because they
 * fire before this runs and would carry the live URL or the previous page.
 */
export function setGaPageLocation(location: string, referrer: string) {
  if (typeof window === "undefined") return;
  if (!process.env.NEXT_PUBLIC_GA_ID) return;
  const page = {
    page_location: withoutInvite(location),
    page_referrer: withoutInvite(referrer),
  };
  sendGAEvent("set", page);
  sendGAEvent("event", "page_view", page);
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

// ─── Quiz-first events (backlog #22) ──────────────────────────────────────────

/**
 * A player taps a "Take the 2-minute quiz" CTA. `source` distinguishes where:
 * "hero" | "navbar" | "not-found".
 */
export function trackQuizCtaClick(source: string) {
  trackEvent("quiz_cta_click", { source });
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
