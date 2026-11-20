// Run from project root: npx tsx src/scripts/test-copy-truth.ts
//
// Pins audit PR A (2026-10-09, "Truth and stopgap"): the copy describes the
// funnel as it works today (quiz first, the $20 assessment optional), the
// program photos with retired names baked in stay off every program, each
// program has a hand-written meta description, Kids' Summer Camp states only
// decided facts, and Events and Video Lessons stay out of the nav and the
// sitemap until they have real content. Exits non-zero on any failure.
//
// Since the simpler site (backlog #69, owner 2026-11-16) the page
// descriptions say what we run: group bootcamps in Toronto, tennis and
// fitness in every class; and the old way of saying it ("weekend group
// class", "six per court") is on the retired list below.
//
// Since backlog #70 (owner, 2026-11-17): the site description and the
// Programs description carry no price (the home page has none), a program
// page's line carries the whole price and never a per-session figure, and no
// file a visitor's pages are built from states a per-session price or a
// general class length ("60-minute", "Once a week"). The enroll flow, the
// admin and the legal pages are outside that rule and outside the scan.
//
// This file is skipped by its own scan, so it may spell the retired strings.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import {
  COHORT_LENGTH,
  COHORT_LENGTH_ADJ,
  COHORT_TOTAL_LABEL,
  GROUP_MAX_PLAYERS,
  PRICE_SUMMARY,
  SESSION_PRICE_LABEL,
  listedPrograms,
  numberInWords,
  programs,
} from "../content/programs";
import { ABOUT_DESCRIPTION, PROGRAMS_DESCRIPTION, SITE_DESCRIPTION } from "../content/site";
import { CLASS_IDEA, HERO_TAG } from "../content/bootcamp";
import sitemap from "../app/sitemap";

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

// ── H1 stopgap: no program shows the old Figma tiles ────────────────────────
console.log("Program images (H1 stopgap)");
for (const p of programs) {
  check(`${p.id}: no imageSrc`, (p as { imageSrc?: string }).imageSrc === undefined);
}

// ── M10: hand-written meta descriptions ─────────────────────────────────────
console.log("Program meta descriptions (M10)");
for (const p of listedPrograms) {
  const d = p.metaDescription ?? "";
  check(`${p.id}: has a metaDescription`, d.length > 0);
  check(`${p.id}: 155 characters at most`, d.length <= 155, `${d.length}: ${d}`);
  check(`${p.id}: ends on a full sentence`, /[.]$/.test(d), d);
  check(`${p.id}: names Toronto`, d.includes("Toronto"), d);
  check(`${p.id}: never a slice of longDescription`, !p.longDescription.startsWith(d), d);
}
const detailPage = read("src/app/programs/[slug]/page.tsx");
check("detail page reads metaDescription", detailPage.includes("program.metaDescription"));
check("detail page no longer slices longDescription", !detailPage.includes("longDescription.slice("));

// ── M1 / M10, then backlog #69: one site description, saying what we run ────
// Until 2026-11-16 it led with the quiz and called the assessment optional.
// Groups are open to join now and every group is a group bootcamp, so the
// line a search result shows says that: where, for whom, what a class is and
// what it costs.
console.log("Site description (M1, M10; backlog #69)");
check("site description is 155 characters at most", SITE_DESCRIPTION.length <= 155, String(SITE_DESCRIPTION.length));
check("site description names group bootcamps, in Toronto", SITE_DESCRIPTION.startsWith("Group bootcamps in Toronto"), SITE_DESCRIPTION);
check("site description says what a class is: tennis and fitness in every class", CLASS_IDEA === "tennis and fitness in every class" && SITE_DESCRIPTION.includes(CLASS_IDEA), SITE_DESCRIPTION);
// Re-pinned for backlog #70 (owner, 2026-11-17: no price on the home page). It read "… a session in …-week cohorts."
check("site description carries no price: no dollar sign, no per-session figure, no total", !SITE_DESCRIPTION.includes("$") && !/session|price|rates/i.test(SITE_DESCRIPTION) && !SITE_DESCRIPTION.includes(SESSION_PRICE_LABEL) && !SITE_DESCRIPTION.includes(COHORT_TOTAL_LABEL), SITE_DESCRIPTION);
check("site description states the cohort length from the constant", SITE_DESCRIPTION.endsWith(`${CLASS_IDEA}, in ${COHORT_LENGTH_ADJ} cohorts.`), SITE_DESCRIPTION);
check("site description states no class length and no classes a week", !/minute|hour|a week|weekly/i.test(SITE_DESCRIPTION), SITE_DESCRIPTION);
check("site description ends on a full sentence", /[.]$/.test(SITE_DESCRIPTION), SITE_DESCRIPTION);
check("site description no longer makes the quiz or the assessment the way in", !/quiz|assessment/i.test(SITE_DESCRIPTION), SITE_DESCRIPTION);
check("root layout uses it", read("src/app/layout.tsx").includes("description: SITE_DESCRIPTION"));
check("home page uses it", read("src/app/page.tsx").includes("description: SITE_DESCRIPTION"));

