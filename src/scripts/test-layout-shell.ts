// Run from project root: npx tsx src/scripts/test-layout-shell.ts
//
// Pins audit PR C (2026-10-09, "Layout shell, navigation, footer, CTA
// hierarchy and hero"): one Container rule (H2), the Kids' Camp notify form
// (H8), header and footer navigation (M11, L5, L6, L21), the CTA weights and
// placement (M12, M13), the hero size and motion (M14, M15), the Card and
// Heading primitives (L1) and the header band fade (L2), as rebuilt for the
// simpler site (backlog #69, owner 2026-11-16 and 2026-11-17): the main
// button is "Join a bootcamp" (backlog #70; it was "Join a group"), the quiz
// is its side line, the top menu is Programs and About, and the footer opens
// with the one newsletter line. Since backlog #70 the home page's band under
// the hero is three points about what a bootcamp is, and the page shows no
// price.
// The phone bar's rules are tested as pure functions; the rest are source
// checks, since the repo has no DOM test runner. Horizontal overflow is
// checked in a browser by `npm run check:overflow`
// (src/scripts/check-overflow.ts). Exits non-zero on any failure.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  GROUPS_ANCHOR,
  HEADER_JOIN_HIDDEN_PREFIXES,
  JOIN_BAR_HIDDEN_PREFIXES,
  JOIN_BAR_MIN_SCROLL,
  JOIN_CTA_HREF,
  JOIN_CTA_LABEL,
  MAIN_CTA_ATTR,
  PRIVATE_AREA_PREFIXES,
  QUIZ_CTA_LABEL,
  QUIZ_SIDE_LEAD,
  QUIZ_TAKEN_LEAD,
  headerJoinAllowedOn,
  joinBarAllowedOn,
  joinBarVisible,
} from "../lib/mainAction";
import {
  FOOTER_NEWSLETTER_SOURCE,
  HOME_NEWSLETTER_SOURCE,
  PROGRAMS_NEWSLETTER_SOURCE,
  footerNewsletterSource,
} from "../lib/newsletterSource";
import { FOOTER_GROUPS, NAV_LINKS, NEWSLETTER_ANCHOR, site } from "../content/site";
import { CONTAINER_CLASS, SECTION_RHYTHM_CLASS } from "../components/layout/Container";
import { CARD_CLASS } from "../components/ui/Card";
import { HEADING_CLASS } from "../components/ui/Heading";

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    console.log(`  ✓ ${name}`);
  } else {
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
/** Index of `needle` in `hay`, or Infinity, so "a before b" fails when a is missing. */
const at = (hay: string, needle: string) => {
  const i = hay.indexOf(needle);
  return i === -1 ? Infinity : i;
};

// ── The main action (owner, 2026-11-16) ─────────────────────────────────────
console.log("The main action: Join a bootcamp, the quiz as a side line");
check("the main button reads Join a bootcamp and goes to /programs", JOIN_CTA_LABEL === "Join a bootcamp" && JOIN_CTA_HREF === "/programs");
// Owner, 2026-11-17: the label changed, so nothing may still type the old one (or the new one) beside the setting.
{
  const typed = [
    "src/components/layout/Navbar.tsx",
    "src/components/layout/MobileJoinBar.tsx",
    "src/components/ui/MainAction.tsx",
    "src/components/sections/Hero.tsx",
    "src/components/sections/JoinClosing.tsx",
    "src/app/not-found.tsx",
    "src/app/programs/[slug]/page.tsx",
    "src/app/about/page.tsx",
    "src/app/locations/page.tsx",
    "src/app/page.tsx",
  ].filter((file) => {
    // Comments may name the label; markup and strings may not.
    const code = read(file).replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g, "");
    return /Join a (group|bootcamp)/.test(code);
  });
  check("every surface reads the label from the one setting: none types it", typed.length === 0, typed.join(", "));
}
check("the quiz link's label is unchanged", QUIZ_CTA_LABEL === "Take the 2-minute quiz");
check("the side line asks, then links: Not sure which group?", QUIZ_SIDE_LEAD === "Not sure which group?");
check("a quiz-taker's side line says their answers are in", QUIZ_TAKEN_LEAD === "Your quiz answers are in.");
const mainAction = read("src/components/ui/MainAction.tsx");
check("one component: the lime button with the main label, marked for the bar", mainAction.includes('variant="primary"') && mainAction.includes("{JOIN_CTA_LABEL}") && mainAction.includes("data-main-cta") && mainAction.includes("href = JOIN_CTA_HREF"));
check("then the side line: the lead, and the quiz link with its locked label", mainAction.includes("{QUIZ_SIDE_LEAD} {link}") && mainAction.includes("{QUIZ_CTA_LABEL}") && mainAction.includes('track="quiz"'));
check("the side line keeps the quiz-taken behaviour: QuizSwap, the answers-are-in line, the quiz-aware link", mainAction.includes("<QuizSwap") && mainAction.includes("{QUIZ_TAKEN_LEAD} {link}") && !mainAction.includes("quizAware={false}"));
check("the main button never wraps", mainAction.includes('className="whitespace-nowrap" data-main-cta'));
check("the quiz is never a lime button in the main action", (mainAction.match(/variant="primary"/g) ?? []).length === 1);
// Fix round, 2026-11-17: the side line broke inside its link on phones ("quiz" alone on a line), and the link was an 18px target.
check("the lime link in a sentence never breaks inside itself, so a break falls between the question and the link", mainAction.includes('const LIME_LINK_TEXT = "whitespace-nowrap rounded font-semibold text-[#B4E655]') && mainAction.includes("export const INLINE_LIME_LINK = `${LIME_LINK_TEXT} ${FOCUS_RING}`;"));
const sideLineLink = mainAction.slice(at(mainAction, "export const PADDED_INLINE_LINK ="), at(mainAction, "export function QuizSideLine"));
check("the side line's link is a 44px target by inline padding, which cannot move the line", /export const PADDED_INLINE_LINK =\s+"relative py-\[13px\] focus:outline-none "/.test(sideLineLink) && sideLineLink.includes("const SIDE_LINE_LINK = `${LIME_LINK_TEXT} ${PADDED_INLINE_LINK}`;") && mainAction.includes('<TrackedLink href={quizHref} track="quiz" source={source} className={SIDE_LINE_LINK}>') && !/inline-flex|inline-block|min-h-|\bblock\b/.test(sideLineLink));
check("its focus ring is the one ring, drawn inside the padding so it hugs the words", ["after:absolute", "after:inset-x-0", "after:inset-y-[13px]", "after:content-['']", "after:pointer-events-none", "focus-visible:after:ring-2", "focus-visible:after:ring-[#B4E655]/50", "focus-visible:after:ring-offset-2", "focus-visible:after:ring-offset-[#061427]"].every((c) => sideLineLink.includes(c)));

