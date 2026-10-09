// Run from project root: npx tsx src/scripts/test-layout-shell.ts
//
// Pins audit PR C (2026-10-09, "Layout shell, navigation, footer, CTA
// hierarchy and hero"): one Container rule (H2), the Kids' Camp notify form
// (H8), header and footer navigation (M11, L5, L6, L21), the CTA weights and
// placement (M12, M13), the hero size and motion (M14, M15), the Card and
// Heading primitives (L1) and the header band fade (L2). The mobile quiz bar
// rules are tested as pure functions; the rest are source checks, since the
// repo has no DOM test runner. Horizontal overflow is checked in a browser by
// `npm run check:overflow` (src/scripts/check-overflow.ts). Exits non-zero on
// any failure.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  QUIZ_BAR_HIDDEN_PREFIXES,
  QUIZ_BAR_MIN_SCROLL,
  QUIZ_CTA_ATTR,
  QUIZ_CTA_LABEL,
  quizBarAllowedOn,
  quizBarVisible,
} from "../lib/quizBar";
import { FOOTER_GROUPS, NAV_LINKS, site } from "../content/site";
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

// ── Mobile quiz bar rules (M13) ─────────────────────────────────────────────
console.log("Mobile quiz bar (M13)");
check("label is the locked primary CTA", QUIZ_CTA_LABEL === "Take the 2-minute quiz");
check("in-page CTA marker", QUIZ_CTA_ATTR === "data-quiz-cta");
for (const path of ["/intake", "/intake/", "/login", "/auth/forgot-password", "/auth/callback", "/assessment/book", "/dashboard", "/admin/cohorts/123", "/enroll/abc", "/profile", "/set-password"]) {
  check(`hidden on ${path}`, !quizBarAllowedOn(path));
}
for (const path of ["/", "/programs", "/programs/youth-programs", "/about", "/assessment", "/legal/privacy", "/intake-guide", "/administration"]) {
  check(`allowed on ${path}`, quizBarAllowedOn(path));
}
check("query strings do not defeat the route rule", !quizBarAllowedOn("/intake?program=bootcamps"));
for (const required of ["/intake", "/login", "/auth", "/assessment/book"]) {
  check(`audit route ${required} is in the hidden list`, (QUIZ_BAR_HIDDEN_PREFIXES as readonly string[]).includes(required));
}
const base = { allowed: true, signedIn: false, scrollY: QUIZ_BAR_MIN_SCROLL + 400, ctaInView: false };
check("shows once the page's quiz CTA has scrolled out", quizBarVisible(base));
check("hidden while an in-page quiz CTA is on screen", !quizBarVisible({ ...base, ctaInView: true }));
check("hidden at the top of the page", !quizBarVisible({ ...base, scrollY: 0 }));
check("hidden for a signed-in visitor", !quizBarVisible({ ...base, signedIn: true }));
check("hidden on a disallowed route", !quizBarVisible({ ...base, allowed: false }));

const bar = read("src/components/layout/MobileQuizBar.tsx");
check("bar is phones only", bar.includes("md:hidden"));
check("bar uses the route rule and the visibility rule", bar.includes("quizBarAllowedOn(") && bar.includes("quizBarVisible("));
check("bar watches in-page CTAs with an IntersectionObserver", bar.includes("IntersectionObserver") && bar.includes("QUIZ_CTA_ATTR"));
check("bar is inert while hidden", bar.includes("inert={!show}"));
check("bar respects the safe area", bar.includes("safe-area-inset-bottom"));
check("root layout mounts the bar", read("src/app/layout.tsx").includes("<MobileQuizBar />"));

// ── One Container rule (H2) ─────────────────────────────────────────────────
console.log("One Container rule (H2)");
check("Container is mx-auto max-w-6xl px-6", ["mx-auto", "max-w-6xl", "px-6"].every((c) => CONTAINER_CLASS.split(" ").includes(c)));
check("one vertical rhythm", SECTION_RHYTHM_CLASS === "py-12 md:py-16");
check("PageStack uses the Container and the rhythm", /<Container[^>]*SECTION_RHYTHM_CLASS/.test(read("src/components/layout/PageStack.tsx")));
const SECTIONS = [
  "src/components/sections/ProgramsGrid.tsx",
  "src/components/sections/Coaches.tsx",
  "src/components/sections/EventsList.tsx",
  "src/components/sections/EmailCapture.tsx",
  "src/components/sections/ProgramInterestForm.tsx",
  "src/components/sections/QuizBand.tsx",
];
for (const file of SECTIONS) {
  const src = read(file);
  const offenders = ["mx-auto", "max-w-5xl", "max-w-6xl", "px-6", "-mx-"].filter((c) => new RegExp(`(^|[\\s"'\`])${c.replace(/[-]/g, "\\-")}`).test(src));
  check(`${file.split("/").pop()} sets no gutter or page width`, offenders.length === 0, offenders.join(", "));
}

