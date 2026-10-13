// Run from project root: npx tsx src/scripts/test-joining-flow.ts
//
// Pins audit item L (owner decision 2026-10-12, "joining flow: open
// enrollment, level confirmed on court"): groups are open to join, the coach
// confirms the level on court in week one with the move-or-refund promise,
// High Performance is by approval, the $20 assessment is optional (for
// certainty, never a step), and a level from the quiz or a placement reads as
// provisional until week one. The copy must not contradict the Program
// Policies, and adds no legal terms. Exits non-zero on any failure. Never
// spells the cohort length or total.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  APPROVAL_LINE,
  ASSESSMENT_CERTAINTY_LINE,
  PLACEMENT_LINE,
  RIGHT_GROUP_PROMISE,
  RIGHT_GROUP_PROMISE_SHORT,
  listedPrograms,
  programGroups,
} from "../content/programs";
import { COOLING_OFF_DAYS } from "../content/policies";
import { groupStatus } from "../lib/programCatalog";
import { nextStepFor } from "../lib/dashboardState";
import { HowJoiningWorks } from "../components/sections/HowJoiningWorks";
import { ProgramGroupCard } from "../components/sections/ProgramGroupCard";

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
const read = (path: string) => readFileSync(join(ROOT, path), "utf8").replace(/\r\n/g, "\n");
const at = (hay: string, needle: string) => hay.indexOf(needle);
const count = (hay: string, needle: string) => hay.split(needle).length - 1;
const render = (el: React.ReactElement) => renderToStaticMarkup(el);
const group = (id: string) => programGroups.find((g) => g.id === id)!;
const youth = listedPrograms.find((p) => p.slug === "youth-programs")!;
const adults = listedPrograms.find((p) => p.slug === "bootcamps")!;
const privateLessons = listedPrograms.find((p) => p.slug === "private-lessons")!;
const scheduled = programGroups.filter((g) => g.day !== null);

// ── The decided strings ─────────────────────────────────────────────────────
console.log("The joining-flow strings (owner, 2026-10-12)");
check(
  "the promise in full: move at the same price, or a full refund",
  RIGHT_GROUP_PROMISE === "If another group fits you better, we move you to it at the same price. If none does, we refund you in full."
);
check(
  "the promise on a card",
  RIGHT_GROUP_PROMISE_SHORT === "Your coach confirms your level. If another group fits better, we move you; if none does, full refund."
);
check("High Performance joins by the quiz and our coaches' approval, no assessment", APPROVAL_LINE === "Take the 2-minute quiz and our coaches approve each spot. No assessment needed.");
check(
  "the assessment line: optional, the $20 mechanic spelled out (voice.md rule 2)",
  ASSESSMENT_CERTAINTY_LINE.includes("optional") &&
    ASSESSMENT_CERTAINTY_LINE.includes("$20") &&
    ASSESSMENT_CERTAINTY_LINE.includes("if you enroll in a program afterward that $20 comes off the price")
);
check("the placement line names the week-one check, and no assessment", PLACEMENT_LINE.includes("confirms your level on court in week one") && !/assessment/i.test(PLACEMENT_LINE));
check("both scheduled programs end their description on it", [youth, adults].every((p) => p.longDescription.endsWith(PLACEMENT_LINE)));
const LINES = [RIGHT_GROUP_PROMISE, RIGHT_GROUP_PROMISE_SHORT, APPROVAL_LINE, ASSESSMENT_CERTAINTY_LINE, PLACEMENT_LINE];
check("no banned shorthand or step words: credited, required, must", LINES.every((l) => !/\b(credited|required|must)\b/i.test(l)));
check("no exclamation marks, no intensifiers", LINES.every((l) => !l.includes("!") && !/\b(really|truly|actually|very|super)\b/i.test(l)));

// ── Consistent with the Program Policies, and no new legal terms ────────────
console.log("Program Policies: unchanged, never contradicted");
check("the full-refund window is still 10 days (policies.ts untouched)", COOLING_OFF_DAYS === 10);
check(
  "the promise adds no legal terms: no day counts, fees or percentages",
  [RIGHT_GROUP_PROMISE, RIGHT_GROUP_PROMISE_SHORT].every((l) => !/\d/.test(l) && !/\b(fee|days?|%|percent|credit)\b/i.test(l))
);
const policyPage = read("src/app/legal/refund-policy/page.tsx");
check("the policy page is not touched by the joining flow", !policyPage.includes("week one") && !policyPage.includes("RIGHT_GROUP_PROMISE"));
check("\"at the same price\" holds: every scheduled group costs the same", new Set(scheduled.map((g) => g.price)).size === 1);

