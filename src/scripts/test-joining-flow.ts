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
// Exits non-zero on any failure. Never spells the cohort length or total.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  APPROVAL_ASK_LINE,
  APPROVAL_LINE,
  ASSESSMENT_CERTAINTY_LINE,
  COHORT_LENGTH,
  COHORT_TOTAL_LABEL,
  GROUP_MAX_PLAYERS,
  PLACEMENT_LINE,
  RIGHT_GROUP_PROMISE,
  RIGHT_GROUP_PROMISE_SHORT,
  CLASS_LINE,
  SESSION_MINUTES,
  SESSION_PRICE_LABEL,
  listedPrograms,
  numberInWords,
  programGroups,
  programs,
} from "../content/programs";
import { CLASS_HEADING, CLASS_IDEA, CLASS_PARTS, CLASS_RUNS, trainsInWords } from "../content/bootcamp";
import AboutPage from "../app/about/page";
import { COOLING_OFF_DAYS } from "../content/policies";
import { groupStatus } from "../lib/programCatalog";
import { nextStepFor } from "../lib/dashboardState";
import { BootcampClass } from "../components/sections/BootcampClass";
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
const cardFor = (g: (typeof programGroups)[number]) =>
  render(createElement(ProgramGroupCard, { group: g, program: listedPrograms.find((p) => p.slug === g.programSlug)! }));
