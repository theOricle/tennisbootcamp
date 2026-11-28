// Run from project root: npx tsx src/scripts/test-joining-flow.ts
//
// Pins audit item L (owner decision 2026-10-12, "joining flow: open
// enrollment, level confirmed on court"): groups are open to join, the coach
// confirms the level on court in week one with the move-or-refund promise,
// High Performance is by approval, the $20 assessment is optional (for
// certainty, never a step), and a level from the quiz or a placement reads as
// provisional until week one. The copy must not contradict the Program
// Policies, and adds no legal terms.
//
// Since the simpler site (backlog #69, owner 2026-11-16 and 2026-11-17) it
// also pins where each of those is said: the three joining steps on the home
// page (pick a group, pay online, start on court), "Good to know" under the
// groups on /programs and the program pages, and nothing on a group card
// but its own action; and the bootcamp words: every class is tennis and
// fitness, named Tennis and Fitness, with the words that never appear. Pass 2
// adds the same words on the two bootcamp programs' entries and on About.
//
// Since backlog #70 (owner, 2026-11-17) it pins the three points about what
// a bootcamp is (the band under the home page's hero), the Tennis and
// Fitness graphic on About, a rendered home page with no price on it, and
// the rule that no page states a general class length or a number of classes
// a week.
//
// Since backlog #71 (owner, 2026-11-18) the third point hints at the levels
// and moving up ("Five levels to climb", the count from the tier setting),
// and every group's button reads "Ask to join" until that group can take
// payment. Since backlog #85 (owner, 2026-11-19 and 2026-11-20) a group can:
// each open block is a card whose lime "Enroll" opens its sign-up page, and a
// group with no open block reads "Dates coming soon" and "Notify me".
//
// Since backlog #74 (owner, 2026-11-19) the band's first two points name
// the two parts, each with what it trains ("Tennis technique, tactics and
// focus", "Fitness for power and stamina"; the racket and the bolt), and
// Fitness trains power, stamina, stability and cardio: About's tiles, the
// program pages' lists and the brief. "Tennis and fitness in every class"
// and "Point play to finish every class" left the home band only.
// Checks that read source text normalise line endings (`read`). Exits
// non-zero on any failure. Never spells the cohort length or total.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  APPROVAL_ASK_LINE,
  APPROVAL_LINE,
  ASSESSMENT_CERTAINTY_LINE,
  COHORT_LENGTH,
  COHORT_LENGTH_ADJ,
  COHORT_TOTAL_CENTS,
  COHORT_WEEKS,
  GROUP_MAX_PLAYERS,
  PLACEMENT_LINE,
  RIGHT_GROUP_PROMISE,
  RIGHT_GROUP_PROMISE_SHORT,
  CLASS_LINE,
  listedPrograms,
  numberInWords,
  programGroups,
  programs,
} from "../content/programs";
import {
  BOOTCAMP_POINTS,
  BOOTCAMP_POINTS_LABEL,
  CLASS_HEADING,
  CLASS_IDEA,
  CLASS_PARTS,
  CLASS_RUNS,
  trainsInWords,
} from "../content/bootcamp";
import AboutPage from "../app/about/page";
// The home page's hero imports its player as a PNG; the stub goes first so the page renders here.
import "./stub-static-images";
import HomePage from "../app/page";
import { COOLING_OFF_DAYS } from "../content/policies";
import { groupStatus } from "../lib/programCatalog";
import { blockFacts } from "../lib/groupBlocks";
import type { Cohort } from "../types/cohort";
import { TIER_COUNT, TIER_COUNT_WORD } from "../lib/tiers";
import {
  CardioIcon,
  FocusIcon,
  FootworkIcon,
  PointPlayIcon,
  PowerIcon,
  StabilityIcon,
  StairsIcon,
  StaminaIcon,
  TacticsIcon,
  TechniqueIcon,
} from "../components/ui/icons";
import { nextStepFor } from "../lib/dashboardState";
import { BootcampClass } from "../components/sections/BootcampClass";
import { BootcampPoints } from "../components/sections/BootcampPoints";
import { GoodToKnow } from "../components/sections/GoodToKnow";
import { HowJoiningWorks, JOINING_STEPS } from "../components/sections/HowJoiningWorks";
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
check("the same fact beside an Ask to join button: what asking is, who decides, no assessment", APPROVAL_ASK_LINE === "Ask to join: it is the 2-minute quiz, and our coaches approve each spot. No assessment needed.");
check(
  "the assessment line: optional, the $20 mechanic spelled out (voice.md rule 2)",
  ASSESSMENT_CERTAINTY_LINE.includes("optional") &&
    ASSESSMENT_CERTAINTY_LINE.includes("$20") &&
    ASSESSMENT_CERTAINTY_LINE.includes("if you enroll in a program afterward that $20 comes off the price")
);
check("the placement line names the week-one check, and no assessment", PLACEMENT_LINE.includes("confirms your level on court in week one") && !/assessment/i.test(PLACEMENT_LINE));
check("both scheduled programs end their description on it", [youth, adults].every((p) => p.longDescription.endsWith(PLACEMENT_LINE)));
const LINES = [RIGHT_GROUP_PROMISE, RIGHT_GROUP_PROMISE_SHORT, APPROVAL_LINE, APPROVAL_ASK_LINE, ASSESSMENT_CERTAINTY_LINE, PLACEMENT_LINE];
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
// Owner-approved design, 2026-11-17: no rules on the card. The Join and Week 1
// rows left it; the promise and how High Performance is joined are said once
// on the page, under "Good to know". The card keeps its chip and one button.
console.log("Group cards: no rules on the card, one action");
// Backlog #85: a card shows an open block (its dates, class days, price and
// seats), or, for a group with none, "Dates coming soon". The blocks here
// are ones a coach could open, at the setting's own price and length.
const sampleBlock = (id: string, programId: string, day: "Sat" | "Sun", start: string, end: string, levelMin: number, levelMax: number): Cohort => ({
  id, programId, locationId: "", label: id, startDate: "2027-01-09", endDate: "", weeks: COHORT_WEEKS, sessions: [{ day, start, end }],
  capacityMin: 4, capacityMax: 8, priceCents: COHORT_TOTAL_CENTS, currency: "CAD", status: "open", levelMin, levelMax,
});
const cardFor = (g: (typeof programGroups)[number], block: Cohort | null = null) =>
  render(createElement(ProgramGroupCard, { group: g, block: block ? blockFacts(block) : null }));