// ── Phone bar rules (M13) ───────────────────────────────────────────────────
console.log("Phone bar (M13): it follows the main button");
check("in-page main button marker", MAIN_CTA_ATTR === "data-main-cta");
for (const path of ["/intake", "/intake/", "/login", "/auth/forgot-password", "/auth/callback", "/assessment/book", "/dashboard", "/admin/cohorts/123", "/enroll/abc", "/profile", "/set-password"]) {
  check(`hidden on ${path}`, !joinBarAllowedOn(path));
}
// Never on /programs or below it: the bar would point at the page the visitor is on.
for (const path of ["/programs", "/programs/", "/programs/youth-programs", "/programs/private-lessons", "/programs?age=14&level=intermediate"]) {
  check(`hidden on ${path}`, !joinBarAllowedOn(path));
}
for (const path of ["/", "/about", "/locations", "/assessment", "/legal/privacy", "/intake-guide", "/administration", "/programs-guide"]) {
  check(`allowed on ${path}`, joinBarAllowedOn(path));
}
check("query strings do not defeat the route rule", !joinBarAllowedOn("/intake?program=bootcamps"));
for (const required of ["/programs", "/intake", "/login", "/auth", "/assessment/book"]) {
  check(`route ${required} is in the hidden list`, (JOIN_BAR_HIDDEN_PREFIXES as readonly string[]).includes(required));
}
// The header's main button (fix round, 2026-11-17): hidden inside the quiz
// and on the pages that are not public, from the one list the bar reads too.
// A rule on the path only: nothing here knows who is signed in.
console.log("The header's main button: one path rule, shared with the bar");
for (const path of ["/enroll", "/enroll/abc", "/enroll/abc/confirmed", "/dashboard", "/profile", "/admin", "/admin/cohorts/123", "/intake", "/intake/", "/intake?program=bootcamps"]) {
  check(`header button hidden on ${path}`, !headerJoinAllowedOn(path));
}
for (const path of ["/", "/programs", "/programs/youth-programs", "/programs?age=14&level=intermediate", "/about", "/locations", "/assessment", "/assessment/book", "/login", "/legal/privacy", "/enrollment", "/dashboards", "/administration", "/intake-guide"]) {
  check(`header button shown on ${path}`, headerJoinAllowedOn(path));
}
check("the pages that are not public: the dashboard, the profile, enrolling and the admin", [...PRIVATE_AREA_PREFIXES].sort().join("|") === "/admin|/dashboard|/enroll|/profile");
check("the header hides it on those and inside the quiz, and nowhere else", [...HEADER_JOIN_HIDDEN_PREFIXES].sort().join("|") === "/admin|/dashboard|/enroll|/intake|/profile");
check("one list, not two: the bar hides everywhere the header's button does", HEADER_JOIN_HIDDEN_PREFIXES.every((prefix) => (JOIN_BAR_HIDDEN_PREFIXES as readonly string[]).includes(prefix)) && new Set(JOIN_BAR_HIDDEN_PREFIXES).size === JOIN_BAR_HIDDEN_PREFIXES.length);
{
  const rule = read("src/lib/mainAction.ts");
  check("…because the bar's list is built from the header's, and the header's from the private areas", rule.includes('export const HEADER_JOIN_HIDDEN_PREFIXES = ["/intake", ...PRIVATE_AREA_PREFIXES] as const;') && /export const JOIN_BAR_HIDDEN_PREFIXES = \[[^\]]*\.\.\.HEADER_JOIN_HIDDEN_PREFIXES,\s*\] as const;/.test(rule));
  check("the rule reads the path and nothing else: no sign-in, session or role", !/signedIn|isAdmin|useAuthState|supabase|cookie/i.test(rule.slice(rule.indexOf("export const PRIVATE_AREA_PREFIXES"), rule.indexOf("/** Scroll distance"))));
}