// ── Backlog #69: every page description that describes a class ──────────────
console.log("Page descriptions say what a class is (backlog #69)");
const siteSrc = read("src/content/site.ts");
const bootcampPrograms = listedPrograms.filter((p) => p.type === "Group bootcamp");
check("the two bootcamp programs are the Group bootcamp ones", bootcampPrograms.map((p) => p.slug).join("|") === "youth-programs|bootcamps");
const DESCRIPTIONS: [string, string][] = [
  ["/programs", PROGRAMS_DESCRIPTION],
  ["/about", ABOUT_DESCRIPTION],
  ...bootcampPrograms.map((p): [string, string] => [`/programs/${p.slug}`, p.metaDescription ?? ""]),
];
for (const [path, d] of DESCRIPTIONS) {
  check(`${path}: 155 characters at most`, d.length > 0 && d.length <= 155, `${d.length}: ${d}`);
  check(`${path}: names group bootcamps and Toronto`, /group bootcamps/i.test(d) && d.includes("Toronto"), d);
  check(`${path}: tennis and fitness in every class`, d.includes(CLASS_IDEA), d);
  check(`${path}: ends on a full sentence`, /[.]$/.test(d), d);
  check(`${path}: no banned claim and no separate fitness session`, !/experience|actually|journey|unlock|limited spots|circuit|strength-and-conditioning|fitness session/i.test(d), d);
}
// Re-pinned for backlog #70: it carried "… a session" between the days and private lessons.
// Re-pinned for backlog #85 (fix round): it named the two days ("youth on Saturdays, adults on Sundays."); each group's card shows its own.
check("/programs: who the two programs are for, no weekday, no price, then private lessons", PROGRAMS_DESCRIPTION.includes("for youth and for adults, by age and level. ") && !/day\b|days\b/i.test(PROGRAMS_DESCRIPTION) && !PROGRAMS_DESCRIPTION.includes("$") && !/session|price/i.test(PROGRAMS_DESCRIPTION) && PROGRAMS_DESCRIPTION.endsWith("Private lessons by arrangement."), PROGRAMS_DESCRIPTION);
check("/about: no price", !ABOUT_DESCRIPTION.includes("$") && !/session|price/i.test(ABOUT_DESCRIPTION), ABOUT_DESCRIPTION);
check("/about: the cohort length and the group size from the constants, in words", ABOUT_DESCRIPTION.includes(`${COHORT_LENGTH_ADJ} cohorts of up to ${numberInWords(GROUP_MAX_PLAYERS)} players`), ABOUT_DESCRIPTION);
const typedDescriptions = siteSrc.slice(siteSrc.indexOf("export const SITE_DESCRIPTION"), siteSrc.indexOf("export const site:"));
check("the three descriptions type no price, length or group size, and read no price constant", typedDescriptions.length > 200 && !/\$\d|\b(six|eight|[68])\b/i.test(typedDescriptions) && !/SESSION_PRICE|COHORT_TOTAL|PRICE_SUMMARY/.test(siteSrc), typedDescriptions.match(/\$\d|\b(six|eight|[68])\b/i)?.[0]);
check("/programs uses its description", read("src/app/programs/page.tsx").includes("description: PROGRAMS_DESCRIPTION"));
check("/about uses its description", read("src/app/about/page.tsx").includes("description: ABOUT_DESCRIPTION"));
for (const p of bootcampPrograms) {
  // Re-pinned for backlog #70: the line ended "… a session in …-week cohorts."; it ends on the whole price now.
  check(`${p.id}: the search line ends on the whole price, the cohort total for the cohort length, from the constants`, (p.metaDescription ?? "").endsWith(` ${PRICE_SUMMARY}.`) && PRICE_SUMMARY === `${COHORT_TOTAL_LABEL} for ${COHORT_LENGTH}`, p.metaDescription);
  check(`${p.id}: the search line carries no per-session figure, no class length and no classes a week`, !/session|minute|hour|a week|weekly/i.test(p.metaDescription ?? "") && !(p.metaDescription ?? "").includes(SESSION_PRICE_LABEL), p.metaDescription);
}
{
  const privateLine = listedPrograms.find((p) => p.slug === "private-lessons")?.metaDescription ?? "";
  check("private lessons: the search line still reads Rates on request, and no number", privateLine.includes("Rates on request") && !privateLine.includes("$"), privateLine);
}
// The share card: a page with no subtitle of its own reads the hero's tag.
const ogSrc = read("src/lib/og-image.tsx");
check("share cards: the default subtitle is the hero's tag, Group bootcamps · Toronto", HERO_TAG === "Group bootcamps · Toronto" && ogSrc.includes("subtitle: string = HERO_TAG") && ogSrc.includes('import { HERO_TAG } from "@/content/bootcamp"'));