const hpCard = cardFor(group("high-performance"), sampleBlock("hp-winter", "youth-programs", "Sat", "14:00", "15:00", 5, 7));
const openCard = cardFor(group("adult-newer"), sampleBlock("adult-beg-winter", "bootcamps", "Sun", "16:00", "17:00", 1, 1.5));
const datelessCard = cardFor(group("adult-newer"));
check("no scheduled card carries the promise or a Week 1 row", scheduled.every((g) => !cardFor(g).includes(RIGHT_GROUP_PROMISE_SHORT) && !cardFor(g).includes(RIGHT_GROUP_PROMISE) && !cardFor(g).includes("Week 1")));
check("no card carries a Join row or the approval line", scheduled.every((g) => !cardFor(g).includes(APPROVAL_LINE) && !cardFor(g).includes(APPROVAL_ASK_LINE) && !cardFor(g).includes("<dt")));
check("High Performance: the By approval chip and an outline Ask to join, named for the group", hpCard.includes("By approval") && />Ask to join<span class="sr-only"> the High Performance Youth Bootcamp, Jan 9 – Feb 13<\/span><\/a>/.test(hpCard) && !/<a [^>]*bg-\[#B4E655\]/.test(hpCard));
// Re-pinned for backlog #85 (owner, 2026-11-19): the open block's lime button
// reads "Enroll" (owner, 2026-11-20; "Join" in the first pictures), with its
// sign-up page and payment behind it (backlog #71 had it read "Ask to join"
// while it opened the quiz).
check("an open block: the Open to join chip and a lime Enroll, named for the group", openCard.includes("Open to join") && /<a [^>]*bg-\[#B4E655\][^>]*>Enroll<span class="sr-only"> in the Beginner Adult Bootcamp, Jan 10 – Feb 14<\/span><\/a>/.test(openCard) && !openCard.includes(">Ask to join<"));
check("still one link per card: Enroll and Ask to join open the block's sign-up page, where it is paid for or, by approval, asked for", count(hpCard, "<a ") === 1 && count(openCard, "<a ") === 1 && hpCard.includes('href="/enroll/hp-winter"') && openCard.includes('href="/enroll/adult-beg-winter"') && !hpCard.includes("/intake") && !openCard.includes("/intake"));
check("a group with no open block: Dates coming soon and an outline Notify me (owner, 2026-11-20)", datelessCard.includes("Dates coming soon</li>") && /<a [^>]*href="#notify"[^>]*>Notify me<span class="sr-only"> when a new cohort opens<\/span><\/a>/.test(datelessCard) && !datelessCard.includes("/enroll") && !datelessCard.includes("Open to join"));
// The line beside the High Performance row describes its button: the block's
// sign-up page stops a walk-in with its approval step, which is the quiz.
check("Good to know still says what asking is, beside the by-approval group: the quiz, then our coaches' approval", APPROVAL_ASK_LINE.startsWith("Ask to join: it is the 2-minute quiz") && hpCard.includes(">Ask to join<") && openCard.includes(">Enroll<"));
check("no assessment pitch on a card (design-system.md)", !hpCard.includes("Book Your Assessment") && !openCard.includes("Book Your Assessment"));

// ── How joining works (home) ────────────────────────────────────────────────
console.log("How joining works: three steps, ordered-list semantics");
const steps = render(createElement(HowJoiningWorks));
check("a labelled section with its h2", /<section id="how-joining-works" aria-labelledby="how-joining-works-heading"/.test(steps) && steps.includes('<h2 id="how-joining-works-heading"') && steps.includes(">How joining works</h2>"));
check("a real ordered list of three steps", count(steps, '<ol role="list"') === 1 && count(steps, "<li") === 3);
check("each step's icon sits in a ring, and the icons and the joining lines are decoration", count(steps, '<span aria-hidden="true" class="grid h-11 w-11 place-items-center rounded-full') === 3 && count(steps, '<span aria-hidden="true" class="absolute') === 2 && count(steps, "<svg") === count(steps, '<svg aria-hidden="true" focusable="false"'));
check(
  "the steps in order: pick a group, pay online, start on court",
  at(steps, ">Pick a group</h3>") > 0 &&
    at(steps, ">Pick a group</h3>") < at(steps, ">Pay online</h3>") &&
    at(steps, ">Pay online</h3>") < at(steps, ">Start on court</h3>") &&
    JOINING_STEPS.map((step) => step.title).join("|") === "Pick a group|Pay online|Start on court"
);
check("step 1: by age and level", steps.includes(">By age and level.</p>"));
// Card payment is not live, so the step says e-transfer only; "Card or e-transfer." returns with join-and-pay.
// Backlog #70 (owner, 2026-11-17): no price on the home page, so the step lost its amounts ("… a session, … for the … weeks.") and says only how it is paid.
// The "no card" half held two backspace characters where its word boundaries belonged, so it could never fail; it is a real check now.
check("step 2: how it is paid today, by e-transfer: no amount, and no card", JOINING_STEPS[1].body === "By e-transfer." && steps.includes(">By e-transfer.</p>") && !/\bcard\b/i.test(steps.replace(/<[^>]+>/g, " ")));
check("…and the no-card check can fail: it finds the word when it is there", /\bcard\b/i.test("Card or e-transfer.") && !/\bcard\b/i.test("a postcard"));
check("no step states an amount: no dollar sign and no per-session figure anywhere in the steps", !steps.includes("$") && !/a session|per session/i.test(steps) && JOINING_STEPS.every((step) => !/[$\d]/.test(step.body)));
check("step 3: the coach confirms the level in week one, then the promise, the one constant", JOINING_STEPS[2].body === `Your coach confirms your level in week one. ${RIGHT_GROUP_PROMISE}` && steps.includes(`Your coach confirms your level in week one. ${RIGHT_GROUP_PROMISE}`));
check("no link and no button in the steps: the main action sits in the hero and the closing", count(steps, "<a ") === 0 && count(steps, "<button") === 0);
const joining = read("src/components/sections/HowJoiningWorks.tsx");
// Re-pinned for backlog #70: the steps read no price constant at all now; the promise is still the one constant.
check("the steps read no price and type none; the promise is read from src/content/programs.ts", !/SESSION_PRICE|COHORT_TOTAL|COHORT_LENGTH|PRICE_SUMMARY/.test(joining) && joining.includes("${RIGHT_GROUP_PROMISE}") && !/\$\d/.test(joining));
check("the home page renders them", read("src/app/page.tsx").includes("<HowJoiningWorks />"));

// ── Good to know (/programs and the program pages) ──────────────────────────
console.log("Good to know: said once, under the groups");
const gtk = render(createElement(GoodToKnow, { source: "test", approvalGroup: group("high-performance").name }));
const gtkPlain = render(createElement(GoodToKnow, { source: "test" }));
check("a labelled section with its h2", /<section id="good-to-know" aria-labelledby="good-to-know-heading"/.test(gtk) && gtk.includes('<h2 id="good-to-know-heading"') && gtk.includes(">Good to know</h2>"));
check("a real list: four rows, three without High Performance", count(gtk, '<ul role="list"') === 1 && count(gtk, "<li") === 4 && count(gtkPlain, "<li") === 3);
check(
  "the rows in order: week one, High Performance, certainty, cancellations",
  at(gtk, ">Week one, on court</h3>") > 0 &&
    at(gtk, ">Week one, on court</h3>") < at(gtk, ">The High Performance Youth Bootcamp is by approval</h3>") &&
    at(gtk, ">The High Performance Youth Bootcamp is by approval</h3>") < at(gtk, ">Want certainty first?</h3>") &&
    at(gtk, ">Want certainty first?</h3>") < at(gtk, ">Cancellations and make-ups</h3>")
);
check("week one: the coach confirms the level, then the promise in full", gtk.includes(`>Your coach confirms your level. ${RIGHT_GROUP_PROMISE}</p>`));
// The row names the group in full, never the tier (voice.md keeps the two
// apart): the design's shorter heading would read as the High Performance
// level, which the strip and the Level dropdown on the same page also name.
check("High Performance by approval only when asked, named as the group, never the tier: asking is the quiz, our coaches approve, no assessment", gtk.includes(`>${APPROVAL_ASK_LINE}</p>`) && !gtk.includes(">High Performance is by approval") && !gtkPlain.includes("High Performance") && !/High Performance tier/i.test(gtk));
check("the optional assessment: certainty first, the mechanic, the exact label", gtk.includes(`>${ASSESSMENT_CERTAINTY_LINE}</p>`) && /<a [^>]*href="\/assessment\/book"[^>]*>Book Your Assessment<span aria-hidden="true"[^>]*>→<\/span><\/a>/.test(gtk));
check("cancellations and make-ups: the way to the Program Policies, and no terms of its own", /<a [^>]*href="\/legal\/refund-policy"[^>]*>Program Policies<span aria-hidden="true"[^>]*>→<\/span><\/a>/.test(gtk) && !/\b(days?|fee|percent|%)\b/i.test(gtk.slice(at(gtk, ">Cancellations and make-ups</h3>"))));
check("two links, neither a lime primary button", count(gtk, "<a ") === 2 && !/<a [^>]*bg-\[#B4E655\]/.test(gtk));
check("the icons are decoration", count(gtk, "<svg") === 4 && count(gtk, '<svg aria-hidden="true" focusable="false"') === 4);

// ── The pages ───────────────────────────────────────────────────────────────
console.log("Pages: /programs and the program pages");
const programsPage = read("src/app/programs/page.tsx");
const catalogSrc = read("src/components/sections/ProgramCatalog.tsx");
check("/programs: Good to know follows the groups, with High Performance where a by-approval group is listed", at(programsPage, "<ProgramCatalog") < at(programsPage, "<GoodToKnow") && programsPage.includes('approvalGroup={programGroups.find((g) => g.joining === "approval")?.name}'));
check("/programs: the quiz is a side line under the dropdowns, never a lime button", catalogSrc.includes('<QuizSideLine source="programs-filters"') && at(catalogSrc, "<Filters query={query}") < at(catalogSrc, "<QuizSideLine") && !programsPage.includes('variant="primary"'));
// Backlog #70: the lead lost "one …-minute class a week" and keeps the cohort length, from the constant.
// Re-pinned for backlog #85 (fix round 3): "Pick your group and enroll." while a block is open; with none, the line that dates are coming.
check("/programs: the lead says what every group is and how long a cohort runs, from the constant, with no class length and no classes a week", /Every group is a bootcamp: tennis and fitness in every class, in \{COHORT_LENGTH_ADJ\} cohorts\.\{" "\}\s+\{anyOpen \? "Pick your group and enroll\." : PROGRAMS_NO_DATES_LINE\}/.test(programsPage) && !/minute|a week|SESSION_MINUTES/.test(programsPage.replace(/\{\/\*[\s\S]*?\*\/\}|\/\/[^\n]*/g, "")));
const detail = read("src/app/programs/[slug]/page.tsx");
// Re-pinned for backlog #85 (fix round): the section shows with its cards, read from the open blocks and the lineup.
check("detail: Good to know after the groups, only for a program with fixed classes", /cards\.length > 0 && \(\s*<>\s*<section aria-labelledby=\{GROUPS_ANCHOR\}/.test(detail) && detail.includes('.filter((c) => c.group.status !== "arranged")') && at(detail, "aria-labelledby={GROUPS_ANCHOR}") < at(detail, "<GoodToKnow") && !detail.includes("<HowJoiningWorks"));
check("detail: it lists High Performance only where it trains, and the side line links the program's quiz", detail.includes('approvalGroup={scheduledGroups.find((g) => g.joining === "approval")?.name}') && detail.includes('<QuizSideLine source="program-detail" quizHref={quizHref}'));
// Second fix round, 2026-11-17: the levels block said the old way in, beside "Pick your group and join"; it now says what About says. Private Lessons keeps its own line.
check(
  "detail: the levels block says each group trains at one level, confirmed on court in week one; Private Lessons keeps its line",
  detail.includes('"Every group trains at one level, and your coach confirms yours on court in week one."') &&
    detail.includes('"Our coaches place every player on the ladder, from the quiz or on court."') &&
    !detail.includes("on the ladder from the quiz, and confirm")
);
check("detail: the assessment button says optional", detail.includes("Optional, if you want your level confirmed before you enroll."));

// ── The bootcamp words (owner, 2026-11-16 and 2026-11-17) ───────────────────
console.log("The bootcamp words: tennis and fitness in every class");
check("the heading", CLASS_HEADING === "Tennis and fitness in every class.");
check("the two parts are named Tennis and Fitness, in that order", CLASS_PARTS.map((part) => part.name).join("|") === "Tennis|Fitness");
check("Tennis trains Technique, Footwork, Tactics, Focus", CLASS_PARTS[0].trains.map((t) => t.label).join("|") === "Technique|Footwork|Tactics|Focus" && CLASS_PARTS[0].tone === "lime" && CLASS_PARTS[0].tag === undefined);
// Re-pinned for backlog #74 (owner, 2026-11-19: hard fitness work built for
// tennis, for power, stamina, stability and cardio): Fitness trained Power,
// Speed, Stamina and Mobility.
check(
  "Fitness, Built for tennis, trains Power, Stamina, Stability, Cardio, each with its own glyph",
  CLASS_PARTS[1].trains.map((t) => t.label).join("|") === "Power|Stamina|Stability|Cardio" &&
    CLASS_PARTS[1].trains.map((t) => t.icon).join("|") === "power|stamina|stability|cardio" &&
    CLASS_PARTS[1].tone === "court" &&
    CLASS_PARTS[1].tag === "Built for tennis"
);
check("no Fitness tile is Speed or Mobility any more", CLASS_PARTS.every((part) => part.trains.every((t) => !/speed|mobility/i.test(`${t.label} ${t.icon}`))));
check("ten words in all: the two names and the eight things they train", new Set([...CLASS_PARTS.map((part) => part.name), ...CLASS_PARTS.flatMap((part) => part.trains.map((t) => t.label))]).size === 10);
check("how a class runs: it rotates between the two all class, and finishes with point play", CLASS_RUNS[0].text === "Rotate between the two all class" && CLASS_RUNS[1].text === "Finish with point play");
// Re-pinned for backlog #70: the graphic's third line was the group size
// ("Up to … players a group"). The graphic lives on About now, which states
// the size once, in its list, so the line left the graphic; the number is
// still the one setting, read by About and by the program entries below.
check("how a class runs is two lines: the group size is not one of them", CLASS_RUNS.length === 2 && GROUP_MAX_PLAYERS === 8);
const bootcampSrc = read("src/content/bootcamp.ts");
// Re-pinned for backlog #71: the words read the cohort length from
// src/content/programs.ts for the third point. That point is the levels now,
// so they read the tier count from src/lib/tiers.ts, and nothing else.
check("the class words carry no group size and type no number: the level count comes from src/lib/tiers.ts", !/players a group|GROUP_MAX_PLAYERS|Up to/.test(bootcampSrc) && bootcampSrc.includes('import { TIER_COUNT_WORD } from "@/lib/tiers";') && !bootcampSrc.includes("COHORT_LENGTH") && [CLASS_HEADING, ...CLASS_RUNS.map((run) => run.text), ...CLASS_PARTS.flatMap((part) => [part.name, part.tag ?? "", ...part.trains.map((tile) => tile.label)])].every((words) => !/\d/.test(words)));
const classSection = render(createElement(BootcampClass));
// Re-pinned for backlog #70: the graphic had its own h2 ("Tennis and fitness
// in every class.") as a home section. On About it sits under that page's
// "How a cohort works" h2, so it has no heading of its own, and no band.
check("the graphic: Tennis and Fitness as h3s, and no heading or landmark of its own", at(classSection, ">Tennis</h3>") > 0 && at(classSection, ">Tennis</h3>") < at(classSection, ">Fitness</h3>") && !classSection.includes("<h2") && !classSection.includes("<section") && !classSection.includes(CLASS_HEADING));
// Backlog #70, fix round: the two names never out-shout About's h1 (30px,
// 36px from md): 28px, 32px from md, and no lg step.
check(
  "the graphic's names sit under the page title: 28px, 32px from md, no lg step",
  count(classSection, 'class="text-[28px] font-bold leading-none tracking-[-0.03em] md:text-[32px]"') === 2 &&
    !/<h3[^>]*(lg:text-|md:text-4xl|text-\[(3[6-9]|4\d)px\])/.test(classSection)
);
check("real lists: four things under each part, two lines under both", count(classSection, '<ul role="list"') === 3 && count(classSection, "<li") === 10);
check("every word is text", [...CLASS_PARTS.flatMap((part) => part.trains.map((t) => t.label)), "Built for tennis", ...CLASS_RUNS.map((run) => run.text)].every((word) => classSection.includes(`${word}</`)));
check("the rotate glyph between the blocks, and every icon, is decoration", count(classSection, "<svg") === 11 && count(classSection, '<svg aria-hidden="true" focusable="false"') === 11 && classSection.includes('<div aria-hidden="true" class="grid h-12 place-items-center'));
check("the graphic states no group size, no price, no class length and no classes a week", !/players a group|\$|minute|a week/i.test(classSection.replace(/<[^>]+>/g, " ")));
check("the icons are drawn here: inline SVG in the text colour, no icon font and no package", (() => { const icons = read("src/components/ui/icons.tsx"); return icons.includes('stroke="currentColor"') && icons.includes('aria-hidden="true"') && icons.includes('focusable="false"') && !/^import .* from "(?!react")/m.test(icons); })());
// Backlog #74 (owner, 2026-11-19): Stability and Cardio are new glyphs and
// Stamina is redrawn, so the four Fitness tiles read as one set and each is
// its own shape. Cardio takes the heart with a pulse, so Stamina is no
// longer a pulse line: a charged battery, the energy that lasts.
{
  const icons = read("src/components/ui/icons.tsx");
  const inner = (svg: string) => svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");
  const tennisGlyphs = [TechniqueIcon, FootworkIcon, TacticsIcon, FocusIcon].map((icon) => render(createElement(icon, {})));
  const fitnessGlyphs = [PowerIcon, StaminaIcon, StabilityIcon, CardioIcon].map((icon) => render(createElement(icon, {})));
  const [, stamina, stability, cardio] = fitnessGlyphs.map(inner);
  check(
    "the four Fitness glyphs are one set: the 24-unit grid, the site's line weight of 2, round caps and joins, decoration",
    fitnessGlyphs.every(
      (svg) =>
        svg.startsWith('<svg aria-hidden="true" focusable="false"') &&
        svg.includes('viewBox="0 0 24 24"') &&
        svg.includes('stroke-width="2"') &&
        svg.includes('stroke-linecap="round"') &&
        svg.includes('stroke-linejoin="round"')
    )
  );
  check("…in one weight: no Fitness glyph sets a line weight of its own inside", fitnessGlyphs.every((svg) => !inner(svg).includes("stroke-width")));
  check("eight different drawings: no tile shares its glyph with another, Tennis or Fitness", new Set([...tennisGlyphs, ...fitnessGlyphs].map(inner)).size === 8);
  check(
    "Cardio is a heart with a pulse through it; Stamina is a battery of three bars, and the old pulse line is gone",
    count(cardio, "<path") === 2 &&
      /Z"/.test(cardio) &&
      /^<rect [^>]*><\/rect><path d="(M[\d.]+ [\d.]+v[\d.]+){4}"><\/path>$/.test(stamina) &&
      !icons.includes("M2.5 12.5h3.6l2.3-6 3.8 12 2.7-8.2 1.5 2.2h5.1"),
    stamina
  );
  check(
    "the new glyphs sit on the box like the stairs: the beam 3 to 21, the battery 2.4 to 21.6, the heart's pulse 4.1 to 19.9",
    stability.includes('d="M3 10.5h18"') &&
      stamina.includes('x="2.4"') && stamina.includes('width="16.4"') && stamina.includes("M21.6 10.4v3.2") &&
      cardio.includes('d="M4.1 12h5.65l.45-.9 1.8 4.05 1.8-6.3 1.35 3.15h4.74"')
  );
  check(
    "Speed and Mobility are gone from the icons, and the shape taken from Lucide says so, with its licence",
    !icons.includes("SpeedIcon") && !icons.includes("MobilityIcon") && /Lucide icon set\s+(\*\s+)?\("heart-pulse"\), ISC licence/.test(icons)
  );
  check(
    "About draws each Fitness tile with its glyph, in order: Power, Stamina, Stability, Cardio",
    CLASS_PARTS[1].trains.every((tile, i) => classSection.includes(`${inner(fitnessGlyphs[i])}</svg></span>${tile.label}</li>`)) &&
      at(classSection, ">Power</li>") > at(classSection, ">Fitness</h3>") &&
      ["Power", "Stamina", "Stability", "Cardio"].every((label, i, all) => i === 0 || at(classSection, `${all[i - 1]}</li>`) < at(classSection, `${label}</li>`))
  );
  check(
    "About's Tennis tiles are unchanged: the racket at the site's 2 keeps strings at 1 and the handle at 3",
    CLASS_PARTS[0].trains.every((tile, i) => classSection.includes(`${inner(tennisGlyphs[i])}</svg></span>${tile.label}</li>`)) &&
      tennisGlyphs[0].includes('stroke-width="2"') &&
      inner(tennisGlyphs[0]).includes('stroke-width="1" opacity="0.7"') &&
      inner(tennisGlyphs[0]).includes('<path d="M12 16.6v5.6" stroke-width="3">')
  );
}

// ── The three points (backlog #70; owner, 2026-11-17) ───────────────────────
// What a bootcamp is, in a thin band straight under the home page's hero, in
// place of the Tennis and Fitness section: three points, each an icon and
// one phrase with a bold lead.
console.log("The three points: what a bootcamp is (home, under the hero)");
const pointWords = BOOTCAMP_POINTS.map((point) => `${point.lead} ${point.rest}`);
// Re-pinned for backlog #71 (owner, 2026-11-18): the third point was "One
// group for all (the cohort length)". It hints at the levels and moving up.
const LEVEL_COUNT_WORD = `${TIER_COUNT_WORD.charAt(0).toUpperCase()}${TIER_COUNT_WORD.slice(1)}`;
// Re-pinned for backlog #74 (owner, 2026-11-19): the first two points were
// "Tennis and fitness in every class" (the two arrows) and "Point play to
// finish every class" (the court with a ball). They name the two parts now,
// each with what it trains (the racket, the bolt). Both old lines left the
// home band only: the program cards' lines, the page descriptions and the
// quiz's reason lines keep the idea, About and the program pages keep point
// play (pinned below).
check("three points, in order: Tennis, Fitness, the levels", BOOTCAMP_POINTS.length === 3 && BOOTCAMP_POINTS.map((point) => point.lead).join("|") === `Tennis|Fitness|${LEVEL_COUNT_WORD} levels`);
check("their words: technique, tactics and focus; for power and stamina; to climb", BOOTCAMP_POINTS[0].rest === "technique, tactics and focus" && BOOTCAMP_POINTS[1].rest === "for power and stamina" && BOOTCAMP_POINTS[2].rest === "to climb");
check("today that reads Tennis technique, tactics and focus · Fitness for power and stamina · Five levels to climb", pointWords.join(" · ") === "Tennis technique, tactics and focus · Fitness for power and stamina · Five levels to climb" && TIER_COUNT === 5);
// Replaces "the first point is the class idea, word for word", removed for
// backlog #74: the band no longer says the idea in a sentence. CLASS_HEADING
// and CLASS_IDEA are still pinned where they are used (below).
const aimsOf = (rest: string) => rest.replace(/^for /, "").split(/, | and /);
check(
  "the first two points are the two parts by their own names, in the graphic's order, and each names only what that part trains",
  BOOTCAMP_POINTS[0].lead === CLASS_PARTS[0].name &&
    BOOTCAMP_POINTS[1].lead === CLASS_PARTS[1].name &&
    [0, 1].every((i) => aimsOf(BOOTCAMP_POINTS[i].rest).every((aim) => CLASS_PARTS[i].trains.some((tile) => tile.label.toLowerCase() === aim)))
);
check(
  "one list only: three things after Tennis, two after Fitness, so two lists never sit side by side",
  aimsOf(BOOTCAMP_POINTS[0].rest).length === 3 && aimsOf(BOOTCAMP_POINTS[1].rest).length === 2 && BOOTCAMP_POINTS.filter((point) => point.rest.includes(",")).length === 1
);
check(
  "the band no longer says tennis and fitness in every class or point play to finish every class",
  pointWords.every((words) => !words.toLowerCase().includes(CLASS_IDEA) && !/point play|every class/i.test(words))
);
check(
  "the third point reads the level count from the setting (TIER_COUNT_WORD), capitalised, and types no number",
  TIER_COUNT_WORD === ["zero", "one", "two", "three", "four", "five", "six", "seven"][TIER_COUNT] &&
    bootcampSrc.includes("TIER_COUNT_WORD.charAt(0).toUpperCase()") &&
    bootcampSrc.includes("lead: `${LEVEL_COUNT} levels`") &&
    !/\b(five|Five|5)\b/.test(bootcampSrc.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, "")) &&
    !/\d/.test(pointWords.join(" "))
);
check("climb is the ladder's own word, on the levels page the band's word points to", read("src/app/assessment/page.tsx").includes("The ladder you&apos;re climbing"));
check("their icons: the racket, the bolt, the stairs", BOOTCAMP_POINTS.map((point) => point.icon).join("|") === "technique|power|stairs");
check("no price, no group size, no class length and no classes a week in the points", pointWords.every((words) => !/\$|price|session|players|up to|minute|hour|a week|once|twice/i.test(words)));
const band = render(createElement(BootcampPoints));
const bandText = band.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
check("a labelled band on hairlines, with no heading: its name is for assistive tech", band.startsWith(`<section aria-label="${BOOTCAMP_POINTS_LABEL}" class="border-y border-white/10">`) && BOOTCAMP_POINTS_LABEL === "What a bootcamp is" && !/<h[1-6]/.test(band));
check("a real list of three items, in the points' order", count(band, '<ul role="list"') === 1 && count(band, "<li") === 3 && at(band, ">Tennis</b>") > 0 && at(band, ">Tennis</b>") < at(band, ">Fitness</b>") && at(band, ">Fitness</b>") < at(band, ">Five levels</b>"));
check("each point is a bold lead and the rest of its phrase, as text", BOOTCAMP_POINTS.every((point) => band.includes(`>${point.lead}</b>`) && band.replace(/<!-- -->/g, "").includes(`</b> ${point.rest}</span>`)) && bandText === pointWords.join(" "), bandText);
check("three icons, lime and decoration, and nothing else drawn", count(band, "<svg") === 3 && count(band, '<svg aria-hidden="true" focusable="false"') === 3 && count(band, "text-[#B4E655]") === 3);
// Backlog #71: the stairs joined the band. The three read as one set: the
// same 24-unit grid, the band's stroke, the same box. The stairs were drawn
// as wide as the court and the arrows that stood beside them then (3 to
// 21), centred on the box; backlog #74 put the racket and the bolt beside
// them, and the stairs keep their shape.
check("the three icons are one set: one grid, the band's 1.8 stroke, one box (24px, 32px from md)", count(band, 'viewBox="0 0 24 24"') === 3 && count(band, 'stroke-width="1.8"') === 3 && count(band, 'class="h-6 w-6 shrink-0 text-[#B4E655] md:h-8 md:w-8"') === 3);
// Backlog #74: the racket and the bolt take the band's stroke like the
// stairs, and the racket's strings and handle follow it in proportion (half
// and one and a half times the frame), so it reads the same at 24px as on
// About's tiles. No other line weight in the band, and no float noise.
check(
  "the band draws the racket, the bolt and the stairs, the racket's strings at 0.9 and its handle at 2.7 at the band's 1.8",
  band.includes(render(createElement(TechniqueIcon, { className: "h-6 w-6 shrink-0 text-[#B4E655] md:h-8 md:w-8", strokeWidth: 1.8 }))) &&
    band.includes(render(createElement(PowerIcon, { className: "h-6 w-6 shrink-0 text-[#B4E655] md:h-8 md:w-8", strokeWidth: 1.8 }))) &&
    band.includes(render(createElement(StairsIcon, { className: "h-6 w-6 shrink-0 text-[#B4E655] md:h-8 md:w-8", strokeWidth: 1.8 }))) &&
    band.includes('stroke-width="0.9" opacity="0.7"') &&
    band.includes('<path d="M12 16.6v5.6" stroke-width="2.7">') &&
    [...band.matchAll(/stroke-width="([^"]+)"/g)].map((m) => m[1]).sort().join("|") === "0.9|1.8|1.8|1.8|2.7"
);
{
  const stairs = render(createElement(StairsIcon, { strokeWidth: 1.8 }));
  const d = stairs.match(/ d="([^"]+)"/)?.[1] ?? "";
  const tokens = d.match(/[A-Za-z]|-?\d*\.?\d+/g) ?? [];
  let cmd = "";
  let x = 0;
  let y = 0;
  const xs: number[] = [];
  const ys: number[] = [];
  let risers = 0;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (/[A-Za-z]/.test(t)) {
      cmd = t;
      if (cmd === "v") risers++;
      continue;
    }
    const n = Number(t);
    if (cmd === "M") {
      x = n;
      y = Number(tokens[++i]);
    } else if (cmd === "h") x += n;
    else if (cmd === "H") x = n;
    else if (cmd === "v") y += n;
    else if (cmd === "V") y = n;
    xs.push(x);
    ys.push(y);
  }
  const court = render(createElement(PointPlayIcon, {}));
  const round = (n: number) => Math.round(n * 100) / 100;
  check(
    "the stairs: five treads rising to the right, 3 to 21 like the court's 18 units, centred on the box, one path",
    count(stairs, "<path") === 1 && /^[MhvH\d.\s-]+$/.test(d) && risers === 4 && round(Math.min(...xs)) === 3 && round(Math.max(...xs)) === 21 && round((Math.min(...ys) + Math.max(...ys)) / 2) === 12 && ys[0] === Math.max(...ys) && court.includes('x="3"') && court.includes('width="18"'),
    d
  );
}
check("no link, no button, no price and no group size in the band", count(band, "<a ") === 0 && count(band, "<button") === 0 && !band.includes("$") && !/players|price|session/i.test(bandText));
check("on a phone three rows of one line; from md three columns with a hairline between, the lead on its own line", band.includes("md:grid-cols-3") && band.includes("md:border-l md:border-white/10") && band.includes("md:first:border-l-0") && band.includes('<span class="min-w-0 md:grid">'));
// Backlog #74, fix round, 2026-11-19: the new phrases are longer, so the
// rest steps down where a line is tightest and every phrase stays on one
// line at every width: 14px below 330px, 15px on a phone, 14px between md
// and lg (the narrowest columns), 16px from lg.
{
  const itemClasses = [...band.matchAll(/<li class="([^"]+)"/g)].map((m) => m[1].split(" "));
  check(
    "every phrase stays on one line: the rest at 14px below 330px, 15px from 330px, 14px between md and lg, 16px from lg",
    itemClasses.length === 3 &&
      itemClasses.every((c) => ["text-[14px]", "min-[330px]:text-[15px]", "md:text-sm", "lg:text-base"].every((k) => c.includes(k)) && !c.includes("text-[15px]") && !c.includes("md:text-base")),
    itemClasses.map((c) => c.join(" ")).join(" | ")
  );
}
const homeSrc = read("src/app/page.tsx");
check(
  "the band sits between the hero and the programs on home, outside the hero",
  /<Hero \/>\s*(\{\/\*[\s\S]*?\*\/\}\s*)*<BootcampPoints \/>\s*(\{\/\*[\s\S]*?\*\/\}\s*)*<Container[^>]*>\s*<ProgramsGrid/.test(homeSrc) &&
    !read("src/components/sections/Hero.tsx").includes("BootcampPoints")
);

// ── The home page, rendered (backlog #70; owner, 2026-11-17) ────────────────
// "No price of any kind on the home page." The whole page is rendered here,
// so a price that returns through any section fails, whichever file it is in.
console.log("The home page: no price of any kind");
const homePage = render(createElement(HomePage));
const homeText = homePage.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
check("the rendered home page has no dollar sign, in its text, its markup or its structured data", !homePage.includes("$"), homePage.match(/.{0,40}\$.{0,40}/)?.[0]);
check("…and no price word that needs no dollar sign: no per-session figure, no rates, no free", !/a session|per session|rates on request|\bfree\b|\bCAD\b/i.test(homeText), homeText.match(/a session|per session|rates on request|\bfree\b|\bCAD\b/i)?.[0]);
check("the render is the real page: the hero, the band, the programs, the steps, the closing", homePage.includes("Where Athletes") && at(homePage, "Where Athletes") < at(homePage, ">Tennis</b>") && at(homePage, ">Tennis</b>") < at(homePage, ">Our Programs</h2>") && at(homePage, ">Our Programs</h2>") < at(homePage, ">How joining works</h2>") && at(homePage, ">How joining works</h2>") < at(homePage, ">Groups are open to join.</h2>"));
check("the Tennis and Fitness graphic is not on the home page", !homePage.includes(">Tennis</h3>") && !homePage.includes(">Fitness</h3>") && !homeSrc.includes("BootcampClass"));
check("the line under Our Programs is gone, and nothing replaced it: the cards follow the heading", /<h2 id="programs-grid-title"[^>]*>Our Programs<\/h2><div class="mt-\[18px\] md:mt-6"><ul role="list"/.test(homePage));
check("no general class length and no classes a week on the home page", !/\d+-minute class|minutes? a week|class a week|classes a week|once a week/i.test(homeText), homeText.match(/\d+-minute class|minutes? a week|class a week|classes a week|once a week/i)?.[0]);
check("the home cards keep title, who and when, and the link: three cards, each one link, no price line", ["Ages 7–17 · Saturdays", "16 and up · Sundays", "Any age · By arrangement"].every((line) => homePage.includes(`>${line}</p>`)) && count(homePage, ">See groups") === 2 && count(homePage, ">See details") === 1);
// Backlog #71 (owner, 2026-11-18): the same group for the whole cohort left
// the home page only; the program pages' lists and About keep it (below).
check("the home page reads Five levels to climb and no longer One group for the whole cohort", homeText.includes("Five levels to climb") && !/One group for all/i.test(homeText) && !homeText.includes(`for all ${COHORT_LENGTH}`));
// Backlog #74 (owner, 2026-11-19): the band names Tennis and Fitness, each
// with what it trains, and the two lines it said before left the home page
// only. About and the program pages keep both (pinned below).
check(
  "the home page reads Tennis technique, tactics and focus and Fitness for power and stamina, and no longer the class idea or point play",
  homeText.includes("Tennis technique, tactics and focus") &&
    homeText.includes("Fitness for power and stamina") &&
    !homeText.toLowerCase().includes(CLASS_IDEA) &&
    !/point play/i.test(homeText),
  homeText.match(/.{0,30}(tennis and fitness in every class|point play).{0,30}/i)?.[0]
);

// ── The bootcamp words on the other pages (backlog #69, pass 2) ─────────────
// The program entries type their lines in src/content/programs.ts; they are
// pinned here to the class words, word for word.
console.log("The bootcamp words on the program entries and About");
const [tennis, fitness] = CLASS_PARTS;
check("the idea inside a sentence is the heading's own words", CLASS_IDEA === "tennis and fitness in every class" && `${CLASS_IDEA.charAt(0).toUpperCase()}${CLASS_IDEA.slice(1)}.` === CLASS_HEADING);
// Re-pinned for backlog #74: Fitness read "power, speed, stamina and mobility".
check("what each part trains, in words", trainsInWords(tennis) === "technique, footwork, tactics and focus" && trainsInWords(fitness) === "power, stamina, stability and cardio");
check(
  "how a class runs, in one sentence: players rotate between tennis drills and fitness drills built for tennis, and finish with point play",
  CLASS_LINE === "In every class, players rotate between tennis drills and fitness drills built for tennis, then finish with point play."
);
const TENNIS_LINE = `${tennis.name}: ${trainsInWords(tennis)}`;
const FITNESS_LINE = `${fitness.name} ${(fitness.tag ?? "").toLowerCase()}: ${trainsInWords(fitness)}`;
const OLD_WAY = /\bhalf\b|percent|%|circuit|strength-and-conditioning|fitness session|group class|weekend class|group lesson|per court|capped/i;
// Backlog #70 (owner, 2026-11-17): no general claim about how long a class is
// or how many there are a week. A group's own day and time range stays.
const GENERAL_LENGTH = /\d+[- ]minute|\bminutes\b|\bhours?\b|\bonce a week\b|\btwice a week\b|\ba week\b|\bweekly\b|\bevery (saturday|sunday|week)\b/i;
check("the scan for a general class length catches the old lines, and lets a group's own day and time through", ["one 60-minute class a week", "Once a week · 60 minutes", "one 60-minute class every Saturday", "One 60-minute class a week for the cohort"].every((old) => GENERAL_LENGTH.test(old)) && !GENERAL_LENGTH.test("Saturdays 12:00–1:00 pm") && !GENERAL_LENGTH.test("Three groups run back to back on Saturdays") && !GENERAL_LENGTH.test("confirmed on court in week one"));
const COHORTS_LEAD = `${COHORT_LENGTH_ADJ.charAt(0).toUpperCase()}${COHORT_LENGTH_ADJ.slice(1)} cohorts`;
for (const p of [youth, adults]) {
  const days = p === youth ? "Saturdays" : "Sundays";
  check(`${p.id}: the kind of class is Group bootcamp`, p.type === "Group bootcamp");
  check(`${p.id}: the card line opens on the idea`, p.description.startsWith(`${CLASS_HEADING.slice(0, -1)}: `), p.description);
  // Re-pinned for backlog #70: the cohort sentence ended ", one …-minute class every Saturday / Sunday."; the day now sits with the groups' own times.
  // Re-pinned for backlog #85 (fix round): the groups went with their day
  // and times ("Three groups run back to back on Saturdays: … at 12:00"),
  // since the cards below show each open group's own dates and days.
  check(
    `${p.id}: the long description opens on how a class runs, then the cohort, then its groups by ${p === youth ? "age and level" : "level"}, with no day, and still ends on the week-one line`,
    p.longDescription.startsWith(`${CLASS_LINE} Each cohort is a fixed group that trains together for ${COHORT_LENGTH}. The groups go by `) &&
      p.longDescription.includes("Each group below shows its dates and class times. ") &&
      !p.longDescription.includes(days) &&
      p.longDescription.endsWith(PLACEMENT_LINE),
    p.longDescription
  );
  check(`${p.id}: the search line says group bootcamps, tennis and fitness in every class`, (p.metaDescription ?? "").includes(CLASS_IDEA) && /group bootcamps/.test(p.metaDescription ?? ""), p.metaDescription);
  const list = p.includes ?? [];
  // Re-pinned for backlog #70: the first line was "One …-minute class a week
  // for (the cohort length)". It keeps the cohort length; the group size is
  // the same line, read from the setting. Re-pinned for backlog #71: the
  // first line was also the home band's third point, word for word; the band
  // hints at the levels now, and the line stays here unchanged (owner,
  // 2026-11-18), so the "same as the band" half of the check went.
  // Re-pinned for backlog #74: the point-play line was also the home band's
  // second point, word for word. The band names Fitness now, and the line
  // stays here unchanged (owner, 2026-11-19), so that "same as the band"
  // half went too; the line itself is still pinned, word for word. The
  // Fitness line reads the four new aims, typed out below as well.
  check(
    `${p.id}: what's included is one group for the cohort, the group size, the two parts and how a class ends, then one line of its own`,
    list.length === 6 &&
      list[0] === `One group for all ${COHORT_LENGTH}` &&
      list[1] === `Up to ${GROUP_MAX_PLAYERS} players a group` &&
      list[2] === TENNIS_LINE &&
      list[3] === FITNESS_LINE &&
      list[3] === "Fitness built for tennis: power, stamina, stability and cardio" &&
      list[4] === "Point play to finish every class",
    list.join(" | ")
  );
  // Re-pinned for backlog #70: the line read "Once a week · … minutes · …-week cohorts · Saturdays 12:00, 1:00 and 2:00".
  check(`${p.id}: the schedule line is the cohort length, then its groups' own day and starts`, p.schedule === `${COHORTS_LEAD} · ${days} ${p === youth ? "12:00, 1:00 and 2:00" : "4:00, 5:00 and 6:00"}`, p.schedule);
  const words = [p.description, p.longDescription, p.metaDescription ?? "", p.schedule ?? "", p.priceLine ?? "", p.priceSummary ?? "", p.levelNote ?? "", ...list].join(" ");
  check(`${p.id}: no share of the class, no circuit, no separate fitness session, nothing said the old way`, !OLD_WAY.test(words), words.match(OLD_WAY)?.[0]);
  check(`${p.id}: no old fitness aim in any of its words: no speed, no mobility (backlog #74)`, !/\b(speed|mobility)\b/i.test(words), words.match(/.{0,30}\b(speed|mobility)\b.{0,10}/i)?.[0]);
  check(`${p.id}: no general class length and no classes a week in any of its words`, !GENERAL_LENGTH.test(words), words.match(GENERAL_LENGTH)?.[0]);
  check(`${p.id}: no per-session figure in any of its words`, !/\ba session\b|per session/i.test(words), words.match(/.{0,30}(\ba session\b|per session).{0,10}/i)?.[0]);
}
// Re-pinned for backlog #85 (fix round): the programs' own words name no
// count of groups and no weekday; the cards show each group's dates and days.
// Re-pinned for backlog #85 (safety review): the paragraph listed three
// groups under a heading that counts the cards, "Four groups" with a block
// off the planned lineup. It says how the groups go and names none.
check(
  "Youth Bootcamps says how its groups go, names no list of them, and keeps its week-one line in the list",
  youth.longDescription.includes("The groups go by age and level, from juniors in their first season to the competitive track for players who compete, or are training to.") &&
    !/Junior Bootcamp|Youth Bootcamp|ages [0-9]/.test(youth.longDescription) &&
    youth.description.endsWith("groups for ages 7–17, by age and level.") &&
    (youth.levelNote ?? "").startsWith("Groups by age and level") &&
    youth.includes?.[5] === "One level per group, confirmed on court in week one"
);
check(
  "Adult Bootcamps keeps its levels and ages, and the coach's corrections in the list",
  adults.longDescription.includes("The groups go by level: Beginner, Intermediate and Advanced. Players 16 and up are welcome.") &&
    adults.description.endsWith("groups by level for adults and players 16 and up.") &&
    adults.levelNote === "Beginner, Intermediate and Advanced groups" &&
    adults.includes?.[5] === "Corrections from the coach every session"
);
const programsSrc = read("src/content/programs.ts");
check("the entries type no group size: the list reads GROUP_MAX_PLAYERS", programsSrc.includes("`Up to ${GROUP_MAX_PLAYERS} players a group`") && !/Up to \d/.test(programsSrc));
const entry = (id: string) => programs.find((p) => p.id === id)!;
check(
  "Private Lessons, the unlisted High Performance entry and the retired Group Lessons entry keep their words",
  entry("private-lessons").type === "One-to-one coaching" &&
    entry("private-lessons").description === "One-to-one coaching for any age and level, at a time arranged with you." &&
    !(entry("private-lessons").longDescription + entry("private-lessons").metaDescription).includes(CLASS_IDEA) &&
    entry("high-performance").unlisted === true &&
    entry("high-performance").description === "The competitive track, now a Saturday group inside Youth Bootcamps." &&
    entry("high-performance").longDescription === entry("high-performance").description &&
    entry("group-lessons").unlisted === true &&
    entry("group-lessons").type === "Group Lessons" &&
    entry("group-lessons").description.startsWith("Adult lessons capped at")
);
check(
  "one label for every scheduled program, Group bootcamp, and the type allows no other",
  programs.filter((p) => p.timetable?.length || p.id === "high-performance").every((p) => p.type === "Group bootcamp") &&
    read("src/types/program.ts").includes('export type ProgramType = "Group bootcamp" | "One-to-one coaching" | "Group Lessons";')
);
check(
  "the label is read from the entry wherever it shows: the program page, the quiz's match card and the enroll page",
  detail.includes('<span className="font-semibold text-[#B4E655]">{program.type}</span>') &&
    read("src/app/intake/page.tsx").includes("{program.type}</span>") &&
    read("src/app/enroll/[cohortId]/EnrollWizard.tsx").includes('{program?.type ?? "Program"}')
);

const aboutSrc = read("src/app/about/page.tsx");
const aboutPage = render(createElement(AboutPage));
check(
  "About: the hero says every group is a bootcamp, in the heading's words, and still defines a cohort",
  aboutPage.includes(`Every group is a bootcamp: ${CLASS_IDEA}. You train in a cohort — a fixed group that trains together for ${COHORT_LENGTH}.`) && aboutSrc.includes("is a bootcamp: {CLASS_IDEA}.")
);
const aboutText = aboutPage.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
// Re-pinned for backlog #70 (owner, 2026-11-17): the paragraph that said how
// a class runs and what each part trains ("In every class, players rotate …
// Tennis trains … Fitness trains …") left About. The Tennis and Fitness
// graphic, moved here from the home page, says it, once.
check(
  "About: the Tennis and Fitness graphic stands in for the paragraph on how a class runs: shown once, and the paragraph is gone",
  count(aboutPage, ">Tennis</h3>") === 1 &&
    count(aboutPage, ">Fitness</h3>") === 1 &&
    count(aboutSrc, "<BootcampClass") === 1 &&
    CLASS_RUNS.every((run) => count(aboutPage, `${run.text}</li>`) === 1) &&
    CLASS_PARTS.every((part) => part.trains.every((tile) => count(aboutPage, `${tile.label}</li>`) === 1)) &&
    !aboutPage.includes(CLASS_LINE) &&
    !aboutText.includes("Tennis trains") &&
    !aboutText.includes("Fitness trains") &&
    !aboutSrc.includes("CLASS_LINE") &&
    !aboutSrc.includes("trainsInWords")
);
check(
  "About: the graphic sits inside How a cohort works, under its paragraph and its list, and before What makes this different",
  at(aboutPage, ">How a cohort works</h2>") > 0 &&
    at(aboutPage, ">How a cohort works</h2>") < at(aboutPage, "Drop-in attendance") &&
    at(aboutPage, "Drop-in attendance") < at(aboutPage, "players a group</p>") &&
    at(aboutPage, "players a group</p>") < at(aboutPage, ">Tennis</h3>") &&
    at(aboutPage, ">Fitness</h3>") < at(aboutPage, ">What makes this different</h2>")
);
check("About: the graphic brings no second page title: one h1, and the graphic's names are h3s under the section's h2", count(aboutPage, "<h1") === 1 && !aboutPage.includes(`>${CLASS_HEADING}</h2>`) && !aboutText.includes(CLASS_HEADING));
// Re-pinned for backlog #70, fix round: the list item "Tennis and fitness in
// the same class" / "Both parts, every class." (which had replaced "One
// …-minute class a week") left the list. The opening paragraph says it and
// the graphic right under the list draws it, so a list item said it a third
// time. The list keeps two items: the one group, and the group size.
const cohortListLabels = [...aboutPage.matchAll(/<p class="font-semibold text-white">([^<]*)<\/p>/g)].map((m) => m[1]);
check(
  "About: the cohort list is two items, the same group for the whole cohort and the group size",
  cohortListLabels.length === 2 &&
    cohortListLabels[0] === `The same group for all ${COHORT_LENGTH}` &&
    cohortListLabels[1] === `Up to ${numberInWords(GROUP_MAX_PLAYERS)} players a group`,
  cohortListLabels.join(" | ")
);
check(
  "About: tennis and fitness in the one class is said in the opening paragraph and drawn in the graphic, and is not a list item",
  aboutPage.includes(`Every group is a bootcamp: ${CLASS_IDEA}.`) &&
    count(aboutPage, ">Tennis</h3>") === 1 &&
    count(aboutPage, ">Fitness</h3>") === 1 &&
    cohortListLabels.every((label) => !/tennis|fitness/i.test(label)) &&
    !aboutPage.includes("in the same class") &&
    !aboutPage.includes("Both parts, every class.") &&
    !aboutSrc.includes("CLASS_PARTS")
);
check("About: no general class length and no classes a week anywhere on the page", !/\d+-minute class|\bminutes\b|\ba week\b|every week|once a week/i.test(aboutText) && !aboutSrc.includes("SESSION_MINUTES"), aboutText.match(/\d+-minute class|\bminutes\b|\ba week\b|every week|once a week/i)?.[0]);
check(
  "About: the group size is stated once on the page, in the list, in words from GROUP_MAX_PLAYERS, with its one line of why; the graphic carries no size",
  aboutPage.includes(`>Up to ${numberInWords(GROUP_MAX_PLAYERS)} players a group</p>`) &&
    aboutPage.includes(">More reps for each player, and feedback from your coach every session.</p>") &&
    aboutSrc.includes("label: `Up to ${numberInWords(GROUP_MAX_PLAYERS)} players a group`") &&
    count(aboutSrc, "Up to ") === 1 &&
    count(aboutText, "players a group") === 1 &&
    count(aboutText.toLowerCase(), "up to ") === 1 &&
    !/\d+ players|per court|capped/i.test(aboutSrc) &&
    !/\d+ players/i.test(aboutText)
);
check("About: no price on the page", !aboutPage.includes("$") && !/a session|per session/i.test(aboutText));
// Re-pinned for backlog #70: the label is "Join a bootcamp" (it was "Join a
// group"), and the one-lime-button count now counts lime links, since the
// graphic's Tennis block and its tiles are lime too.
check(
  "About: closes on the main action, the lime Join a bootcamp and the quiz side line; no lime quiz button, no Browse Programs",
  aboutSrc.includes('<JoinClosing source="about-closing" />') &&
    /<a [^>]*data-main-cta="true"[^>]*href="\/programs"[^>]*>Join a bootcamp<\/a>/.test(aboutPage) &&
    !aboutPage.includes("Join a group") &&
    aboutPage.includes("Not sure which group? <a ") &&
    /<a [^>]*href="\/intake"[^>]*>Take the 2-minute quiz<\/a>/.test(aboutPage) &&
    (aboutPage.match(/<a [^>]*bg-\[#B4E655\]/g) ?? []).length === 1 &&
    (aboutPage.match(/<button[^>]*bg-\[#B4E655\]/g) ?? []).length === 0 &&
    count(aboutPage, "data-main-cta") === 1 &&
    !aboutSrc.includes('variant="primary"') &&
    !aboutSrc.includes("TrackedButton") &&
    !aboutPage.includes("Browse Programs") &&
    !aboutPage.includes("Not sure where you fit?")
);
check("About: on the one Container and the one heading scale", !aboutSrc.includes("max-w-6xl") && count(aboutSrc, "<Heading") === 4 && !/<h[12][ >]/.test(aboutSrc) && count(aboutPage, "<h1") === 1);
check(
  "About: the founder paragraphs and the tier ladder are as they were",
  aboutSrc.includes("built Tennis Bootcamp on a single conviction") && aboutSrc.includes("His coaching is built around four pillars: technique, strategy,") && aboutSrc.includes('variant="ladder"')
);
// Fix round, 2026-11-17: beside "Pick your group and join", the card no longer says our coaches place every player.
check(
  "About: the Serious at every level card says each group trains at one level, confirmed on court in week one, and no longer that every player is placed",
  aboutPage.includes("Every group trains at one level, and your coach confirms yours on court in week one. The High Performance Youth Bootcamp is the competitive track;") &&
    !aboutPage.includes("place every player") &&
    !aboutPage.includes("structure and intent")
);
check(
  "About: the title is balanced and each sentence is its own inline box, whole where it fits and wrapping where it does not, in the same words",
  aboutSrc.includes('<Heading as="h1" className="max-w-3xl text-balance">') &&
    aboutSrc.includes('const TITLE_SENTENCE = "inline-block";') &&
    !aboutSrc.includes("whitespace-nowrap") &&
    /<h1 class="[^"]*text-balance"><span class="inline-block">Serious training\.<\/span> <span class="inline-block">Measurable progress\.<\/span> <span class="inline-block">No filler\.<\/span><\/h1>/.test(aboutPage.replace(/<!-- -->/g, ""))
);
check("About: the ladder's link reads How levels work, the label the home page and Programs use", aboutSrc.includes("How levels work →") && !aboutSrc.includes("How tiers work") && />How levels work →<\/a>/.test(aboutPage));
check(
  "About: the side line's quiz link never breaks inside itself and is a 44px target",
  /<a [^>]*class="whitespace-nowrap [^"]*py-\[13px\][^"]*"[^>]*href="\/intake"[^>]*>Take the 2-minute quiz<\/a>|<a [^>]*href="\/intake"[^>]*class="whitespace-nowrap [^"]*py-\[13px\][^"]*"[^>]*>Take the 2-minute quiz<\/a>/.test(aboutPage)
);
check("About: nothing said the old way, on the page or in its description", !OLD_WAY.test(aboutPage.replace(/<[^>]+>/g, " ")), aboutPage.replace(/<[^>]+>/g, " ").match(OLD_WAY)?.[0]);
// Backlog #74 (owner, 2026-11-19): About keeps both lines that left the home
// band (how a class rotates, and point play to finish), and its Fitness
// block reads the four new aims and no old one.
check(
  "About: keeps the rotation and point play under the graphic, and reads Power, Stamina, Stability, Cardio with no speed or mobility",
  aboutPage.includes("Rotate between the two all class</li>") &&
    aboutPage.includes("Finish with point play</li>") &&
    ["Power", "Stamina", "Stability", "Cardio"].every((label) => count(aboutPage, `${label}</li>`) === 1) &&
    !/\b(speed|mobility)\b/i.test(aboutText),
  aboutText.match(/.{0,30}\b(speed|mobility)\b.{0,10}/i)?.[0]
);

console.log("The words that never appear");
{
  // This file is skipped by its own scan, so it may spell what it looks for.
  const SELF = join(ROOT, "src", "scripts", "test-joining-flow.ts");
  const NEVER = [["Cross", "Fit"].join(""), ["hal", "ves"].join("")];
  const SRC = join(ROOT, "src");
  const TEXT_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|css|md|json|html|txt)$/i;
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (TEXT_EXT.test(name)) files.push(full);
    }
  };
  walk(SRC);
  check("scanned some files", files.length > 50, `only ${files.length}`);
  // A number of minutes beside a part of the class: "30 minutes of tennis",
  // "Fitness: 20 min". The site's name ("… | Tennis Bootcamp") is not a part.
  const MINUTES_THEN_PART = /\b\d+\s*-?\s*(?:min|mins|minutes?)\s+(?:of\s+)?(?:tennis|fitness)\b(?!\s+bootcamp)/i;
  const PART_THEN_MINUTES = /\b(?:tennis|fitness)\b\s*(?:[:,(–—-]|for|is|=)?\s*\d+\s*-?\s*(?:min|mins|minutes?)\b/i;
  const hits: string[] = [];
  for (const file of files) {
    if (file === SELF) continue;
    readFileSync(file, "utf8")
      .split(/\r?\n/)
      .forEach((line, i) => {
        const where = `${relative(ROOT, file).split(sep).join("/")}:${i + 1}`;
        for (const word of NEVER) if (line.toLowerCase().includes(word.toLowerCase())) hits.push(`${where} "${word}"`);
        if (MINUTES_THEN_PART.test(line) || PART_THEN_MINUTES.test(line)) hits.push(`${where} minutes beside Tennis or Fitness`);
      });
  }
  check("no file under src names another sport for the fitness, or splits the class in two", hits.filter((h) => !h.includes("minutes beside")).length === 0, hits.join(" | "));
  check("no file under src pairs a number of minutes with Tennis or Fitness", hits.filter((h) => h.includes("minutes beside")).length === 0, hits.join(" | "));
  check("the scan catches a minute split when there is one", MINUTES_THEN_PART.test("30 minutes of tennis") && MINUTES_THEN_PART.test("a 20-minute fitness block") && PART_THEN_MINUTES.test("Fitness: 20 min") && !MINUTES_THEN_PART.test("The 2-minute quiz | Tennis Bootcamp") && !MINUTES_THEN_PART.test("one 60-minute class a week"));
  check("the class section never labels a part a circuit", !/circuit/i.test(bootcampSrc) && !/circuit/i.test(classSection));
}

// ── Provisional until week one: the quiz result and the dashboard ───────────
console.log("Provisional until week one (quiz result, dashboard)");
const intake = read("src/app/intake/page.tsx");
check("quiz: one player's tier is provisional until week one", intake.includes("From your answers, so it stays provisional until our coaches confirm") && intake.includes("level on court in week one."));
check("quiz: a household's tiers are too", intake.includes("From your answers, so each stays provisional until our coaches confirm the player's level on court in week one."));
check("quiz: the old wording is gone", !intake.includes("Our coaches confirm {firstName"));
check("quiz: the assessment is for certainty, before enrolling", intake.includes("Optional: want certainty first?") && intake.includes("before you enroll, you can book a 20-minute assessment") && !intake.includes("before you're placed"));
check("quiz: the High Performance group is marked by approval on the match card", intake.includes('{g.joining === "approval" && <span className="text-white/70"> · By approval</span>}'));
const dash = read("src/app/dashboard/DashboardView.tsx");
check("dashboard: a placement reads provisional in the player list, until week one", dash.includes("`${formatTierSpan(placed.min, placed.max)} group, provisional until our coaches confirm it on court in week one.`"));
check("dashboard: a player with no level names the week-one check", dash.includes('"No level yet. Our coaches confirm it on court in week one."'));
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
check("rule 6: groups are open to join, the quiz is the side path, and the week-one check is named", /6\. \*\*No stale promises\.\*\*[^\n]*groups are open to join[^\n]*side path[^\n]*week one/.test(voice));
// Re-pinned for backlog #70: the main button's label is "Join a bootcamp".
check("rule 7 names the main button and the quiz link, then Open to join, By approval and provisional", /7\. \*\*Consistent product vocabulary\.\*\*[^\n]*"Join a bootcamp" \(the main button[^\n]*"Take the 2-minute quiz" \(the quiz link[^\n]*"Open to join"[^\n]*"By approval"[^\n]*"provisional"/.test(voice));
const oldLabelLines = voice.split("\n").filter((line) => line.includes("Join a group") && !line.startsWith("|"));
check("…and outside the before → after table, the old label is named only as the one it replaced", oldLabelLines.every((line) => /until 2026-11-17|retired/.test(line)), oldLabelLines[0]?.slice(0, 160));
check("has the bootcamp words section: Tennis, Fitness, Built for tennis, rotate, point play", voice.includes("## Bootcamp words (owner, 2026-11-16)") && ["**Tennis**", "**Fitness**", "\"Built for tennis\"", "rotate", "point play"].every((word) => voice.slice(voice.indexOf("## Bootcamp words")).includes(word)));
// Backlog #70 added a fifth never-rule: no general class length, no classes a week.
check("…and its five never-rules", (voice.slice(voice.indexOf("## Bootcamp words"), voice.indexOf("## Joining flow")).match(/^- \*\*Never\b/gm) ?? []).length === 5);
// Backlog #70 (owner, 2026-11-17): the three points, the price rule and the class-length rule are in the brief.
const bootcampWords = voice.slice(voice.indexOf("## Bootcamp words"), voice.indexOf("## Joining flow"));
const briefPoints = BOOTCAMP_POINTS.map((point) => bootcampWords.indexOf(`**${point.lead}** ${point.rest}`));
check("the brief names the three points, word for word and in order, and where they sit", briefPoints.every((index, i) => index > 0 && (i === 0 || index > briefPoints[i - 1])) && /straight under the hero/.test(bootcampWords), briefPoints.join(","));
check("the brief's class-length rule: no general class length, no classes a week; a group's own day and time stays", /- \*\*Never\*\* state a general class length or how many classes there are a week/.test(bootcampWords) && /own day and time/.test(bootcampWords));
check("the brief's price rule: the whole price only, the per-session figure only on the sign-up step of one bootcamp, none on the home page", voice.includes("## Price (owner, 2026-11-17)") && /whole price only/i.test(voice) && /per-session figure[^\n]*only on the sign-up step of one bootcamp/.test(voice) && /No price of any kind on the home page/.test(voice));
check("the joining-flow section names the three steps and Good to know", voice.includes('"Pick a group"') && voice.includes('"Pay online"') && voice.includes('"Start on court"') && voice.includes("Good to know"));
// Backlog #71 (owner, 2026-11-18): the card buttons, where they lead, and a before → after row for each changed string.
const joiningFlowBrief = voice.slice(voice.indexOf("## Joining flow"), voice.indexOf("## Locations"));
// Re-pinned for backlog #85 (owner, 2026-11-19 and 2026-11-20): it pinned
// "Ask to join" on every group until that group could take payment, the quiz
// signed out and the dashboard for a signed-in taker (backlog #71).
check(
  "the brief's card buttons: Enroll on an open block, to its sign-up page; Ask to join by approval, to the same page; Dates coming soon and Notify me with no open block",
  joiningFlowBrief.includes("**The card buttons and where they lead** (owner, 2026-11-19 and 2026-11-20;") &&
    joiningFlowBrief.includes('An open block\'s lime button reads "Enroll" and opens its sign-up page (`/enroll/{cohortId}`), signed in or not') &&
    joiningFlowBrief.includes('reads "Ask to join" on the outline, to the same page, whose approval step takes over') &&
    joiningFlowBrief.includes('A group with no open block reads "Dates coming soon" where the dates go and an outline "Notify me" (the owner\'s decision, 2026-11-20)') &&
    joiningFlowBrief.includes("**Signed in, never a dead end** (owner, 2026-11-19)") &&
    !joiningFlowBrief.includes('every group\'s button reads "Ask to join" until that group can take payment') &&
    !joiningFlowBrief.includes("`/intake?program={slug}`")
);
check("the brief's before → after rows for backlog #85: the button, the dates and days, a group with no open block, the signed-in screen", ["| 38 | Ask to join (an open group's lime button", "| 39 | Saturdays 12:00–1:00 pm, then", "| 40 | Open to join and Ask to join", "| 41 | You've already taken the quiz."].every((row) => voice.includes(row)));
check("the brief's before → after rows for the three changed strings: the third point, the card button, the signed-out greeting", [`| 31 | One group for all ${COHORT_LENGTH}`, "| 32 | Join (a group card's lime button", "| 33 | Your quiz answers are in."].every((row) => voice.includes(row)));
// Backlog #74 (owner, 2026-11-19): the band's first two points, the Fitness
// aims and a before → after row for each changed string.
check(
  "the brief's definition of the fitness: power, stamina, stability and cardio, on top of the tennis training",
  bootcampWords.includes("The owner's definition (2026-11-19): the fitness is hard fitness work built for tennis, for power, stamina, stability and cardio, on top of the tennis training.") &&
    bootcampWords.includes("Fitness trains power, stamina, stability and cardio (owner, 2026-11-19") &&
    bootcampWords.includes('"Fitness built for tennis: power, stamina, stability and cardio"') &&
    !bootcampWords.includes("Fitness trains power, speed") &&
    !bootcampWords.includes('"Fitness built for tennis: power, speed')
);
check(
  "the brief says what left the home band and where it stays: the idea on the cards and in sentences, point play on About and the program pages",
  bootcampWords.includes('They replaced "Tennis and fitness in every class" and "Point play to finish every class", which left the home page only') &&
    /two lists side by side read as buzzwords/.test(bootcampWords)
);
check(
  "the brief's before → after rows for the four changed strings: the two points, the Fitness tiles, the list line",
  [
    "| 34 | Tennis and fitness in every class (home, the first point under the hero; two arrows as its icon) | Tennis technique, tactics and focus (a racket as its icon) |",
    "| 35 | Point play to finish every class (home, the second point under the hero; a court with a ball as its icon) | Fitness for power and stamina (a bolt as its icon) |",
    "| 36 | Power, Speed, Stamina, Mobility (About, the Fitness tiles) | Power, Stamina, Stability, Cardio",
    "| 37 | Fitness built for tennis: power, speed, stamina and mobility (the bootcamp programs' lists) | Fitness built for tennis: power, stamina, stability and cardio |",
  ].every((row) => voice.includes(row))
);

const pkg = JSON.parse(read("package.json")) as { scripts: { test: string } };
// Later items append their scripts after this one (audit N), so it is pinned as run, not as last.
check("npm test runs this file", pkg.scripts.test.includes("npx tsx src/scripts/test-joining-flow.ts"));

if (failed > 0) {
  console.log(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll joining-flow checks passed.");
