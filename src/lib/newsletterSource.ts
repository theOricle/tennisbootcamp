// The newsletter sheet's source column says where a signup happened. The
// footer's one newsletter line sits on every page (backlog #69), so it
// records the page it is on: the home page and the programs page keep the
// values they recorded when each had a form of its own, so the sheet's
// history stays one series, and every other page is the footer's own value.
// A page that renders its own form names its own source
// (`program_{slug}_email_capture`, `events_email_capture`, and so on).
// Pinned by src/scripts/test-layout-shell.ts.

/** A signup on the home page. */
export const HOME_NEWSLETTER_SOURCE = "homepage_email_capture";

/** A signup on the programs page (`/programs` itself, not a program's page). */
export const PROGRAMS_NEWSLETTER_SOURCE = "programs_email_capture";

/** A signup from the footer line on any other page. */
export const FOOTER_NEWSLETTER_SOURCE = "footer_email_capture";

/**
 * The source the footer's newsletter line records on a given path. An
 * unknown path (null) is the footer's own value, never the home page's.
 */
export function footerNewsletterSource(pathname: string | null): string {
  if (pathname === null) return FOOTER_NEWSLETTER_SOURCE;
  const path = (pathname.split(/[?#]/)[0] || "/").replace(/\/+$/, "") || "/";
  if (path === "/") return HOME_NEWSLETTER_SOURCE;
  if (path === "/programs") return PROGRAMS_NEWSLETTER_SOURCE;
  return FOOTER_NEWSLETTER_SOURCE;
}