// ── Owner 2026-10-12: the camp left the catalog, High Performance is a group ─
console.log("Catalog truth (owner, 2026-10-12)");
check("no Kids' Summer Camp entry at all", !programs.some((p) => p.id === "kids-summer-camp"));
check("High Performance is unlisted, kept only so old rows resolve", programs.find((p) => p.id === "high-performance")?.unlisted === true);
check("detail page shows the card line under its title", detailPage.includes("{program.description}"));
for (const p of listedPrograms) {
  const text = [p.description, p.longDescription, p.metaDescription ?? "", p.schedule ?? "", p.levelNote ?? ""].join(" ").toLowerCase();
  for (const claim of ["experience", "actually", "journey", "unlock", "limited spots"]) {
    check(`${p.id}: no banned "${claim}"`, !text.includes(claim));
  }
}

// ── M6: Events and Video Lessons out of the nav and the sitemap ─────────────
console.log("Events and Video Lessons (M6)");
const urls = sitemap().map((e) => e.url);
check("sitemap has no /events", !urls.some((u) => u.endsWith("/events")));
check("sitemap has no /video-lessons", !urls.some((u) => u.endsWith("/video-lessons")));
const navbar = read("src/components/layout/Navbar.tsx");
check("nav has no /events link", !navbar.includes('"/events"'));
check("nav has no /video-lessons link", !navbar.includes('"/video-lessons"'));
check("/events is noindex", read("src/app/events/page.tsx").includes("index: false"));
check("/video-lessons is noindex", read("src/app/video-lessons/page.tsx").includes("index: false"));
check("/video-lessons invents no durations", !/~\d+\s*min/.test(read("src/app/video-lessons/page.tsx")));
check("home renders Events only with a real event", read("src/app/page.tsx").includes("hasRealEvents &&"));
// Backlog #69: the empty Events page names what training is, group bootcamps.
check("/events says training runs as group bootcamps", /Training runs as group\s+bootcamps;/.test(read("src/app/events/page.tsx")));