const base = { allowed: true, signedIn: false, scrollY: JOIN_BAR_MIN_SCROLL + 400, ctaInView: false };
check("shows once the page's main button has scrolled out", joinBarVisible(base));
check("hidden while an in-page main button is on screen", !joinBarVisible({ ...base, ctaInView: true }));
check("hidden at the top of the page", !joinBarVisible({ ...base, scrollY: 0 }));
check("hidden for a signed-in visitor", !joinBarVisible({ ...base, signedIn: true }));
check("hidden on a disallowed route", !joinBarVisible({ ...base, allowed: false }));

const bar = read("src/components/layout/MobileJoinBar.tsx");
check("bar is phones only", bar.includes("md:hidden"));
check("bar uses the route rule and the visibility rule", bar.includes("joinBarAllowedOn(") && bar.includes("joinBarVisible("));
check("bar watches in-page main buttons with an IntersectionObserver", bar.includes("IntersectionObserver") && bar.includes("MAIN_CTA_ATTR"));
check("bar is inert while hidden", bar.includes("inert={!show}"));
check("bar respects the safe area", bar.includes("safe-area-inset-bottom"));
check("bar carries the main button, read from the setting, to /programs", bar.includes('<Button variant="primary" href={JOIN_CTA_HREF} className="w-full">') && bar.includes("{JOIN_CTA_LABEL}") && !bar.includes("QUIZ_CTA_LABEL"));
check("root layout mounts the bar", read("src/app/layout.tsx").includes("<MobileJoinBar />"));

// ── One Container rule (H2) ─────────────────────────────────────────────────
console.log("One Container rule (H2)");
check("Container is mx-auto max-w-6xl px-6", ["mx-auto", "max-w-6xl", "px-6"].every((c) => CONTAINER_CLASS.split(" ").includes(c)));
check("one vertical rhythm", SECTION_RHYTHM_CLASS === "py-12 md:py-16");
check("PageStack uses the Container and the rhythm", /<Container[^>]*SECTION_RHYTHM_CLASS/.test(read("src/components/layout/PageStack.tsx")));
const SECTIONS = [
  "src/components/sections/ProgramsGrid.tsx",
  "src/components/sections/ProgramCard.tsx",
  "src/components/sections/ProgramGroupCard.tsx",
  "src/components/sections/LevelsStrip.tsx",
  "src/components/sections/HowJoiningWorks.tsx",
  "src/components/sections/WhereAndWho.tsx",
  "src/components/sections/GoodToKnow.tsx",
  "src/components/sections/JoinClosing.tsx",
  "src/components/sections/BootcampClass.tsx",
  "src/components/sections/EventsList.tsx",
  "src/components/sections/EmailCapture.tsx",
  "src/components/sections/ProgramInterestForm.tsx",
];
for (const file of SECTIONS) {
  const src = read(file);
  const offenders = ["mx-auto", "max-w-5xl", "max-w-6xl", "px-6", "-mx-"].filter((c) => new RegExp(`(^|[\\s"'\`])${c.replace(/[-]/g, "\\-")}`).test(src));
  check(`${file.split("/").pop()} sets no gutter or page width`, offenders.length === 0, offenders.join(", "));
}

