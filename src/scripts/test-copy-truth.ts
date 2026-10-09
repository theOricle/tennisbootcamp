// Run from project root: npx tsx src/scripts/test-copy-truth.ts
//
// Pins audit PR A (2026-10-09, "Truth and stopgap"): the copy describes the
// funnel as it works today (quiz first, the $20 assessment optional), the
// program photos with retired names baked in stay off every program, each
// program has a hand-written meta description, Kids' Summer Camp states only
// decided facts, and Events and Video Lessons stay out of the nav and the
// sitemap until they have real content. Exits non-zero on any failure.
//
// This file is skipped by its own scan, so it may spell the retired strings.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import {
  CAMP_WEEK_PRICE,
  CAMP_WEEK_PRICE_LABEL,
  formatDollars,
  listedPrograms,
  programs,
} from "../content/programs";
import { SITE_DESCRIPTION } from "../content/site";
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

// ── M1 / M10: one site description, quiz first ──────────────────────────────
console.log("Site description (M1, M10)");
check("site description is 155 characters at most", SITE_DESCRIPTION.length <= 155, String(SITE_DESCRIPTION.length));
check("site description leads with the quiz", SITE_DESCRIPTION.includes("2-minute quiz"));
check("site description calls the assessment optional", /assessment is optional/.test(SITE_DESCRIPTION));
check("root layout uses it", read("src/app/layout.tsx").includes("description: SITE_DESCRIPTION"));
check("home page uses it", read("src/app/page.tsx").includes("description: SITE_DESCRIPTION"));

// ── M4: Kids' Summer Camp, decided facts only ───────────────────────────────
console.log("Kids' Summer Camp (M4)");
const camp = programs.find((p) => p.id === "kids-summer-camp");
check("camp exists", !!camp);
if (camp) {
  const text = [camp.description, camp.longDescription, camp.metaDescription ?? "", camp.schedule ?? ""].join(" ");
  check("price label follows the constant", CAMP_WEEK_PRICE_LABEL === formatDollars(CAMP_WEEK_PRICE));
  check("card line states the weekly price", camp.description.includes(`${CAMP_WEEK_PRICE_LABEL} a week`), camp.description);
  check("detail page shows the card line under its title", detailPage.includes("{program.description}"));
  for (const claim of ["lunch", "snack", "full-day", "full day", "july", "august", "skill tracking", "experience", "actually"]) {
    check(`no unconfirmed or banned "${claim}"`, !text.toLowerCase().includes(claim));
  }
  check("no 'What's included' list until Sina confirms it", !camp.includes || camp.includes.length === 0);
  check("points to Youth Programs", camp.related?.href === "/programs/youth-programs");
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

// ── voice.md matches the funnel (rule 6, examples #4 and #6, buttons) ───────
console.log("ops/briefs/voice.md (D17)");
const voice = read("ops/briefs/voice.md");
check("rule 6 is quiz first", /6\. \*\*No stale promises\.\*\*[^\n]*quiz first/.test(voice));
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
