// The site's main action (owner, 2026-11-16) and the phone bar that follows
// it, the pure half: the labels, where the bar may show and when. The button
// with its side line is src/components/ui/MainAction.tsx; the bar is
// src/components/layout/MobileJoinBar.tsx; the rules are pinned by
// src/scripts/test-layout-shell.ts.

/** The main button: the lime one on every public page. Groups are open to join. */
export const JOIN_CTA_LABEL = "Join a group";

/** Where the main button goes: the groups, on the programs page. */
export const JOIN_CTA_HREF = "/programs";

/** The group list's anchor on /programs and the program pages; there the main button scrolls to it. */
export const GROUPS_ANCHOR = "groups";

/**
 * The quiz link's one label (ops/briefs/voice.md rule 7). The quiz is the
 * side path now: "Not sure which group? Take the 2-minute quiz".
 */
export const QUIZ_CTA_LABEL = "Take the 2-minute quiz";

/** The side line's lead-in, in front of the quiz link. */
export const QUIZ_SIDE_LEAD = "Not sure which group?";

/** What a visitor who has taken the quiz reads in the side line instead. */
export const QUIZ_TAKEN_LEAD = "Your quiz answers are in.";

/**
 * In-page main buttons carry this attribute. While any of them is on screen
 * the bar stays hidden, so the page never shows the main button twice.
 */
export const MAIN_CTA_ATTR = "data-main-cta";

/**
 * Routes where the bar never shows: the programs page and the program pages
 * (the bar would point at the page the visitor is on, and every group there
 * has its own button), the quiz itself, sign-in and password flows, the
 * assessment booking flow, and the signed-in areas (the header shows
 * Dashboard there).
 */
export const JOIN_BAR_HIDDEN_PREFIXES = [
  "/programs",
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
export function joinBarAllowedOn(pathname: string): boolean {
  const path = pathname.split(/[?#]/)[0] || "/";
  return !JOIN_BAR_HIDDEN_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`)
  );
}

/** Scroll distance before the bar may appear, so it never covers a first paint. */
export const JOIN_BAR_MIN_SCROLL = 64;

/**
 * Whether the bar is shown: an allowed route, a visitor who is not signed
 * in, a page scrolled past the first paint, and no in-page main button on
 * screen (on home that means the hero's has scrolled out).
 */
export function joinBarVisible(state: {
  allowed: boolean;
  signedIn: boolean;
  scrollY: number;
  ctaInView: boolean;
}): boolean {
  return (
    state.allowed &&
    !state.signedIn &&
    state.scrollY > JOIN_BAR_MIN_SCROLL &&
    !state.ctaInView
  );
}