// ── voice.md matches the funnel (rule 6, examples #4 and #6, buttons) ───────
console.log("ops/briefs/voice.md (D17)");
const voice = read("ops/briefs/voice.md");
// Owner, 2026-11-16 (backlog #69): groups are open to join, and the quiz is the side path.
check("rule 6: groups are open to join, the quiz is the side path", /6\. \*\*No stale promises\.\*\*[^\n]*groups are open to join, and the quiz is the side path/.test(voice));
check("rule 6 still keeps the assessment optional, never a step", /6\. \*\*No stale promises\.\*\*[^\n]*assessment is optional[^\n]*never a step every player must take/.test(voice));
check("rule 6 no longer says assessment-first", !/6\. \*\*No stale promises\.\*\*[^\n]*assessment-first/.test(voice));
check("button note uses the locked label", /\*\*Buttons\*\*[^\n]*"Book Your Assessment"/.test(voice));
check("High Performance is the competitive track", voice.includes("explicitly competitive track"));

// ── Retired strings stay retired anywhere under src ─────────────────────────
console.log("Retired strings under src");
const RETIRED = [
  "Assessments Now Open", // M2: no slots are posted
  "Placed by Assessment", // M1
  "Every player starts with 20 minutes", // M1
  "Every player is placed by a 20-minute", // M1 (old site meta)
  "hits with the coach before joining", // M1 (old TrustBar)
  "Book my 20-minute assessment", // M9
  "Enroll in a program →", // M3: there is no self-enrollment
  "competitive tier", // L19 / D15
  "enrolled!", // L15
  "Meet the Coaches\" />", // M16: one coach
  "title=\"The team\"", // H3 / M16
  "strength-and-conditioning session per week", // H3
  "Two on-court sessions per week", // H3
  // Backlog #69 (owner, 2026-11-16): every group is a group bootcamp, up to
  // eight players a group. The old way of saying it stays retired.
  "Weekend classes · Toronto", // the hero tag, now "Group bootcamps · Toronto"
  "Weekend group class", // the program type, now "Group bootcamp"
  "Weekend tennis classes", // the old site description
  "Six players per court, eight at most", // About, now "Up to eight players a group"
  "A capped court", // About: the six-per-court reason
  "Courts are capped", // About: the six-per-court reason
  "Saturday group classes for ages", // Youth Bootcamps' card line
  "Sunday group classes for adults", // Adult Bootcamps' card line
  "group classes for adults", // the quiz's reason line
  "one part of the game", // a class is tennis and fitness, every week
  "Elite Coaching", // the share cards' old subtitle
];
const SELF = join(ROOT, "src", "scripts", "test-copy-truth.ts");
const TEXT_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|md|json|html|txt)$/i;
function walk(dir: string, out: string[]) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (TEXT_EXT.test(name)) out.push(full);
  }
}
const files: string[] = [];
walk(join(ROOT, "src"), files);
check("scanned some files", files.length > 50, `only ${files.length}`);
const hits: string[] = [];
for (const file of files) {
  if (file === SELF) continue;
  readFileSync(file, "utf8")
    .split(/\r?\n/)
    .forEach((line, i) => {
      for (const s of RETIRED) {
        if (line.toLowerCase().includes(s.toLowerCase())) {
          hits.push(`${relative(ROOT, file).split(sep).join("/")}:${i + 1} "${s}"`);
        }
      }
    });
}
check("no retired string under src", hits.length === 0, `found:\n      ${hits.join("\n      ")}`);