// ── Groups: open to join, High Performance by approval ──────────────────────
console.log("Groups: open to join, High Performance by approval");
check("High Performance is the one by-approval group", programGroups.filter((g) => g.joining === "approval").map((g) => g.id).join() === "high-performance");
check("every other group is open to join", programGroups.filter((g) => g.id !== "high-performance").every((g) => g.joining === "open"));
check("open groups read Open to join", scheduled.filter((g) => g.joining === "open").every((g) => groupStatus(g)?.label === "Open to join"));
check("High Performance reads By approval", groupStatus(group("high-performance"))?.label === "By approval");

// ── The group card ──────────────────────────────────────────────────────────
console.log("Group cards: the Join and Week 1 rows");
const hpCard = render(createElement(ProgramGroupCard, { group: group("high-performance"), program: youth }));
const openCard = render(createElement(ProgramGroupCard, { group: group("adult-newer"), program: adults }));
const soloCard = render(createElement(ProgramGroupCard, { group: group("private-lessons"), program: privateLessons }));
const row = (html: string, label: string, value: string) =>
  html.includes(`>${label}</dt><dd class="min-w-0 text-sm leading-relaxed text-white/80">${value.replace(/'/g, "&#x27;")}</dd>`);
check("every scheduled card carries the Week 1 promise", scheduled.every((g) => row(render(createElement(ProgramGroupCard, { group: g, program: listedPrograms.find((p) => p.slug === g.programSlug)! })), "Week 1", RIGHT_GROUP_PROMISE_SHORT)));
check("High Performance adds the Join row, above Week 1", row(hpCard, "Join", APPROVAL_LINE) && at(hpCard, ">Join</dt>") < at(hpCard, ">Week 1</dt>"));
check("an open group has no Join row", !openCard.includes(">Join</dt>") && openCard.includes("Open to join"));
check("private lessons: no group to move between, so neither row", !soloCard.includes(">Week 1</dt>") && !soloCard.includes(">Join</dt>"));
check("still one link per card, the quiz", count(hpCard, "<a ") === 1 && count(openCard, "<a ") === 1);
check("the rows sit after the level tag and the price, before the CTA", at(hpCard, ">Week 1</dt>") > at(hpCard, ">Level</dt>") && at(hpCard, ">Week 1</dt>") > at(hpCard, ">Price</dt>") && at(hpCard, ">Week 1</dt>") < at(hpCard, 'href="/intake?program=youth-programs"'));
check("no assessment pitch on a card (design-system.md)", !hpCard.includes("Book Your Assessment") && !openCard.includes("Book Your Assessment"));