// The home page's band of three points (backlog #70) is full-bleed: it
// paints its hairlines edge to edge and puts the one Container inside.
const pointsBand = read("src/components/sections/BootcampPoints.tsx");
check("the points band puts the Container inside, and sets no gutter or page width of its own", pointsBand.includes("<Container>") && pointsBand.includes('className="border-y border-white/10"') && !/(^|[\s"'`])(mx-auto|max-w-6xl|px-6|-mx-)/.test(pointsBand));
// The Tennis and Fitness graphic moved to About (backlog #70), into that
// page's section: it is no band any more, so it holds no Container.
const classGraphic = read("src/components/sections/BootcampClass.tsx");
check("the Tennis and Fitness graphic sits in its page's Container: none of its own, no gutter, no page width, no band hairlines", !classGraphic.includes("<Container") && !classGraphic.includes("border-y") && !/(^|[\s"'`])(mx-auto|max-w-6xl|px-6|-mx-)/.test(classGraphic));

const programsPage = read("src/app/programs/page.tsx");
const catalog = read("src/components/sections/ProgramCatalog.tsx");
check("/programs is the catalog, then Good to know in the page Container", /<ProgramCatalog[\s\S]*<Container[^>]*>\s*<GoodToKnow/.test(programsPage));
check("/programs has no second 'Programs' heading and no grid of its own", !programsPage.includes("<ProgramsGrid") && !programsPage.includes('title="Our Programs"'));
check("/programs does not link to itself", !programsPage.includes('href="/programs"'));
check("/programs renders no newsletter form of its own: the footer's line is the one", !programsPage.includes("<EmailCapture"));
check("/programs header band uses the Container (the catalog draws it, with the filters inside)", /tb-gradient[\s\S]*<Container/.test(catalog));
check("the groups sit in the one Container, under the anchor the main button scrolls to", catalog.includes("<Container id={GROUPS_ANCHOR}") && GROUPS_ANCHOR === "groups");
// Second fix round, 2026-11-17: the program title's 44px target drew its ring around the padding, through the line under it.
check("a program title is a 44px target whose focus ring hugs the words: the side line's padded inline link, not a second copy", catalog.includes("className={`underline-offset-4 hover:underline ${PADDED_INLINE_LINK}`}") && !catalog.includes("py-2.5") && !catalog.includes("after:inset-y-"));
check("the catalog sets no gutter or page width of its own", !/(^|[\s"'`])(mx-auto|max-w-6xl|px-6|-mx-)/.test(catalog));
check("/programs: no lime button in the band (the main button is the header's)", !programsPage.includes('variant="primary"') && !catalog.includes('variant="primary"') && !catalog.includes('buttonClass("primary")'));

const home = read("src/app/page.tsx");
// Owner, 2026-11-17 (backlog #70): the band of three points comes straight
// after the hero, between it and the programs; then the programs, first in
// the page's Container (owner, 2026-10-13: "people want to see the programs
// first"). The band is the hero's sibling, never inside it.
check(
  "home: the three points come straight after the hero, then the programs, first in the Container",
  // Only JSX comments may sit between them; a comment never runs past its own "*/".
  /<Hero \/>\s*(\{\/\*(?:(?!\*\/)[\s\S])*\*\/\}\s*)*<BootcampPoints \/>\s*(\{\/\*(?:(?!\*\/)[\s\S])*\*\/\}\s*)*<Container[^>]*>\s*<ProgramsGrid/.test(home)
);
check("home: the Tennis and Fitness graphic left the page (it is on About), and the hero does not hold the band", !home.includes("BootcampClass") && !read("src/components/sections/Hero.tsx").includes("BootcampPoints"));
check("home: programs, how joining works, where and who, events, the closing, in that order", at(home, "<ProgramsGrid") < at(home, "<HowJoiningWorks") && at(home, "<HowJoiningWorks") < at(home, "<WhereAndWho") && at(home, "<WhereAndWho") < at(home, "<EventsList") && at(home, "<EventsList") < at(home, "<JoinClosing"));
check("home: closes on the main action (M13)", /<JoinClosing source="home-closing" \/>\s*<\/Container>\s*<\/main>/.test(home));
check("home: no newsletter form of its own: the footer's line is the one (M12)", !home.includes("<EmailCapture"));
check("home: what left the page stays off it", ["<TrustBar", "<TierBand", "<LocationSection", "<Coaches", "<QuizBand"].every((tag) => !home.includes(tag)));
check("home: no nested gutter section", !home.includes('className="mx-auto max-w-6xl px-6"'));

const grid = read("src/components/sections/ProgramsGrid.tsx");
// Backlog #70 (owner, 2026-11-17): the line under the heading ("Group bootcamps run one … class a week, in … cohorts.") went, and nothing replaced it.
check("home programs: the heading, then the cards straight under it: no line between, no class length, no classes a week", /<Heading id="programs-grid-title">Our Programs<\/Heading>\s*<div className="mt-\[18px\] md:mt-6">\s*<ProgramCardList/.test(grid) && !grid.includes("<p") && !/SESSION_MINUTES|COHORT_LENGTH|a week|minute/.test(grid));
check("home programs: the compact cards, then the five levels as a strip under them", grid.includes('<ProgramCardList programs={programs} variant="compact" />') && at(grid, "<ProgramCardList") < at(grid, "<LevelsStrip"));
check("home programs: no Browse Programs link and no quiz line (the main action carries both)", !grid.includes("Browse Programs") && !grid.includes("QUIZ_CTA_LABEL") && !grid.includes("getPublicCohorts"));

const detail = read("src/app/programs/[slug]/page.tsx");
check("detail: one Container, no max-w-5xl edge", !detail.includes("max-w-5xl") && detail.includes("<Container"));
check("detail: no negative-margin gutter hack", !detail.includes("-mx-6"));
check("detail: breadcrumb is a labelled nav", /<Container\s+as="nav"\s+aria-label="Breadcrumb"/.test(detail));
check("detail: breadcrumb marks the current page", detail.includes('aria-current="page"'));
check("detail: breadcrumb separator is hidden", /<li aria-hidden="true"[^>]*>›<\/li>/.test(detail));

// ── H8: the notify form (no coming-soon program lists it since 2026-10-12) ──
console.log("Notify form (H8)");
check("detail: no notify form while no listed program is coming soon", !detail.includes("<ProgramInterestForm"));
check("detail: the warning triangle is gone", !detail.includes("M12 9v4m0 4h.01"));
const pif = read("src/components/sections/ProgramInterestForm.tsx");
check("field can shrink (min-w-0)", pif.includes("min-w-0"));
check("field has a label tied by useId", pif.includes("useId()") && pif.includes("htmlFor={inputId}") && pif.includes("sr-only"));
check("field has name, autocomplete and email keyboard", pif.includes('name="email"') && pif.includes('autoComplete="email"') && pif.includes('inputMode="email"'));
check("field is 16px on phones (no iOS zoom)", / text-base /.test(pif) && pif.includes("md:text-sm"));
check("row stacks on phones", pif.includes("flex-col gap-3 sm:flex-row"));
check("button never shrinks or wraps", pif.includes("shrink-0 whitespace-nowrap"));
check("button is the outline secondary (M12)", pif.includes('buttonClass("secondary")') && !pif.includes("bg-[#B4E655]"));
const botCheck = read("src/lib/useBotCheck.tsx");
check("honeypot id is per form (useId)", botCheck.includes("useId()") && !botCheck.includes("bot-check-${HONEYPOT_FIELD}"));

// ── M12: CTA weights ────────────────────────────────────────────────────────
console.log("CTA weights (M12)");
const capture = read("src/components/sections/EmailCapture.tsx");
check("newsletter button is the outline secondary", capture.includes('buttonClass("secondary")') && !capture.includes("bg-[#B4E655]"));
check("newsletter takes a source prop and sends it", /source\s*:\s*string/.test(capture) && capture.includes("JSON.stringify({ email, source,"));
check("newsletter field id is per form", capture.includes("useId()") && !capture.includes('id="email-capture"'));
check("newsletter button never wraps", capture.includes("shrink-0 whitespace-nowrap"));
check("every EmailCapture call names its source", ["src/components/layout/FooterNewsletter.tsx", "src/app/programs/[slug]/page.tsx", "src/app/events/page.tsx", "src/app/video-lessons/page.tsx"].every((f) => read(f).includes("<EmailCapture") && !read(f).includes("<EmailCapture />") && /<EmailCapture[^>]*source=/.test(read(f))));
check("detail: Book Your Assessment is an outline pill", /<(?:Tracked)?Button\s+variant="secondary"\s+href="\/assessment\/book"[^>]*>\s*Book Your Assessment\s*<\/(?:Tracked)?Button>/.test(detail));
check("detail: no 'Or Book Your Assessment' grey link", !detail.includes("Or Book Your Assessment"));
// QA 2026-10-10: /assessment hand-rolled two lime pills, the quiz CTA's style.
const assessmentPage = read("src/app/assessment/page.tsx");
check("/assessment: both Book Your Assessment buttons are outline pills", (assessmentPage.match(/<(?:Tracked)?Button\s+variant="secondary"\s+href="\/assessment\/book"[^>]*>\s*Book Your Assessment\s*<\/(?:Tracked)?Button>/g) ?? []).length === 2);
check("detail: closes on the main action (M13), to this page's group list and this program's quiz", detail.includes('<JoinClosing className="mt-12" source="program-closing" quizHref={quizHref} href={groupListHref} />'));
check("detail: the panel's lime button is the main button, to the page's own group list, marked for the bar", /<Button variant="primary" href=\{groupListHref\}[^>]*data-main-cta>\s*\{JOIN_CTA_LABEL\}/.test(detail) && detail.includes("const groupListHref = scheduledGroups.length > 0 ? `#${GROUPS_ANCHOR}` : undefined;") && detail.includes("<h2 id={GROUPS_ANCHOR}"));
check("detail: the quiz side line sits under it, for this program", /\{JOIN_CTA_LABEL\}\s*<\/Button>\s*<QuizSideLine source="program-detail" quizHref=\{quizHref\}/.test(detail));
// Re-pinned for backlog #103: the lime button asks about lessons by email (it opened the quiz for the program until then).
check("detail: a program booked by arrangement asks about lessons on the lime button, by email", /<TrackedButton\s+variant="primary"\s+href=\{ASK_ABOUT_LESSONS_HREF\}\s+track="lessons"\s+source="program-detail"[^>]*data-main-cta\s*>\s*Ask about lessons/.test(detail));
check("detail: no lime quiz button", !detail.includes("data-quiz-cta") && !/variant="primary"[^>]*>\s*Take the 2-minute quiz/.test(detail));
const button = read("src/components/ui/Button.tsx");
check("one primary hover (brightness-110)", button.includes('primary: "bg-[#B4E655] text-[#061427] hover:brightness-110"'));
check("buttons are 44px or taller", button.includes("min-h-[44px]"));
const notFound = read("src/app/not-found.tsx");
check("404: the main action is the lime primary, the quiz its side line", notFound.includes('<MainAction source="not-found"') && !/variant="primary"/.test(notFound) && !notFound.includes('href="/intake"'));
check("404: links sit in a nav", notFound.includes('<nav aria-label="Helpful links"'));
const closing = read("src/components/sections/JoinClosing.tsx");
check("the closing: one line, then the main action", closing.includes(">Groups are open to join.</Heading>") && closing.includes("<MainAction source={source} quizHref={quizHref} href={href} />") && !closing.includes("bg-[#B4E655]"));
check("the locations page closes on it too", read("src/app/locations/page.tsx").includes('<JoinClosing source="locations-closing" />'));

// ── M11, L5, L6, L21: navigation and footer ─────────────────────────────────
console.log("Navigation and footer (M11, L5, L6, L21)");
const navHrefs = NAV_LINKS.map((l) => l.href);
// Owner, 2026-11-16: the top menu is Programs and About; Locations and Assessment live in the footer.
check("header links: Programs and About, and nothing else", NAV_LINKS.map((l) => `${l.label}:${l.href}`).join("|") === "Programs:/programs|About:/about");
check("no Events or Video Lessons in the nav (D24)", !navHrefs.some((h) => h === "/events" || h === "/video-lessons"));
const navbar = read("src/components/layout/Navbar.tsx");
check("header renders NAV_LINKS", navbar.includes("NAV_LINKS"));
check("Admin link only for admins (L21)", /isAdmin\s*\?\s*\[\.\.\.NAV_LINKS,\s*\{\s*href:\s*"\/admin"/.test(navbar));
check("drawer stays mounted (aria-controls resolves)", navbar.includes('id="mobile-menu"') && navbar.includes("inert={!menuOpen}") && !navbar.includes("{menuOpen && ("));
check("drawer has a backdrop", /aria-hidden="true"\s+onClick=\{\(\) => closeMenu\(true\)\}/.test(navbar));
check("Escape closes the drawer and returns focus", navbar.includes('e.key === "Escape"') && navbar.includes("toggleRef.current?.focus()"));
check("focus moves into the drawer on open", navbar.includes("firstLinkRef.current?.focus()"));
check("outside taps use pointerdown", navbar.includes('"pointerdown"') && !navbar.includes('"mousedown"'));
check("page scroll locks while the drawer is open", navbar.includes('html.style.overflow = "hidden"'));
// QA 2026-10-10 (high): a body lock made body the sticky header's scroll
// container, so after a scroll the open menu sat off-screen. Root only; the
// runtime check (header at top 0, menu open, after a scroll) is in
// check-overflow.ts.
check("the lock is on the root only, never on body", !navbar.includes("document.body.style.overflow"));
check("header is solid navy from the top, no blur", navbar.includes("bg-[#061427]") && !navbar.includes("backdrop-blur"));
check("current page is marked", navbar.includes("aria-current={current}"));
check("header and phone menu carry the main button, signed in or not, never a quiz button", (navbar.match(/\{JOIN_CTA_LABEL\}/g) ?? []).length === 2 && !navbar.includes("QUIZ_CTA_LABEL") && !navbar.includes('track="quiz"'));
check("on /programs the main button scrolls to the group list instead of reloading the page", navbar.includes("const joinHref = pathname === JOIN_CTA_HREF ? `#${GROUPS_ANCHOR}` : JOIN_CTA_HREF;") && (navbar.match(/href=\{joinHref\}/g) ?? []).length === 2);
// Fix round, 2026-11-17: on /enroll the header's lime button sat beside the page's own and led away from paying.
check("inside the quiz and on the pages that are not public, neither carries it: both read the one path rule", navbar.includes("const showJoin = headerJoinAllowedOn(pathname);") && (navbar.match(/\{showJoin && \(/g) ?? []).length === 2 && (navbar.match(/showJoin/g) ?? []).length === 3 && !navbar.includes("inQuiz"));
check("the header keeps no route list of its own", !/startsWith\("\//.test(navbar) && !/pathname === "\/(intake|enroll|dashboard|profile|admin)/.test(navbar));
check("the header logo is a 44px target", navbar.includes('<Link href="/" className={`flex min-h-[44px] shrink-0 items-center rounded-lg ${FOCUS}`}>'));
check("Sign in, or Dashboard and Sign out when signed in, as before", navbar.includes('href="/login"') && navbar.includes('href="/dashboard"') && (navbar.match(/Sign out\s*<\/button>/g) ?? []).length === 2);
check("the menu button gives way where the text links show: md signed out, lg signed in", navbar.includes('const SHOW_WIDE = signedIn ? "lg:flex" : "md:flex";') && navbar.includes('const HIDE_WIDE = signedIn ? "lg:hidden" : "md:hidden";'));

const footer = read("src/components/layout/Footer.tsx");
const footerHrefs = FOOTER_GROUPS.flatMap((g) => g.links.map((l) => l.href));
for (const href of ["/programs", "/locations", "/about", "/assessment", "/legal/refund-policy", "/legal/waiver", "/legal/privacy"]) {
  check(`footer links ${href}`, footerHrefs.includes(href));
}
check("footer Site column: Programs, Locations, About, Assessment", FOOTER_GROUPS[0].heading === "Site" && FOOTER_GROUPS[0].links.map((l) => l.label).join("|") === "Programs|Locations|About|Assessment");
check("footer columns: Site, then Policies, then Contact", FOOTER_GROUPS.map((g) => g.heading).join("|") === "Site|Policies" && at(footer, "FOOTER_GROUPS.map") < at(footer, "Contact"));
// The one newsletter line, on every page, with an id a "Notify me" button points at.
const footerLine = read("src/components/layout/FooterNewsletter.tsx");
check("footer opens with the newsletter line, with an id to link to", NEWSLETTER_ANCHOR === "notify" && footer.includes("id={NEWSLETTER_ANCHOR}") && footer.includes("<FooterNewsletter") && !footer.includes("<EmailCapture") && at(footer, "<FooterNewsletter") < at(footer, "FOOTER_GROUPS.map"));
// Fix round, 2026-11-17: the line recorded one source for every page. The
// live site tells home signups from Programs signups in the sheet's source
// column, so the line records the page it sits on, in the same values.
check("the line records the page it sits on: it reads the path and passes the source on", footerLine.includes('"use client"') && footerLine.includes("const pathname = usePathname()") && footerLine.includes('<EmailCapture variant="line" source={footerNewsletterSource(pathname)} />'));
check("the three values: the home page, the programs page, and the footer's own", HOME_NEWSLETTER_SOURCE === "homepage_email_capture" && PROGRAMS_NEWSLETTER_SOURCE === "programs_email_capture" && FOOTER_NEWSLETTER_SOURCE === "footer_email_capture");
// Second fix round, 2026-11-17: an unknown path is the footer's own value, never the home page's.
check("an unknown path (null) is recorded as the footer's, and the line passes the null through", footerNewsletterSource(null) === "footer_email_capture" && !footerLine.includes('usePathname() ?? "/"'), footerNewsletterSource(null));
for (const path of ["/", "/?utm_source=ad", "/#notify"]) {
  check(`a signup on ${path} is recorded as the home page's`, footerNewsletterSource(path) === "homepage_email_capture", footerNewsletterSource(path));
}
for (const path of ["/programs", "/programs/", "/programs?age=14&level=intermediate", "/programs#groups"]) {
  check(`a signup on ${path} is recorded as the programs page's`, footerNewsletterSource(path) === "programs_email_capture", footerNewsletterSource(path));
}
for (const path of ["/programs/youth-programs", "/programs/bootcamps", "/about", "/locations", "/assessment", "/legal/privacy", "/programs-guide", "/home", "/this-page-does-not-exist"]) {
  check(`a signup on ${path} is recorded as the footer's`, footerNewsletterSource(path) === "footer_email_capture", footerNewsletterSource(path));
}
check("the analytics event follows the same value: the form sends and tracks the one source", capture.includes("JSON.stringify({ email, source,") && capture.includes('trackEvent("newsletter_signup", { source })'));
check("the newsletter route still takes the source as short text, and was not changed for this", read("src/app/api/newsletter/route.ts").includes("source: cleanText(parsed?.source, TEXT_LIMITS.short),"));
check("the footer logo is a 44px target, and the column stays where it was", footer.includes('<Link href="/" className={`-my-1 inline-flex min-h-[44px] items-center rounded-lg ${FOCUS}`}>'));
check("never two newsletter forms on a page: a page's own form is marked, and the footer line hides for it", footer.includes("[body:has([data-page-newsletter])_&]:hidden") && /<section aria-labelledby=\{titleId\} data-page-newsletter>/.test(capture) && (capture.match(/data-page-newsletter>/g) ?? []).length === 1);
check("the line says what the band says, and keeps the form's behaviour and bot check", capture.includes("Be first to know when a new cohort opens.") && (capture.match(/\{bot\.field\}/g) ?? []).length === 1 && (capture.match(/fetch\("\/api\/newsletter"/g) ?? []).length === 1);
check("footer links sit in a labelled nav", footer.includes('<nav aria-label="Footer"'));
check("footer email is a mailto link", footer.includes("href={`mailto:${site.email}`}"));
check("footer rows are 44px", footer.includes("min-h-[44px]"));
check("footer keeps the vendor credit (owner default D20)", footer.includes("site.footerNote") && site.footerNote === "Design and Development QUANTUMAPPS");
check("footer still hides placeholder socials", footer.includes('s.href !== "#"'));
const banner = read("src/components/layout/PreviewBanner.tsx");
check("preview banner glyph is hidden from screen readers", banner.includes('<span aria-hidden="true">⚠</span>'));
check("preview banner text is unchanged (locked)", banner.includes("Preview mode — this site is not live yet. Content and prices may change."));

// ── M14, M15: hero ──────────────────────────────────────────────────────────
console.log("Hero (M14, M15)");
const hero = read("src/components/sections/Hero.tsx");
check("player is 640px at md and 720px at lg", hero.includes("md:w-[640px]") && hero.includes("lg:w-[720px]"));
check("the 380px cap applies to phones only", hero.includes("max-w-[380px]") && hero.includes("md:max-w-none"));
check("the court slab is feathered with a mask", hero.includes("[mask-image:") && hero.includes("[-webkit-mask-image:"));
const png = readFileSync(join(ROOT, "public/images/hero/player.png"));
const pngW = png.readUInt32BE(16);
const pngH = png.readUInt32BE(20);
check("player PNG is cropped to the player (no tall headroom)", pngW / pngH > 2.5, `${pngW}×${pngH}`);
check("declared size matches the PNG", hero.includes(`width={${pngW}}`) && hero.includes(`height={${pngH}}`));
check("bounce is motion-safe", hero.includes("motion-safe:animate-bounce") && !/(^|[\s"'`])animate-(bounce|ping)/.test(hero));
check("watermark is decorative and desktop only", /aria-hidden="true"\s+className="[^"]*hidden[^"]*md:block[^"]*"\s*>\s*TENNIS BOOTCAMP/.test(hero));
check("phones get a top-down scrim", hero.includes("bg-gradient-to-b") && hero.includes("md:bg-gradient-to-r"));
check("hero primary uses the shared hover", !hero.includes("hover:bg-[#c8ee76]"));
check("hero: the tag reads Group bootcamps · Toronto", hero.includes("{HERO_TAG}") && read("src/content/bootcamp.ts").includes('export const HERO_TAG = "Group bootcamps · Toronto";'));
check("hero: the main action under the paragraph (its button is marked for the bar)", hero.includes('<MainAction source="hero"'));
check("hero: the headline and the paragraph are unchanged (locked)", hero.includes('Where Athletes <span className="text-[#B4E655]">Evolve!</span>') && hero.includes("Structured {COHORT_LENGTH_ADJ} cohorts. A system that makes progress inevitable. Built for athletes who want to compete."));
// Owner, 2026-11-17: no price, no group size and no promise in the hero.
check("hero: shows no price (no dollar sign, no price constant)", !hero.includes("$") && !hero.includes("SESSION_PRICE") && !hero.includes("COHORT_TOTAL") && !hero.includes("GROUP_MAX_PLAYERS"));
check("hero: no Browse Programs button and no note under the buttons", !hero.includes("Browse Programs") && !hero.includes("QuizSwap") && !hero.includes("assessment"));
check("hero: the layers stay: the wave, the glow, the scrim, the wordmark, the arrow", hero.includes("<CourtBackground />") && hero.includes("tb-gradient opacity-60") && hero.includes("TENNIS BOOTCAMP") && hero.includes('d="M19 9l-7 7-7-7"'));
check("the wave loads after load and idle", hero.includes("requestIdleCallback"));
const wave = read("src/components/ui/CourtBackground.tsx");
check("wave honours prefers-reduced-motion", wave.includes("(prefers-reduced-motion: reduce)"));
check("wave pauses off screen", wave.includes("IntersectionObserver"));
check("wave still pauses in hidden tabs", wave.includes("visibilitychange"));
check("wave renders without antialiasing", wave.includes("antialias: false"));
check("wave caps the pixel ratio at 1.5", wave.includes("Math.min(window.devicePixelRatio, 1.5)"));
check("phones render half the points", /AMOUNTX_SMALL\s*=\s*35/.test(wave) && /AMOUNTY_SMALL\s*=\s*25/.test(wave));
const css = read("src/app/globals.css");
check("global reduced-motion rule", /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation-duration/.test(css));

// ── L1, L2: primitives and the header band ──────────────────────────────────
console.log("Primitives and header band (L1, L2)");
check("Card is rounded-2xl with no shadow", CARD_CLASS.includes("rounded-2xl") && !/shadow-/.test(read("src/components/ui/Card.tsx")));
check("Heading sizes are all semibold", Object.values(HEADING_CLASS).every((c) => c.includes("font-semibold") && !c.includes("font-bold")));
check("header band fades out (mask)", /\.tb-gradient::before[\s\S]*mask-image: linear-gradient\(to bottom/.test(css));
check("header band glows are lime and navy (no blue or green tints)", !css.includes("122,168,255") && !css.includes("124,255,122") && css.includes("180, 230, 85"));
check("tb-gradient sits in the components layer", /@layer components\s*\{[\s\S]*\.tb-gradient/.test(css));

if (failed > 0) {
  console.log(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll layout-shell checks passed.");
