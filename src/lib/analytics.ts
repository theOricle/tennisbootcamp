/** Push one gtag command as a real `arguments` object, the shape gtag.js reads off the dataLayer. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function push(..._args: unknown[]) {
  const w = window as unknown as { dataLayer?: unknown[] };
  w.dataLayer = w.dataLayer || [];
  // eslint-disable-next-line prefer-rest-params
  w.dataLayer.push(arguments);
}

let locationTrimmed = false;

/**
 * Push a gtag command. The first one this module sends is preceded by a
 * trimmed `set` (page_location and page_referrer without invite): the
 * bootstrap runs afterInteractive, so a child effect such as enroll_start can
 * queue an event before the bootstrap's own trim lands.
 */
function gtag(...args: unknown[]) {
  if (!locationTrimmed) {
    locationTrimmed = true;
    push("set", {
      page_location: withoutInvite(window.location.href),
      page_referrer: withoutInvite(document.referrer),
    });
  }
  push(...args);
}

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
  gtag("event", name, params ?? {});
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
 * Trims GA's page_location and page_referrer; gaInitScript runs it before
 * gtag's config so the first page_view already has the trimmed URL. Mirrors
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
 * The whole GA bootstrap as one inline script: trim, then js, then config.
 * One script, so the trim always lands before the config's page_view. A
 * separate beforeInteractive script was skipped on notFound() pages (an
 * invite link to a started, full or cancelled cohort), and the config then
 * sent the token.
 */
export function gaInitScript(gaId: string): string {
  return `${GA_STRIP_QUERY_SCRIPT}
(function () {
  function gtag() { window.dataLayer.push(arguments); }
  gtag("js", new Date());
  gtag("config", ${JSON.stringify(gaId)});
})();
`;
}

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
  gtag("set", page);
  gtag("event", "page_view", page);
}

// ─── Enrollment events ────────────────────────────────────────────────────────

/**
 * Player opens the enroll wizard. Carries its own trimmed page_location: on an
 * in-site link this effect runs before AnalyticsPageLocation's, so GA's `set`
 * still holds the previous page. The invite token never goes with it.
 */
export function trackEnrollStart(cohortId: string, program: string) {
  if (typeof window === "undefined") return;
  trackEvent("enroll_start", {
    cohort_id: cohortId,
    program,
    page_location: withoutInvite(window.location.href),
  });
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

type CountStore = Pick<Storage, "getItem" | "setItem">;

/**
 * True the first time a booking id is seen in this browser, false after, so a
 * reload or a revisit of /assessment/booked never counts the booking twice
 * (audit L13). No id, no count: a direct visit is not a booking. Storage that
 * throws (private mode) counts once per page load.
 */
export function firstSightOfBooking(bookingId: string | null | undefined, store: CountStore | null): boolean {
  if (!bookingId) return false;
  const key = `tb-booking-counted:${bookingId}`;
  try {
    if (store?.getItem(key)) return false;
    store?.setItem(key, "1");
  } catch {
    // Storage blocked: fall through and count it.
  }
  return true;
}

/** Admin marks a booking complete with a level. */
export function trackAssessmentCompletedAdmin() {
  trackEvent("assessment_completed_admin");
}

// ─── Funnel-flip events (Phase 2) ─────────────────────────────────────────────

/**
 * A player taps a "Book Your Assessment" CTA. `source` distinguishes where
 * (audit L13): "intake-result" | "program-detail" | "assessment-price" |
 * "assessment-closing".
 */
export function trackAssessmentCtaClick(source: string) {
  trackEvent("assessment_cta_click", { source });
}

// ─── Quiz-first events (backlog #22) ──────────────────────────────────────────

/**
 * A player taps a "Take the 2-minute quiz" CTA. `source` distinguishes where
 * (audit L13): "hero" | "navbar" | "not-found" | "program-detail" |
 * "assessment-page" | a QuizBand's own source ("home-closing", "program-closing").
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