// ── How joining works ───────────────────────────────────────────────────────
console.log("How joining works: three steps, ordered-list semantics");
const steps = render(createElement(HowJoiningWorks, { source: "test", showApproval: true }));
const stepsAdults = render(createElement(HowJoiningWorks, { source: "test", quizHref: "/intake?program=bootcamps" }));
check("a labelled section with its h2", /<section id="how-joining-works" aria-labelledby="how-joining-works-heading"/.test(steps) && steps.includes('<h2 id="how-joining-works-heading"') && steps.includes(">How joining works</h2>"));
check("a real ordered list of three steps", count(steps, '<ol role="list"') === 1 && count(steps, "<li") === 3);
check("the numerals are decoration", ["01", "02", "03"].every((n) => new RegExp(`<span aria-hidden="true"[^>]*>${n}</span>`).test(steps)));
check(
  "the steps in order: pick, reserve, the coach confirms",
  at(steps, ">Pick a group that fits your age and level</h3>") > 0 &&
    at(steps, ">Pick a group that fits your age and level</h3>") < at(steps, ">Reserve your spot</h3>") &&
    at(steps, ">Reserve your spot</h3>") < at(steps, ">Your coach confirms your level</h3>")
);
check("step 1: not sure? the quiz, linked", /Not sure which fits\? <a [^>]*href="\/intake"[^>]*>Take the 2-minute quiz<\/a> and our coaches place you\./.test(steps));
check("step 1 on a program page carries the program", stepsAdults.includes('href="/intake?program=bootcamps"'));
check("step 2: how a spot is reserved today (quiz, invitation, hold, enroll)", steps.includes("The 2-minute quiz is how you ask for a spot. We email you an invitation with the group&#x27;s dates and price, and hold your spot while you enroll."));
check("step 3: on court in week one, then the promise", steps.includes(`On court, in week one. ${RIGHT_GROUP_PROMISE}`));
check("the optional assessment: certainty first, the mechanic, the exact label", steps.includes("Want certainty first?</span> " + ASSESSMENT_CERTAINTY_LINE) && /<a [^>]*href="\/assessment\/book"[^>]*>Book Your Assessment<span aria-hidden="true"[^>]*>→<\/span><\/a>/.test(steps));
check("High Performance by approval when asked, named as the group, never the tier", steps.includes("The High Performance Youth Bootcamp is by approval.</span> " + APPROVAL_LINE) && !steps.includes(">High Performance is by approval") && !stepsAdults.includes("High Performance"));
check("two links, neither a lime primary button", count(steps, "<a ") === 2 && !/<a [^>]*bg-\[#B4E655\]/.test(steps));

// ── The pages ───────────────────────────────────────────────────────────────
console.log("Pages: /programs and the program pages");
const programsPage = read("src/app/programs/page.tsx");
// The location now opens the page (owner, 2026-10-12, audit item N; pinned in
// test-locations.ts); How joining works follows it, still above the filters.
check("/programs: How joining works sits above the filters, after the location, with High Performance", programsPage.includes('<HowJoiningWorks source="programs-joining" showApproval />') && at(programsPage, "<LocationChoice") < at(programsPage, "<HowJoiningWorks") && at(programsPage, "<HowJoiningWorks") < at(programsPage, "<ProgramCatalog programs="));
check("/programs: the primary stays the quiz", programsPage.includes("{QUIZ_CTA_LABEL}") && programsPage.includes('variant="primary"'));
const detail = read("src/app/programs/[slug]/page.tsx");
check("detail: How joining works before the groups, only for a program with fixed classes", /scheduledGroups\.length > 0 && \(\s*<>\s*<HowJoiningWorks/.test(detail) && at(detail, "<HowJoiningWorks") < at(detail, 'aria-labelledby="groups"'));
check("detail: the section links the program's quiz and lists High Performance only where it trains", detail.includes("quizHref={quizHref}") && detail.includes('showApproval={scheduledGroups.some((g) => g.joining === "approval")}'));
check("detail: the assessment button says optional", detail.includes("Optional, if you want your level confirmed before you enroll."));

// ── Provisional until week one: the quiz result and the dashboard ───────────
console.log("Provisional until week one (quiz result, dashboard)");
const intake = read("src/app/intake/page.tsx");
check("quiz: one player's tier is provisional until week one", intake.includes("From your answers, so it stays provisional until our coaches confirm") && intake.includes("level on court in week one."));
check("quiz: a household's tiers are too", intake.includes("From your answers, so each stays provisional until our coaches confirm the player's level on court in week one."));
check("quiz: the old wording is gone", !intake.includes("Our coaches confirm {firstName"));
check("quiz: the assessment is for certainty, before enrolling", intake.includes("Optional: want certainty first?") && intake.includes("before you enroll, you can book a 20-minute assessment") && !intake.includes("before you're placed"));
check("quiz: the High Performance group is marked by approval on the match card", intake.includes('{g.joining === "approval" && <span className="text-white/70"> · By approval</span>}'));
const dash = read("src/app/dashboard/DashboardView.tsx");
check("dashboard: a placement reads Provisional in the player list", dash.includes("`Provisional · ${formatTierSpan(placed.min, placed.max)} group`"));
check("dashboard: the tiers sub names the week-one check", dash.includes("Each player's level, set by our coaches and confirmed on court in week one."));
const placing = nextStepFor({
  selfId: "p1",
  roster: [{ id: "p1", relationship: "self", full_name: "Dana Chen", level: null }],
  voice: "you",
  enrollments: [],
  cohorts: [],
  sessionsByCohort: {},
  programs: [],
  invites: [],
  bookings: [],
  recipientEmail: "info@tennisbootcamp.ca",
  today: "2026-10-12",
  now: "2026-10-12T12:00:00Z",
});
check(
  "dashboard: the placing step names the week-one check, then the optional assessment",
  placing.kind === "placing" &&
    placing.detail.includes("Our coaches confirm every level on court in week one. For certainty before you enroll, the 20-minute assessment is optional.") &&
    placing.detail.includes("if you enroll in a program afterward that $20 comes off the price"),
  placing.detail
);
check("dashboard: one voice, our coaches", !/your coach/i.test(read("src/lib/dashboardState.ts")) && !/your coach/i.test(dash) && !/your coach/i.test(read("src/components/tiers/RankCard.tsx")));

// ── voice.md ────────────────────────────────────────────────────────────────
console.log("voice.md");
const voice = read("ops/briefs/voice.md");
check("has the joining flow section", voice.includes("## Joining flow (owner, 2026-10-12)"));
check("rule 6 still leads with quiz first, and names the week-one check", /6\. \*\*No stale promises\.\*\*[^\n]*quiz first[^\n]*week one/.test(voice));
check("rule 7 names Open to join, By approval and provisional", /7\. \*\*Consistent product vocabulary\.\*\*[^\n]*"Open to join"[^\n]*"By approval"[^\n]*"provisional"/.test(voice));

const pkg = JSON.parse(read("package.json")) as { scripts: { test: string } };
// Later items append their scripts after this one (audit N), so it is pinned as run, not as last.
check("npm test runs this file", pkg.scripts.test.includes("npx tsx src/scripts/test-joining-flow.ts"));

if (failed > 0) {
  console.log(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll joining-flow checks passed.");