const programsPage = read("src/app/programs/page.tsx");
check("/programs grid sits in the page Container", /<PageStack>[\s\S]*<ProgramsGrid/.test(programsPage));
check("/programs has no second 'Programs' heading", programsPage.includes("title={null}"));
check("/programs does not link to itself", programsPage.includes("browseLink={false}"));
check("/programs puts the newsletter after the catalog", at(programsPage, "<ProgramsGrid") < at(programsPage, "<EmailCapture"));
check("/programs header band uses the Container", /tb-gradient[\s\S]*<Container/.test(programsPage));

const home = read("src/app/page.tsx");
check("home: programs come before the newsletter (M12)", at(home, "<ProgramsGrid") < at(home, "<EmailCapture"));
check("home: events come before the newsletter (M12)", at(home, "<EventsList") < at(home, "<EmailCapture"));
check("home: closes on the quiz band (M13)", at(home, "<Coaches") < at(home, "<QuizBand"));
check("home: no nested gutter section", !home.includes('className="mx-auto max-w-6xl px-6"'));

const grid = read("src/components/sections/ProgramsGrid.tsx");
check("grid header link is the locked secondary label", grid.includes("Browse Programs →") && !grid.includes("View all"));
check("grid header link is a 44px target", grid.includes("min-h-[44px]"));

const detail = read("src/app/programs/[slug]/page.tsx");
check("detail: one Container, no max-w-5xl edge", !detail.includes("max-w-5xl") && detail.includes("<Container"));
check("detail: no negative-margin gutter hack", !detail.includes("-mx-6"));
check("detail: breadcrumb is a labelled nav", /<Container\s+as="nav"\s+aria-label="Breadcrumb"/.test(detail));
check("detail: breadcrumb marks the current page", detail.includes('aria-current="page"'));
check("detail: breadcrumb separator is hidden", /<li aria-hidden="true"[^>]*>›<\/li>/.test(detail));

// ── H8: Kids' Camp notify form ──────────────────────────────────────────────
console.log("Kids' Camp notify form (H8)");
check("detail: one notify form", (detail.match(/<ProgramInterestForm/g) ?? []).length === 1);
check("detail: the notify form is anchored at #notify", detail.includes('id="notify"'));
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
check("every EmailCapture call names its source", ["src/app/page.tsx", "src/app/programs/page.tsx", "src/app/programs/[slug]/page.tsx", "src/app/events/page.tsx", "src/app/video-lessons/page.tsx"].every((f) => !read(f).includes("<EmailCapture />")));
check("detail: Book Your Assessment is an outline pill", /<Button variant="secondary" href="\/assessment\/book"[^>]*>\s*Book Your Assessment\s*<\/Button>/.test(detail));
check("detail: no 'Or Book Your Assessment' grey link", !detail.includes("Or Book Your Assessment"));
check("detail: closes on the quiz band (M13)", detail.includes("<QuizBand href={quizHref}"));
check("detail: timetable quiz CTA is marked for the bar", /<Button variant="primary" href=\{quizHref\}[^>]*data-quiz-cta/.test(detail));
const button = read("src/components/ui/Button.tsx");
check("one primary hover (brightness-110)", button.includes('primary: "bg-[#B4E655] text-[#061427] hover:brightness-110"'));
check("buttons are 44px or taller", button.includes("min-h-[44px]"));
const notFound = read("src/app/not-found.tsx");
check("404: the quiz is the lime primary", /<Button\s+variant="primary"\s+href="\/intake"/.test(notFound));
check("404: the quiz label never wraps", notFound.includes("whitespace-nowrap"));
check("404: links sit in a nav", notFound.includes('<nav aria-label="Helpful links"'));
const band = read("src/components/sections/QuizBand.tsx");
check("quiz band: one lime primary with the locked label", band.includes('variant="primary"') && band.includes("{QUIZ_CTA_LABEL}") && band.includes("data-quiz-cta"));

// ── M11, L5, L6, L21: navigation and footer ─────────────────────────────────
console.log("Navigation and footer (M11, L5, L6, L21)");
const navHrefs = NAV_LINKS.map((l) => l.href);
check("header links: Programs, About, Assessment", ["/programs", "/about", "/assessment"].every((h) => navHrefs.includes(h)));
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
check("header is solid navy from the top, no blur", navbar.includes("bg-[#061427]") && !navbar.includes("backdrop-blur"));
check("current page is marked", navbar.includes("aria-current={current}"));
check("header quiz CTA uses the locked label", navbar.includes("{QUIZ_CTA_LABEL}"));

const footer = read("src/components/layout/Footer.tsx");
const footerHrefs = FOOTER_GROUPS.flatMap((g) => g.links.map((l) => l.href));
for (const href of ["/programs", "/assessment", "/about", "/legal/refund-policy", "/legal/waiver", "/legal/privacy"]) {
  check(`footer links ${href}`, footerHrefs.includes(href));
}
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
check("secondary hero button has a navy fill", hero.includes('className="bg-[#061427]/80"'));
check("assessment note is white/65", hero.includes("text-white/65") && !hero.includes("text-white/50\">"));
check("hero primary uses the shared hover", !hero.includes("hover:bg-[#c8ee76]"));
check("hero quiz CTA is marked for the bar", hero.includes("data-quiz-cta"));
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