// ── Backlog #70 (owner, 2026-11-17): the whole price only, and no general ───
// class length. Wherever a visitor browses, a price is what a bootcamp costs
// as a whole; the per-session figure is shown nowhere (it returns on the
// sign-up step of one bootcamp, a later item). And no page states how long a
// class is or how many there are a week: each group has its own day and time.
//
// The scan reads every file a visitor's pages are built from: src/app,
// src/components, src/content and src/lib (what they render: code and
// strings, with comments blanked). Outside it by owner rule: the enroll
// flow, the admin and the legal pages (src/app/enroll, src/app/admin,
// src/app/legal); src/app/api, which renders no page; and, in src/lib, the
// emails (src/lib/email*) and the files only the admin reads.
console.log("No per-session price and no general class length where a visitor browses");
{
  const SCANNED = ["app", "components", "content", "lib"].map((dir) => join(ROOT, "src", dir));
  const OUTSIDE = ["enroll", "admin", "legal", "api"].map((dir) => join(ROOT, "src", "app", dir) + sep);
  // Backlog #70, fix round: src/lib is scanned too, since the pages render
  // strings built there (the program catalog, the group seats, the main
  // action, the share cards, the structured data). Left out by name: the
  // emails (src/lib/email*: they are not a page, and the enroll step's
  // messages may carry the per-session terms), and the three files only the
  // admin reads (adminAuth, adminLabels, availabilityMatrix).
  const LIB_OUTSIDE = new Set(["email.ts", "emailBodies.ts", "emailResult.ts", "adminAuth.ts", "adminLabels.ts", "availabilityMatrix.ts"].map((name) => join(ROOT, "src", "lib", name)));
  const SETTINGS = join(ROOT, "src", "content", "programs.ts");
  const browsed: string[] = [];
  for (const dir of SCANNED) walk(dir, browsed);
  const inScope = browsed.filter((file) => !OUTSIDE.some((prefix) => file.startsWith(prefix)) && !LIB_OUTSIDE.has(file));
  check("the scan covers the pages, the components, the content and src/lib", inScope.length > 80 && inScope.some((f) => f.endsWith(join("app", "page.tsx"))) && inScope.some((f) => f.endsWith("ProgramGroupCard.tsx")) && inScope.includes(SETTINGS) && inScope.includes(join(ROOT, "src", "lib", "programCatalog.ts")) && inScope.includes(join(ROOT, "src", "lib", "structuredData.ts")), `${inScope.length} files`);
  check("…and leaves out the enroll flow, the admin and the legal pages", !inScope.some((f) => OUTSIDE.some((prefix) => f.startsWith(prefix))) && browsed.some((f) => f.startsWith(OUTSIDE[0])) && browsed.some((f) => f.startsWith(OUTSIDE[2])));
  check("…and, in src/lib, only the emails and the admin-only files, each by name", [...LIB_OUTSIDE].every((file) => browsed.includes(file)) && inScope.filter((f) => f.startsWith(join(ROOT, "src", "lib") + sep)).length > 40 && !inScope.some((f) => /[\\/]lib[\\/]email/.test(f)));

  // "a session" as a price: an amount, or a price constant, in front of it;
  // "per session" and "each session" as a price; or the per-session constant
  // read at all.
  const SESSION_PRICE_WORDS = /(\$\d[\d.,]*|_LABEL\}|\bprice\b[^.\n]{0,20})\s*(a|per|each|\/)\s*session\b|\bper[- ]session\b|\bSESSION_PRICE(_LABEL)?\b/i;
  // A general class length or a number of classes a week. A group's own time
  // range ("12:00–1:00 pm") and the 20-minute assessment are neither.
  const CLASS_LENGTH_WORDS = /\b\d+[- ]minute (class|session|lesson)|\bSESSION_MINUTES\b|\bonce a week\b|\btwice a week\b|\b(class|classes|session|sessions|lesson|lessons) (a|per|each|every) week\b|\bminutes · /i;
  check(
    "the scan catches what left the pages, and lets what stays through",
    ["$35 a session", "${SESSION_PRICE_LABEL} a session", "$35 per session", "the per-session figure", "SESSION_PRICE_LABEL"].every((old) => SESSION_PRICE_WORDS.test(old)) &&
      ["one 60-minute class a week", "Once a week · 60 minutes", "One ${SESSION_MINUTES}-minute class a week", "one 60-minute class every Saturday", "two classes a week"].every((old) => CLASS_LENGTH_WORDS.test(old)) &&
      ["Corrections from the coach every session", "feedback from your coach every session", "Saturdays 12:00–1:00 pm", "20 minutes on court for $20", "The 2-minute quiz", "confirmed on court in week one", "a session cookie"].every((kept) => !SESSION_PRICE_WORDS.test(kept) && !CLASS_LENGTH_WORDS.test(kept))
  );

  // What a file renders is its code and its strings: comments are blanked,
  // line for line, so a comment may name what left and a hit keeps its line.
  const withoutComments = (text: string) =>
    text
      .replace(/\{?\/\*[\s\S]*?\*\/\}?/g, (comment) => comment.replace(/[^\n]/g, ""))
      .replace(/(^|\s)\/\/[^\n]*/g, "$1");
  check("comments are blanked and code is kept, on the same lines", withoutComments("a /* $35 a session */ b\n// once a week\nc // x\nd").split("\n").join("|") === "a  b||c |d" && withoutComments('"https://example.com/a" b').includes("https://example.com/a"));
  // The retired Group Lessons entry keeps its old words, so the cohort and
  // enrollment rows built under it still resolve; it is unlisted and no page
  // renders it. Its one line is the scan's one exception.
  const RETIRED_ENTRY_LINE = "Each 90-minute session is capped at 6 players per court";
  const retired = programs.find((p) => p.id === "group-lessons");
  check("the one exception is the retired, unlisted Group Lessons entry", retired?.unlisted === true && retired.longDescription.startsWith(RETIRED_ENTRY_LINE) && !listedPrograms.some((p) => p.id === "group-lessons"));

  const priceHits: string[] = [];
  const lengthHits: string[] = [];
  for (const file of inScope) {
    const where = relative(ROOT, file).split(sep).join("/");
    withoutComments(readFileSync(file, "utf8").replace(/\r\n/g, "\n"))
      .split("\n")
      .forEach((line, i) => {
        // The settings file defines the per-session amount, the one source
        // of every total: the constant itself stays.
        const definition = file === SETTINGS && /^export const SESSION_PRICE(_LABEL)?\b|^export const COHORT_TOTAL = SESSION_PRICE \* COHORT_WEEKS;/.test(line);
        if (SESSION_PRICE_WORDS.test(line) && !definition) priceHits.push(`${where}:${i + 1} ${line.trim().slice(0, 80)}`);
        if (CLASS_LENGTH_WORDS.test(line) && !(file === SETTINGS && line.includes(RETIRED_ENTRY_LINE))) lengthHits.push(`${where}:${i + 1} ${line.trim().slice(0, 80)}`);
      });
  }
  check("no file a visitor's pages are built from states a per-session price", priceHits.length === 0, `found:\n      ${priceHits.join("\n      ")}`);
  check("no file a visitor's pages are built from states a general class length or classes a week", lengthHits.length === 0, `found:\n      ${lengthHits.join("\n      ")}`);

  // The settings file keeps the amount, as the one source of every total.
  const settings = readFileSync(SETTINGS, "utf8").split(/\r?\n/);
  const labelLines = settings.filter((line) => line.includes("SESSION_PRICE_LABEL"));
  check("the per-session label is defined in the settings and read by nothing else there", labelLines.length === 1 && labelLines[0].startsWith("export const SESSION_PRICE_LABEL = formatDollars(SESSION_PRICE);"), labelLines.join(" | "));
  check("the price a visitor reads is the cohort total for the cohort length, with no per-session part", PRICE_SUMMARY === `${COHORT_TOTAL_LABEL} for ${COHORT_LENGTH}` && !PRICE_SUMMARY.includes(SESSION_PRICE_LABEL) && !/session/i.test(PRICE_SUMMARY), PRICE_SUMMARY);
  check("no setting for a class length is left to state", !settings.some((line) => /export const \w*MINUTES\b/.test(line)));

  // The share cards and the structured data state no per-session price either.
  const og = [read("src/lib/og-image.tsx"), read("src/app/opengraph-image.tsx"), read("src/app/programs/opengraph-image.tsx"), read("src/app/programs/[slug]/opengraph-image.tsx"), read("src/app/about/opengraph-image.tsx")].join("\n");
  check("the share cards carry no price at all", !/SESSION_PRICE|COHORT_TOTAL|PRICE_SUMMARY|\$\d/.test(og));
  const ld = read("src/lib/structuredData.ts");
  check("the structured data reads the cohort total and never the per-session amount, a class length or a workload", ld.includes("price: COHORT_TOTAL,") && !/SESSION_PRICE|SESSION_MINUTES|courseWorkload|isoDuration|duration:|UnitPriceSpecification|unitText/.test(ld));
}

if (failed > 0) {
  console.log(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll copy-truth checks passed.");