const hpCard = cardFor(group("high-performance"));
const openCard = cardFor(group("adult-newer"));
check("no scheduled card carries the promise or a Week 1 row", scheduled.every((g) => !cardFor(g).includes(RIGHT_GROUP_PROMISE_SHORT) && !cardFor(g).includes(RIGHT_GROUP_PROMISE) && !cardFor(g).includes("Week 1")));
check("no card carries a Join row or the approval line", scheduled.every((g) => !cardFor(g).includes(APPROVAL_LINE) && !cardFor(g).includes(APPROVAL_ASK_LINE) && !cardFor(g).includes("<dt")));
check("High Performance: the By approval chip and an outline Ask to join, named for the group", hpCard.includes("By approval") && />Ask to join<span class="sr-only"> the High Performance Youth Bootcamp<\/span><\/a>/.test(hpCard) && !/<a [^>]*bg-\[#B4E655\]/.test(hpCard));
check("an open group: the Open to join chip and a lime Join, named for the group", openCard.includes("Open to join") && /<a [^>]*bg-\[#B4E655\][^>]*>Join<span class="sr-only"> the Beginner Adult Bootcamp<\/span><\/a>/.test(openCard));
check("still one link per card: Join and Ask to join open the quiz for the program, which is how a spot is asked for today", count(hpCard, "<a ") === 1 && count(openCard, "<a ") === 1 && hpCard.includes('href="/intake?program=youth-programs"') && openCard.includes('href="/intake?program=bootcamps"'));
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
// Card payment is not live, so the step says e-transfer only; the design's "Card or e-transfer." returns with join-and-pay.
check("step 2: the price, read from the constants, then how it is paid today: by e-transfer, and no card", JOINING_STEPS[1].body === `${SESSION_PRICE_LABEL} a session, ${COHORT_TOTAL_LABEL} for the ${COHORT_LENGTH}. By e-transfer.` && steps.includes(`>${JOINING_STEPS[1].body}</p>`) && !/card/i.test(steps.replace(/<[^>]+>/g, " ")));
check("step 3: the coach confirms the level in week one, then the promise, the one constant", JOINING_STEPS[2].body === `Your coach confirms your level in week one. ${RIGHT_GROUP_PROMISE}` && steps.includes(`Your coach confirms your level in week one. ${RIGHT_GROUP_PROMISE}`));
check("no link and no button in the steps: the main action sits in the hero and the closing", count(steps, "<a ") === 0 && count(steps, "<button") === 0);
const joining = read("src/components/sections/HowJoiningWorks.tsx");
check("the steps type no price and no promise: both are read from src/content/programs.ts", joining.includes("${SESSION_PRICE_LABEL} a session, ${COHORT_TOTAL_LABEL} for the ${COHORT_LENGTH}.") && joining.includes("${RIGHT_GROUP_PROMISE}") && !/\$\d/.test(joining));
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
check("/programs: the lead says what every group is, and reads the lengths from the constants", programsPage.includes("Every group is a bootcamp: tennis and fitness in every class. {COHORT_LENGTH_SENTENCE}, one{\" \"}") && programsPage.includes("{SESSION_MINUTES}-minute class a week. Pick your group and join."));
const detail = read("src/app/programs/[slug]/page.tsx");
check("detail: Good to know after the groups, only for a program with fixed classes", /scheduledGroups\.length > 0 && \(\s*<>\s*<section aria-labelledby=\{GROUPS_ANCHOR\}/.test(detail) && at(detail, "aria-labelledby={GROUPS_ANCHOR}") < at(detail, "<GoodToKnow") && !detail.includes("<HowJoiningWorks"));
check("detail: it lists High Performance only where it trains, and the side line links the program's quiz", detail.includes('approvalGroup={scheduledGroups.find((g) => g.joining === "approval")?.name}') && detail.includes('<QuizSideLine source="program-detail" quizHref={quizHref}'));
check("detail: the assessment button says optional", detail.includes("Optional, if you want your level confirmed before you enroll."));

// ── The bootcamp words (owner, 2026-11-16 and 2026-11-17) ───────────────────
console.log("The bootcamp words: tennis and fitness in every class");
check("the heading", CLASS_HEADING === "Tennis and fitness in every class.");
check("the two parts are named Tennis and Fitness, in that order", CLASS_PARTS.map((part) => part.name).join("|") === "Tennis|Fitness");
check("Tennis trains Technique, Footwork, Tactics, Focus", CLASS_PARTS[0].trains.map((t) => t.label).join("|") === "Technique|Footwork|Tactics|Focus" && CLASS_PARTS[0].tone === "lime" && CLASS_PARTS[0].tag === undefined);
check("Fitness, Built for tennis, trains Power, Speed, Stamina, Mobility", CLASS_PARTS[1].trains.map((t) => t.label).join("|") === "Power|Speed|Stamina|Mobility" && CLASS_PARTS[1].tone === "court" && CLASS_PARTS[1].tag === "Built for tennis");
check("ten words in all: the two names and the eight things they train", new Set([...CLASS_PARTS.map((part) => part.name), ...CLASS_PARTS.flatMap((part) => part.trains.map((t) => t.label))]).size === 10);
check("how a class runs: it rotates between the two all class, and finishes with point play", CLASS_RUNS[0].text === "Rotate between the two all class" && CLASS_RUNS[1].text === "Finish with point play");
check("the third line is the group size, read from GROUP_MAX_PLAYERS", CLASS_RUNS.length === 3 && CLASS_RUNS[2].text === `Up to ${GROUP_MAX_PLAYERS} players a group` && GROUP_MAX_PLAYERS === 8);
const bootcampSrc = read("src/content/bootcamp.ts");
check("the words type no number: the group size comes from src/content/programs.ts", bootcampSrc.includes("`Up to ${GROUP_MAX_PLAYERS} players a group`") && !/Up to \d/.test(bootcampSrc));
const classSection = render(createElement(BootcampClass));
check("the section: an h2, then Tennis and Fitness as h3s", classSection.includes(`>${CLASS_HEADING}</h2>`) && at(classSection, ">Tennis</h3>") > 0 && at(classSection, ">Tennis</h3>") < at(classSection, ">Fitness</h3>"));
check("real lists: four things under each part, three lines under both", count(classSection, '<ul role="list"') === 3 && count(classSection, "<li") === 11);
check("every word is text", [...CLASS_PARTS.flatMap((part) => part.trains.map((t) => t.label)), "Built for tennis", ...CLASS_RUNS.map((run) => run.text)].every((word) => classSection.includes(`${word}</`)));
check("the rotate glyph between the blocks, and every icon, is decoration", count(classSection, "<svg") === 12 && count(classSection, '<svg aria-hidden="true" focusable="false"') === 12 && classSection.includes('<div aria-hidden="true" class="grid h-[52px] place-items-center'));
check("the icons are drawn here: inline SVG in the text colour, no icon font and no package", (() => { const icons = read("src/components/ui/icons.tsx"); return icons.includes('stroke="currentColor"') && icons.includes('aria-hidden="true"') && icons.includes('focusable="false"') && !/^import .* from "(?!react")/m.test(icons); })());

// ── The bootcamp words on the other pages (backlog #69, pass 2) ─────────────
// The program entries cannot import src/content/bootcamp.ts (it reads the
// group size from src/content/programs.ts), so their lines are typed there
// and pinned here to the class words, word for word.
console.log("The bootcamp words on the program entries and About");
const [tennis, fitness] = CLASS_PARTS;
check("the idea inside a sentence is the heading's own words", CLASS_IDEA === "tennis and fitness in every class" && `${CLASS_IDEA.charAt(0).toUpperCase()}${CLASS_IDEA.slice(1)}.` === CLASS_HEADING);
check("what each part trains, in words", trainsInWords(tennis) === "technique, footwork, tactics and focus" && trainsInWords(fitness) === "power, speed, stamina and mobility");
check(
  "how a class runs, in one sentence: players rotate between tennis drills and fitness drills built for tennis, and finish with point play",
  CLASS_LINE === "In every class, players rotate between tennis drills and fitness drills built for tennis, then finish with point play."
);
const TENNIS_LINE = `${tennis.name}: ${trainsInWords(tennis)}`;
const FITNESS_LINE = `${fitness.name} ${(fitness.tag ?? "").toLowerCase()}: ${trainsInWords(fitness)}`;
const OLD_WAY = /\bhalf\b|percent|%|circuit|strength-and-conditioning|fitness session|group class|weekend class|group lesson|per court|capped/i;
for (const p of [youth, adults]) {
  check(`${p.id}: the kind of class is Group bootcamp`, p.type === "Group bootcamp");
  check(`${p.id}: the card line opens on the idea`, p.description.startsWith(`${CLASS_HEADING.slice(0, -1)}: `), p.description);
  check(
    `${p.id}: the long description opens on how a class runs, then the cohort, and still ends on the week-one line`,
    p.longDescription.startsWith(`${CLASS_LINE} Each cohort is a fixed group that trains together for ${COHORT_LENGTH}, one ${SESSION_MINUTES}-minute class every `) && p.longDescription.endsWith(PLACEMENT_LINE),
    p.longDescription
  );
  check(`${p.id}: the search line says group bootcamps, tennis and fitness in every class`, (p.metaDescription ?? "").includes(CLASS_IDEA) && /group bootcamps/.test(p.metaDescription ?? ""), p.metaDescription);
  const list = p.includes ?? [];
  check(
    `${p.id}: what's included is the class, the group size, the two parts and how it ends, then one line of its own`,
    list.length === 6 &&
      list[0] === `One ${SESSION_MINUTES}-minute class a week for ${COHORT_LENGTH}` &&
      list[1] === CLASS_RUNS[2].text &&
      list[2] === TENNIS_LINE &&
      list[3] === FITNESS_LINE &&
      list[4] === "Point play to finish every class",
    list.join(" | ")
  );
  const words = [p.description, p.longDescription, p.metaDescription ?? "", p.levelNote ?? "", ...list].join(" ");
  check(`${p.id}: no share of the class, no circuit, no separate fitness session, nothing said the old way`, !OLD_WAY.test(words), words.match(OLD_WAY)?.[0]);
}
check(
  "Youth Bootcamps keeps its groups, ages and times, and its week-one line in the list",
  ["the Beginner Junior Bootcamp (ages 7–10) at 12:00", "the Novice Youth Bootcamp (ages 11–15) at 1:00", "the High Performance Youth Bootcamp at 2:00 for players 12–17 who compete, or are training to"].every((fact) => youth.longDescription.includes(fact)) &&
    youth.description.endsWith("three Saturday groups for ages 7–17.") &&
    (youth.levelNote ?? "").startsWith("Three groups by age and level") &&
    youth.includes?.[5] === "One level per group, confirmed on court in week one"
);
check(
  "Adult Bootcamps keeps its levels, ages and times, and the coach's corrections in the list",
  adults.longDescription.includes("Three levels run back to back: Beginner at 4:00, Intermediate at 5:00, Advanced at 6:00. Players 16 and up are welcome.") &&
    adults.description.endsWith("three Sunday levels for adults and players 16 and up.") &&
    (adults.levelNote ?? "").endsWith("back to back") &&
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
check(
  "About: how a cohort works says how a class runs, in the programs' sentence, then what Tennis and Fitness train, from the class words",
  aboutPage.replace(/<!-- -->/g, "").includes(`<p>${CLASS_LINE} Tennis trains ${trainsInWords(tennis)}. Fitness trains ${trainsInWords(fitness)}.</p>`) &&
    aboutSrc.includes('{CLASS_LINE} {tennis.name} trains {trainsInWords(tennis)}. {fitness.name} trains{" "}')
);
check(
  "About: the class item says both parts are in the one class",
  aboutPage.includes(`>One ${SESSION_MINUTES}-minute class a week</p>`) &&
    aboutPage.includes(">Tennis and fitness in the same class, every week.</p>") &&
    aboutSrc.includes("detail: `${tennis.name} and ${fitness.name.toLowerCase()} in the same class, every week.`")
);
check(
  "About: the group size reads GROUP_MAX_PLAYERS in words, with its one line of why",
  aboutPage.includes(`>Up to ${numberInWords(GROUP_MAX_PLAYERS)} players a group</p>`) &&
    aboutPage.includes(">More reps for each player, and feedback from your coach every session.</p>") &&
    aboutSrc.includes("label: `Up to ${numberInWords(GROUP_MAX_PLAYERS)} players a group`") &&
    count(aboutSrc, "Up to ") === 1 &&
    !/\d+ players|per court|capped/i.test(aboutSrc)
);
check(
  "About: closes on the main action, the lime Join a group and the quiz side line; no lime quiz button, no Browse Programs",
  aboutSrc.includes('<JoinClosing source="about-closing" />') &&
    /<a [^>]*data-main-cta="true"[^>]*href="\/programs"[^>]*>Join a group<\/a>/.test(aboutPage) &&
    aboutPage.includes("Not sure which group? <a ") &&
    /<a [^>]*href="\/intake"[^>]*>Take the 2-minute quiz<\/a>/.test(aboutPage) &&
    count(aboutPage, "bg-[#B4E655] text-[#061427]") === 1 &&
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
  "About: the title is balanced and keeps each sentence whole from 360 wide, in the same words",
  aboutSrc.includes('<Heading as="h1" className="max-w-3xl text-balance">') &&
    aboutSrc.includes('const TITLE_SENTENCE = "min-[360px]:whitespace-nowrap";') &&
    /<h1 class="[^"]*text-balance"><span class="min-\[360px\]:whitespace-nowrap">Serious training\.<\/span> <span class="min-\[360px\]:whitespace-nowrap">Measurable progress\.<\/span> <span class="min-\[360px\]:whitespace-nowrap">No filler\.<\/span><\/h1>/.test(aboutPage.replace(/<!-- -->/g, ""))
);
check("About: the ladder's link reads How levels work, the label the home page and Programs use", aboutSrc.includes("How levels work →") && !aboutSrc.includes("How tiers work") && />How levels work →<\/a>/.test(aboutPage));
check(
  "About: the side line's quiz link never breaks inside itself and is a 44px target",
  /<a [^>]*class="whitespace-nowrap [^"]*py-\[13px\][^"]*"[^>]*href="\/intake"[^>]*>Take the 2-minute quiz<\/a>|<a [^>]*href="\/intake"[^>]*class="whitespace-nowrap [^"]*py-\[13px\][^"]*"[^>]*>Take the 2-minute quiz<\/a>/.test(aboutPage)
);
check("About: nothing said the old way, on the page or in its description", !OLD_WAY.test(aboutPage.replace(/<[^>]+>/g, " ")), aboutPage.replace(/<[^>]+>/g, " ").match(OLD_WAY)?.[0]);

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
check("rule 6: groups are open to join, the quiz is the side path, and the week-one check is named", /6\. \*\*No stale promises\.\*\*[^\n]*groups are open to join[^\n]*side path[^\n]*week one/.test(voice));
check("rule 7 names the main button and the quiz link, then Open to join, By approval and provisional", /7\. \*\*Consistent product vocabulary\.\*\*[^\n]*"Join a group" \(the main button[^\n]*"Take the 2-minute quiz" \(the quiz link[^\n]*"Open to join"[^\n]*"By approval"[^\n]*"provisional"/.test(voice));
check("has the bootcamp words section: Tennis, Fitness, Built for tennis, rotate, point play", voice.includes("## Bootcamp words (owner, 2026-11-16)") && ["**Tennis**", "**Fitness**", "\"Built for tennis\"", "rotate", "point play"].every((word) => voice.slice(voice.indexOf("## Bootcamp words")).includes(word)));
check("…and its four never-rules", (voice.slice(voice.indexOf("## Bootcamp words"), voice.indexOf("## Joining flow")).match(/^- \*\*Never\b/gm) ?? []).length === 4);
check("the joining-flow section names the three steps and Good to know", voice.includes('"Pick a group"') && voice.includes('"Pay online"') && voice.includes('"Start on court"') && voice.includes("Good to know"));

const pkg = JSON.parse(read("package.json")) as { scripts: { test: string } };
// Later items append their scripts after this one (audit N), so it is pinned as run, not as last.
check("npm test runs this file", pkg.scripts.test.includes("npx tsx src/scripts/test-joining-flow.ts"));

if (failed > 0) {
  console.log(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll joining-flow checks passed.");
