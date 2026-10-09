// The mobile sticky quiz bar (audit M13), the pure half: where it may show
// and when. The component is src/components/layout/MobileQuizBar.tsx; the
// rules are pinned by src/scripts/test-layout-shell.ts.

/** The one primary label (CLAUDE.md funnel, voice.md rule 7). */
export const QUIZ_CTA_LABEL = "Take the 2-minute quiz";

/**
 * In-page primary quiz CTAs carry this attribute. While any of them is on
 * screen the bar stays hidden, so the page never shows the CTA twice.
 */
export const QUIZ_CTA_ATTR = "data-quiz-cta";

/**
 * Routes where the bar never shows: the quiz itself, sign-in and password
 * flows, the assessment booking flow, and the signed-in areas (an account
 * holder is already past the quiz; the header shows Dashboard instead).
 */
export const QUIZ_BAR_HIDDEN_PREFIXES = [
  "/intake",
  "/login",
  "/auth",
  "/set-password",
  "/assessment/book",
  "/assessment/booked",
  "/dashboard",
  "/profile",
  "/enroll",
  "/admin",
] as const;

/** True on routes where the bar may show. Matches whole path segments. */
export function quizBarAllowedOn(pathname: string): boolean {
  const path = pathname.split(/[?#]/)[0] || "/";
  return !QUIZ_BAR_HIDDEN_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`)
  );
}

/** Scroll distance before the bar may appear, so it never covers a first paint. */
export const QUIZ_BAR_MIN_SCROLL = 64;

/**
 * Whether the bar is shown: an allowed route, a visitor who is not signed
 * in, a page scrolled past the first paint, and no in-page quiz CTA on
 * screen (on home that means the hero CTA has scrolled out).
 */
export function quizBarVisible(state: {
  allowed: boolean;
  signedIn: boolean;
  scrollY: number;
  ctaInView: boolean;
}): boolean {
  return (
    state.allowed &&
    !state.signedIn &&
    state.scrollY > QUIZ_BAR_MIN_SCROLL &&
    !state.ctaInView
  );
}
