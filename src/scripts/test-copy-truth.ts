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
// fitness in every class, at the price from the constants; and the old way
// of saying it ("weekend group class", "six per court") is on the retired
// list below.
//
// This file is skipped by its own scan, so it may spell the retired strings.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import {
  COHORT_LENGTH_ADJ,
  GROUP_MAX_PLAYERS,
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
check("site description states the price and the cohort length from the constants", SITE_DESCRIPTION.includes(`${SESSION_PRICE_LABEL} a session in ${COHORT_LENGTH_ADJ} cohorts`), SITE_DESCRIPTION);
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
check("/programs: the price from the constants, then private lessons", PROGRAMS_DESCRIPTION.includes(`${SESSION_PRICE_LABEL} a session`) && PROGRAMS_DESCRIPTION.endsWith("Private lessons by arrangement."), PROGRAMS_DESCRIPTION);
check("/about: the cohort length and the group size from the constants, in words", ABOUT_DESCRIPTION.includes(`${COHORT_LENGTH_ADJ} cohorts of up to ${numberInWords(GROUP_MAX_PLAYERS)} players`), ABOUT_DESCRIPTION);
const typedDescriptions = siteSrc.slice(siteSrc.indexOf("export const SITE_DESCRIPTION"), siteSrc.indexOf("export const site:"));
check("the three descriptions type no price, length or group size", typedDescriptions.length > 200 && !/\$\d|\b(six|eight|[68])\b/i.test(typedDescriptions), typedDescriptions.match(/\$\d|\b(six|eight|[68])\b/i)?.[0]);
check("/programs uses its description", read("src/app/programs/page.tsx").includes("description: PROGRAMS_DESCRIPTION"));
check("/about uses its description", read("src/app/about/page.tsx").includes("description: ABOUT_DESCRIPTION"));
for (const p of bootcampPrograms) {
  check(`${p.id}: the search line ends on the price and the cohort length from the constants`, (p.metaDescription ?? "").endsWith(`${SESSION_PRICE_LABEL} a session in ${COHORT_LENGTH_ADJ} cohorts.`), p.metaDescription);
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

if (failed > 0) {
  console.log(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll copy-truth checks passed.");
