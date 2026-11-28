// The site's main action (owner, 2026-11-16) and the phone bar that follows
// it, the pure half: the labels, where the bar may show and when. The button
// with its side line is src/components/ui/MainAction.tsx; the bar is
// src/components/layout/MobileJoinBar.tsx; the rules are pinned by
// src/scripts/test-layout-shell.ts.

/**
 * The main button: the lime one on every public page. Groups are open to
 * join, and every group is a bootcamp (owner, 2026-11-17: "Join a bootcamp").
 * The header, the phone menu, the phone bar, the hero, every closing, the
 * program-page panel and the 404 read this one label.
 */
export const JOIN_CTA_LABEL = "Join a bootcamp";

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
 * The areas that are not public: the dashboard, the profile, enrolling and
 * the admin. A visitor there is past choosing a group (on the enroll page
 * the page's own lime button is the next step, and the main button beside it
 * would lead away from paying), so the main button shows nowhere on them:
 * not in the header, not in the phone menu, not in the bar. A display rule
 * on the path only; who may open these pages is decided elsewhere.
 */
export const PRIVATE_AREA_PREFIXES = ["/dashboard", "/profile", "/enroll", "/admin"] as const;

/**
 * Whether a path is in one of the areas that are not public. The footer's
 * newsletter line reads it (backlog #105): a family with an account is not
 * asked for its email again, so the line shows on public pages only. An
 * unknown path (null) is treated as public.
 */
export function isPrivateAreaPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const path = (pathname.split(/[?#]/)[0] || "/").replace(/\/+$/, "") || "/";
  return PRIVATE_AREA_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

/**
 * Routes where the header and the phone menu carry no main button: the quiz
 * (its own Next button is the only primary, audit L12) and the areas that
 * are not public.
 */
export const HEADER_JOIN_HIDDEN_PREFIXES = ["/intake", ...PRIVATE_AREA_PREFIXES] as const;

/**
 * Routes where the bar never shows: everywhere the header's button is
 * hidden, and also the programs page and the program pages (the bar would
 * point at the page the visitor is on, and every group there has its own
 * button), sign-in and password flows, and the assessment booking flow.
 */
export const JOIN_BAR_HIDDEN_PREFIXES = [
  "/programs",
  "/login",
  "/auth",
  "/set-password",
  "/assessment/book",
  "/assessment/booked",
  ...HEADER_JOIN_HIDDEN_PREFIXES,
] as const;

/** True when the path is one of the prefixes or sits below one. Matches whole path segments. */
function onAnyPrefix(pathname: string, prefixes: readonly string[]): boolean {
  const path = pathname.split(/[?#]/)[0] || "/";
  return prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

/** True on routes where the header and the phone menu show the main button. */
export function headerJoinAllowedOn(pathname: string): boolean {
  return !onAnyPrefix(pathname, HEADER_JOIN_HIDDEN_PREFIXES);
}

/** True on routes where the bar may show. Matches whole path segments. */
export function joinBarAllowedOn(pathname: string): boolean {
  return !onAnyPrefix(pathname, JOIN_BAR_HIDDEN_PREFIXES);
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
