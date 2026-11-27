// Run from project root: npx tsx src/scripts/test-dashboard-messages.ts
//
// Pins backlog #98: the signed-in dashboard stops saying five wrong or hidden
// things. Same sections, same cards.
//   1. Groups that fit: a player with an age band is offered a group only
//      when the whole band sits inside the group's ages (a teen, 14–17, is
//      never offered a 16-and-up group; a junior, 7–13, is still offered a
//      7–17 one); a date of birth on the record decides instead, by the age
//      on the block's first class; with neither, the old rule. The
//      dashboard's "Groups with dates" and the quiz's already-taken screen
//      read the one rule (accountOpenCards).
//   2. The $20 said once: a waiting e-transfer whose amount took a player's
//      $20 says so in its step, once, and the credit line leaves that $20
//      out (matched on creditBookingId); a $20 no transfer used keeps it.
//   3. A true first step: with no quiz answers, no times, no level and
//      nothing booked or held, the next step is the quiz, its exact label on
//      the one lime button, never "There is nothing else you need to do." or
//      "Our coaches are placing"; My programs says nothing is enrolled yet;
//      the quiz line under the availability does not repeat the step.
//   4. A block the account holds an open spot in leaves "Groups with dates".
//   5. Nothing booked hidden: every other upcoming dated item (an assessment
//      booking, another held spot's deadline, the next class) is one short
//      line under the next step's detail, three at most, soonest first, in
//      the detail's own size and colour; nothing new when there is nothing.
// Every check catches its own error, so each reports on its own. Exits
// non-zero on any failure. Never spells the cohort length or total.

// First: the dashboard's view imports player helpers from a server-only module.
import "./stub-server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { COHORT_TOTAL, COHORT_TOTAL_CENTS, COHORT_WEEKS, formatDollars, programs } from "../content/programs";
import { accountOpenCards, groupCards, groupTakesPlayerAge, openBlockCards, type AgePlayer, type GroupCard } from "../lib/groupBlocks";
import {
  creditLine,
  heldCohortIds,
  nextStepFor,
  nothingOnFile,
  type DashBooking,
  type DashCredit,
  type DashEnrollment,
  type DashInvite,
  type DashSession,
  type NextStep,
  type NextStepInput,
} from "../lib/dashboardState";
import { programGroups } from "../content/programs";
import { parseAvailability } from "../lib/availability";
import type { PlayerRecord } from "../lib/players";
import type { Cohort } from "../types/cohort";
import { AlreadyTakenPanel } from "../components/quiz/AlreadyTakenPanel";
import { DashboardView, type DashboardViewProps } from "../app/dashboard/DashboardView";

let failed = 0;
function check(name: string, test: () => boolean, detail?: () => string) {
  let ok = false;
  let why = "";
  try {
    ok = test();
    if (!ok && detail) why = detail();
  } catch (err) {
    why = `threw: ${err instanceof Error ? err.message : String(err)}`;
  }
  if (ok) {
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${why ? ` — ${why}` : ""}`);
  }
}

const ROOT = process.cwd();
/** A source file, its line endings normalised. */
const read = (path: string) => readFileSync(join(ROOT, path), "utf8").replace(/\r\n/g, "\n");
const count = (hay: string, needle: string) => hay.split(needle).length - 1;
/** The words a piece of markup shows, in order. */
const words = (html: string) => html.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
/** The lime links in a piece of markup. */
const limeLinks = (html: string) => (html.match(/<a [^>]*>[\s\S]*?<\/a>/g) ?? []).filter((a) => a.includes("bg-[#B4E655]"));
const NBSP = String.fromCharCode(0xa0);
/** The lines under a next step as a reader reads them: a kept-whole space is a space. */
const lines = (step: NextStep) => JSON.stringify((step.also ?? []).map((l) => l.split(NBSP).join(" ")));

const TODAY = "2026-11-26";
const NOW = "2026-11-26T15:00:00.000Z";
const PRICE = COHORT_TOTAL_CENTS;

// ─── Fixtures (fictional) ────────────────────────────────────────────────────

/** A public block as the coach builds one, priced from the setting. */
const block = (over: Partial<Cohort> & Pick<Cohort, "id">): Cohort => ({
  programId: "bootcamps",
  locationId: "",
  label: over.id,
  startDate: "2027-01-10",
  endDate: "",
  weeks: COHORT_WEEKS,
  sessions: [{ day: "Sun", start: "16:00", end: "17:00" }],
  capacityMin: 3,
  capacityMax: 8,
  priceCents: PRICE,
  currency: "CAD",
  status: "open",
  levelMin: 1,
  levelMax: 1.5,
  visibility: "public",
  dbStatus: "inviting",
  paymentMode: "etransfer",
  ...over,
});
const youthBlock = (over: Partial<Cohort> & Pick<Cohort, "id">) =>
  block({ programId: "youth-programs", startDate: "2027-01-09", sessions: [{ day: "Sat", start: "12:00", end: "13:00" }], ...over });

// The open blocks: the Beginner Adult Bootcamp (16 and up, first class Sun
// Jan 10), the Beginner Junior Bootcamp (7–10) and the Novice Youth Bootcamp
// (11–15), first classes Sat Jan 9, and an Intermediate youth block, which
// matches no planned group and takes its program's ages, 7–17.
const ADULT = block({ id: "adult-beg" });
const JUNIOR = youthBlock({ id: "youth-junior" });
const NOVICE = youthBlock({ id: "youth-novice", levelMin: 2, levelMax: 2.5, sessions: [{ day: "Sat", start: "13:00", end: "14:00" }] });
const WIDE = youthBlock({ id: "youth-wide", levelMin: 3, levelMax: 3.5, sessions: [{ day: "Sat", start: "15:00", end: "16:00" }] });
const CARDS: GroupCard[] = openBlockCards(groupCards(programGroups, [ADULT, JUNIOR, NOVICE, WIDE]));
const listed = (players: AgePlayer[], over: { heldCohortIds?: string[]; enrolledCohortIds?: string[] } = {}) =>
  accountOpenCards(CARDS, { enrolledCohortIds: over.enrolledCohortIds ?? [], heldCohortIds: over.heldCohortIds, players })
    .map((c) => c.block!.cohortId)
    .join(",");
const panel = (players: AgePlayer[]) =>
  renderToStaticMarkup(createElement(AlreadyTakenPanel, { playerCount: 1, cards: CARDS, players, onAdd: () => {}, onRetake: () => {} }));

const teen: AgePlayer = { age_band: "teen", is_minor: true };
const junior: AgePlayer = { age_band: "junior", is_minor: true };
const adult: AgePlayer = { age_band: "adult", is_minor: false };

// The dashboard's people.
const parent = { id: "p_dana", relationship: "self", full_name: "Dana Chen", level: null, availability: null };
const maya = { id: "p_maya", relationship: "child", full_name: "Maya Chen", level: 3, availability: null };
const leo = { id: "p_leo", relationship: "child", full_name: "Leo Chen", level: null, availability: null };

const YOUTH = youthBlock({ id: "coh_youth", label: "Winter Saturday", startDate: "2027-01-16", levelMin: 3, levelMax: 3.5 });
const progs = programs.map((p) => ({ id: p.id, title: p.title }));
const base = (over: Partial<NextStepInput> = {}): NextStepInput => ({
  selfId: parent.id,
  roster: [maya, leo],
  voice: "named",
  enrollments: [],
  cohorts: [YOUTH, ADULT],
  sessionsByCohort: {},
  programs: progs,
  invites: [],
  bookings: [],
  recipientEmail: "info@tennisbootcamp.ca",
  today: TODAY,
  now: NOW,
  ...over,
});
const invite = (over: Partial<DashInvite> = {}): DashInvite => ({
  id: "inv_leo",
  cohort_id: "coh_youth",
  token: "tok_leo",
  status: "invited",
  expires_at: "2026-11-28T23:00:00.000Z",
  payment_method: null,
  participant_id: "p_leo",
  amountDueCents: PRICE,
  creditBookingId: null,
  ...over,
});
/** Leo's e-transfer, sent and waiting, its amount less his $20 (booking b_leo). */
const leoTransfer = invite({ payment_method: "etransfer", payment_note: "Leo Chen", amountDueCents: PRICE - 2000, creditBookingId: "b_leo" });
const credit = (bookingId: string, participantId: string, playerName: string): DashCredit => ({ bookingId, participantId, playerName, creditCents: 2000 });
const leoDec5: DashBooking = { id: "bk_leo", participantId: "p_leo", playerName: "Leo Chen", date: "2026-12-05", start: "10:20", locationLabel: "Newtonbrook Tennis Club" };

// ─── The dashboard, rendered ─────────────────────────────────────────────────

const noop = () => {};
const ROUTER = { back: noop, forward: noop, refresh: noop, push: noop, replace: noop, prefetch: noop, hmrRefresh: noop };
const record = (over: Partial<PlayerRecord> & Pick<PlayerRecord, "id" | "full_name" | "relationship">): PlayerRecord => ({
  account_id: "acct",
  is_minor: false,
  level: null,
  level_assessed_at: null,
  level_notes: null,
  availability: parseAvailability(null),
  availability_updated_at: null,
  availability_source: null,
  availability_note: null,
  age_band: null,
  self_level: null,
  ...over,
});
const sam = record({ id: "p_sam", full_name: "Sam Patel", relationship: "self" });
const dana = record({ id: "p_dana", full_name: "Dana Chen", relationship: "self" });
const leoRecord = record({ id: "p_leo", full_name: "Leo Chen", relationship: "child", is_minor: true, age_band: "teen", self_level: "unsure" });
const mayaRecord = record({ id: "p_maya", full_name: "Maya Chen", relationship: "child", is_minor: true, age_band: "junior", level: 3 });

function dashboard(nextStep: NextStep, over: Partial<DashboardViewProps> = {}): string {
  const props: DashboardViewProps = {
    heading: "Welcome, Sam",
    self: sam,
    players: [sam],
    roster: [sam],
    voice: "you",
    nextStep,
    creditLine: null,
    creditWaiting: false,
    enrollments: [],
    cohorts: [],
    sessionsByCohort: {},
    openForTier: [],
    openGroups: [],
    anyGroupOpen: false,
    suggestions: [],
    programs,
    placedSpans: {},
    today: TODAY,
    quizTaken: false,
    ...over,
  };
  return renderToStaticMarkup(
    createElement(AppRouterContext.Provider, { value: ROUTER as never }, createElement(DashboardView, props))
  );
}
/** The next-step card: from its tinted box to the end of the header section. */
const stepCard = (html: string) => html.slice(html.indexOf("border-[#B4E655]/20 bg-[#061427]/60"), html.indexOf("</section>"));
const myPrograms = (html: string) => html.slice(html.indexOf('id="my-programs"'), html.indexOf('id="open-groups"'));
const availabilityPart = (html: string) => html.slice(html.indexOf('id="availability-heading"'));

// ─── 1. Groups that fit ──────────────────────────────────────────────────────
console.log("1. Groups that fit: the whole band inside the group's ages, a date of birth first");
check("the lineup's ages, as the rule reads them: 7–10, 11–15, 12–17 (by approval), 16 and up, any age", () =>
  programGroups.map((g) => `${g.ageMin ?? ""}-${g.ageMax ?? ""}`).join(" ") === "7-10 11-15 12-17 16- 16- 16- -"
);
check("a teen (14–17) is not offered a 16-and-up group on the dashboard", () => !listed([teen]).split(",").includes("adult-beg"), () => listed([teen]));
check("…nor on the quiz's already-taken screen", () => {
  const html = panel([teen]);
  return !html.includes("/enroll/adult-beg") && !html.includes("Beginner Adult Bootcamp");
});
check("a junior (7–13) is still offered a 7–17 group, and not the 7–10 or 11–15 one it may be too old or too young for", () => listed([junior]) === "youth-wide", () => listed([junior]));
check("…the same on the quiz's screen", () => {
  const html = panel([junior]);
  return html.includes("/enroll/youth-wide") && !html.includes("/enroll/youth-junior") && !html.includes("/enroll/youth-novice");
});
check("a teen is offered the 7–17 group; an adult (18 and up) every 16-and-up group and no youth one", () => listed([teen]) === "youth-wide" && listed([adult]) === "adult-beg");
check("a date of birth decides when present: 16 on the first class takes the 16-and-up group, 14 does not, whatever the band says", () =>
  groupTakesPlayerAge(ADULT_GROUP(), { ...teen, date_of_birth: "2010-12-15" }, "2027-01-10") &&
  !groupTakesPlayerAge(ADULT_GROUP(), { ...teen, date_of_birth: "2012-06-01" }, "2027-01-10") &&
  listed([{ ...teen, date_of_birth: "2010-12-15" }]).includes("adult-beg") &&
  !listed([{ ...teen, date_of_birth: "2012-06-01" }]).includes("adult-beg")
);
check("…counted on the block's first class, not today: 15 today and 16 on Jan 10 is offered the 16-and-up block; 16 only after it is not", () =>
  listed([{ ...teen, date_of_birth: "2011-01-05" }]).split(",").includes("adult-beg") &&
  !listed([{ ...teen, date_of_birth: "2011-02-01" }]).split(",").includes("adult-beg")
);
check("…a 12-year-old by date of birth gets the 11–15 group and the 7–17 one, never the 7–10 one", () => listed([{ ...junior, date_of_birth: "2014-06-01" }]) === "youth-novice,youth-wide", () => listed([{ ...junior, date_of_birth: "2014-06-01" }]));
check("…and the quiz's screen reads the date of birth too: 16 on the first class lists the 16-and-up block, 14 does not", () =>
  panel([{ ...teen, date_of_birth: "2010-12-15" }]).includes("/enroll/adult-beg") &&
  !panel([{ ...teen, date_of_birth: "2012-06-01" }]).includes("/enroll/adult-beg")
);
check("a player with neither keeps the old rule: under 18 overlaps every group up to 17 (and 16 and up), 18 and up the adult ones", () =>
  listed([{ is_minor: true }]) === "youth-junior,youth-novice,youth-wide,adult-beg" && listed([{ is_minor: false }]) === "adult-beg",
  () => `${listed([{ is_minor: true }])} | ${listed([{ is_minor: false }])}`
);
check("a household is offered what fits any of its players", () => listed([teen, adult]) === "youth-wide,adult-beg", () => listed([teen, adult]));

function ADULT_GROUP() {
  return CARDS.find((c) => c.block?.cohortId === "adult-beg")!.group;
}

// ─── 2. The $20 said once ────────────────────────────────────────────────────
console.log("2. The $20 said once: the e-transfer step says it, the credit line leaves it out");
{
  const step = nextStepFor(base({ invites: [leoTransfer] }));
  check("a pending e-transfer that took Leo's $20 says so in its step, once", () =>
    step.kind === "etransfer" &&
    step.detail.startsWith(`${formatDollars(COHORT_TOTAL - 20)} to info@tennisbootcamp.ca, memo “Leo Chen – Winter Saturday”. `) &&
    step.detail.includes("Leo's $20 assessment came off the price.") &&
    count(step.detail, "$20") === 1,
    () => step.detail
  );
  const both = [credit("b_leo", "p_leo", "Leo Chen"), credit("b_maya", "p_maya", "Maya Chen")];
  const transfers = { invites: [leoTransfer], cohorts: [YOUTH], today: TODAY };
  check("the credit line leaves out the $20 that transfer used, and Maya's unused $20 still shows", () =>
    creditLine(both, [maya, leo], parent.id, transfers) === "Maya's $20 assessment comes off the price when Maya enrolls in a program.",
    () => String(creditLine(both, [maya, leo], parent.id, transfers))
  );
  check("with only the used $20, no credit line at all", () => creditLine([credit("b_leo", "p_leo", "Leo Chen")], [maya, leo], parent.id, transfers) === null);
  check("a $20 no transfer used keeps its line, and a confirmed (paid) transfer frees nothing", () =>
    creditLine([credit("b_leo", "p_leo", "Leo Chen")], [maya, leo], parent.id, { invites: [{ ...leoTransfer, status: "paid" }], cohorts: [YOUTH], today: TODAY }) ===
      "Leo's $20 assessment comes off the price when Leo enrolls in a program." &&
    creditLine([credit("b_leo", "p_leo", "Leo Chen")], [maya, leo], parent.id) === "Leo's $20 assessment comes off the price when Leo enrolls in a program."
  );
  const plain = nextStepFor(base({ invites: [invite({ payment_method: "etransfer", payment_note: "Leo Chen" })] }));
  check("a transfer that took no $20 says nothing about one", () => plain.kind === "etransfer" && !plain.detail.includes("$20"));
  const household = nextStepFor(
    base({
      invites: [
        leoTransfer,
        invite({ id: "inv_maya", participant_id: "p_maya", token: "tok_maya", payment_method: "etransfer", payment_note: "Maya Chen", amountDueCents: PRICE - 2000, creditBookingId: "b_maya" }),
      ],
    })
  );
  check("one transfer for two players, each with a $20: both named once", () =>
    household.detail.includes("The $20 assessments (Leo's and Maya's) each came off the price.") && count(household.detail, "$20") === 1,
    () => household.detail
  );
  const shared = nextStepFor(
    base({
      invites: [leoTransfer, invite({ id: "inv_maya", participant_id: "p_maya", token: "tok_maya", payment_method: "etransfer", payment_note: "Maya Chen", amountDueCents: PRICE - 2000, creditBookingId: "b_leo" })],
    })
  );
  check("one $20 two invites found comes off once and is said once", () =>
    shared.detail.startsWith(`${formatDollars(COHORT_TOTAL * 2 - 20)} to`) && count(shared.detail, "$20") === 1 && shared.detail.includes("Leo's $20 assessment came off the price."),
    () => shared.detail
  );
  const html = dashboard(step, {
    heading: "Welcome back, Dana",
    self: dana,
    players: [dana, mayaRecord, leoRecord],
    roster: [mayaRecord, leoRecord],
    voice: "named",
    quizTaken: true,
    creditLine: creditLine([credit("b_leo", "p_leo", "Leo Chen")], [maya, leo], parent.id, transfers),
  });
  check("on the page: the card says Leo's $20 once, and never promises it again for when he enrolls", () => {
    const card = stepCard(html);
    return count(words(card), "$20") === 1 && card.includes("Leo&#x27;s $20 assessment came off the price.") && !/when Leo enrolls/.test(words(html));
  });
}

// ─── 3. A true first step ────────────────────────────────────────────────────
console.log("3. Nothing on file: the next step is the quiz");
{
  const bare = { players: [sam], enrollments: [], invites: [], bookings: [], credits: [] };
  check("nothing on file: no quiz answers, times or level, nothing booked, held, enrolled or credited", () => nothingOnFile(bare));
  check("…and any one of them is something on file", () =>
    !nothingOnFile({ ...bare, players: [{ ...sam, self_level: "rally" }] }) &&
    !nothingOnFile({ ...bare, players: [{ ...sam, age_band: "adult" }] }) &&
    !nothingOnFile({ ...bare, players: [{ ...sam, level: 2.5 }] }) &&
    !nothingOnFile({ ...bare, players: [{ ...sam, availability: { days: { sat: ["mor"] }, v: 1 }, availability_source: "dashboard" }] }) &&
    !nothingOnFile({ ...bare, bookings: [leoDec5] }) &&
    !nothingOnFile({ ...bare, invites: [invite()] }) &&
    !nothingOnFile({ ...bare, enrollments: [{ id: "e1" }] }) &&
    !nothingOnFile({ ...bare, credits: [credit("b", "p_sam", "Sam Patel")] })
  );
  const solo = { selfId: "p_sam", roster: [{ id: "p_sam", relationship: "self", full_name: "Sam Patel", level: null }], voice: "you" as const };
  const quiz = nextStepFor(base({ ...solo, nothingOnFile: true }));
  check("the next step is the quiz, its exact label on the one primary, to /intake; Book Your Assessment the outline second", () =>
    quiz.kind === "quiz" &&
    JSON.stringify(quiz.primary) === JSON.stringify({ href: "/intake", label: "Take the 2-minute quiz" }) &&
    JSON.stringify(quiz.secondary) === JSON.stringify({ href: "/assessment/book", label: "Book Your Assessment" }),
    () => JSON.stringify(quiz)
  );
  check("…and it never says there is nothing else to do, or that our coaches are placing anyone", () =>
    !/nothing else you need to do|are placing/i.test(`${quiz.headline} ${quiz.detail}`)
  );
  check("…in words: nothing on file yet, what the quiz does, and the $20 mechanic in full", () =>
    quiz.headline === "Nothing on file for you yet." &&
    quiz.detail.startsWith("Take the 2-minute quiz and our coaches place you by level and schedule. ") &&
    quiz.detail.includes("It costs $20, and if you enroll in a program afterward that $20 comes off the price."),
    () => `${quiz.headline} | ${quiz.detail}`
  );
  const withGroups = nextStepFor(base({ ...solo, nothingOnFile: true, groupsBelow: true }));
  check("with groups listed below, it names the other path too", () =>
    withGroups.kind === "quiz" && withGroups.detail.includes("by level and schedule. Or pick a group with dates below. ") && !/nothing else you need to do/i.test(withGroups.detail)
  );
  const child = nextStepFor(base({ roster: [leo], nothingOnFile: true }));
  const pair = nextStepFor(base({ roster: [maya, leo], nothingOnFile: true }));
  check("a household reads by name", () =>
    child.headline === "Nothing on file for Leo yet." && child.detail.startsWith("Take the 2-minute quiz and our coaches place Leo by level and schedule.") &&
    pair.headline === "Nothing on file for Maya and Leo yet." && pair.detail.startsWith("Take the 2-minute quiz and our coaches place each player by level and schedule."),
    () => `${child.headline} ${pair.headline} ${pair.detail}`
  );
  check("something on file keeps our coaches placing the player", () => nextStepFor(base({ ...solo, nothingOnFile: false })).kind === "placing");

  const html = dashboard(quiz);
  const card = stepCard(html);
  check("on the page: one lime button, exactly Take the 2-minute quiz, to /intake", () => {
    const lime = limeLinks(html);
    return lime.length === 1 && /href="\/intake"/.test(lime[0]) && words(lime[0]) === "Take the 2-minute quiz" && card.includes(lime[0]);
  }, () => limeLinks(html).join(" | "));
  check("…nowhere on the page: nothing else you need to do, or our coaches placing anyone", () => !/nothing else you need to do|are placing/i.test(words(html)));
  check("…My programs says plainly that nothing is enrolled yet", () => words(myPrograms(html)).includes("Nothing is enrolled yet. Programs show here once you enroll."));
  check("…and the line under the times does not ask for the quiz again", () => {
    const part = availabilityPart(html);
    return !part.includes("Not placed yet?") && !part.includes('href="/intake"');
  });
  // The lower line stays where the next step is something else.
  const guest = dashboard(nextStepFor(base({ ...solo, nothingOnFile: false })));
  check("an account that never took the quiz, with something else as its next step, still reads the line under the times", () => availabilityPart(guest).includes("Not placed yet? Take the 2-minute quiz"));
}

// ─── 4. A held spot is offered once ──────────────────────────────────────────
console.log("4. A held block leaves Groups with dates");
{
  const hold = invite({ id: "inv_sam", cohort_id: "adult-beg", participant_id: "p_sam", expires_at: "2026-11-27T23:00:00.000Z" });
  check("the blocks the account holds an open spot in: invited, the hold not lapsed", () =>
    heldCohortIds([hold], NOW).join() === "adult-beg" &&
    heldCohortIds([{ ...hold, expires_at: "2026-11-25T23:00:00.000Z" }], NOW).length === 0 &&
    heldCohortIds([{ ...hold, status: "expired" }], NOW).length === 0 &&
    heldCohortIds([{ ...hold, status: "paid" }], NOW).length === 0 &&
    heldCohortIds([{ ...hold, status: "declined" }], NOW).length === 0
  );
  check("a held block is not in Groups with dates; the other blocks stay", () =>
    listed([adult, junior], { heldCohortIds: heldCohortIds([hold], NOW) }) === "youth-wide" && listed([adult, junior]) === "youth-wide,adult-beg",
    () => listed([adult, junior])
  );
  check("…a lapsed hold lists the block again", () => listed([adult], { heldCohortIds: heldCohortIds([{ ...hold, expires_at: "2026-11-25T23:00:00.000Z" }], NOW) }) === "adult-beg");
  check("…and an enrolled block stays out, as before", () => listed([adult], { enrolledCohortIds: ["adult-beg"] }) === "");
}

// ─── 5. Nothing booked hidden ────────────────────────────────────────────────
console.log("5. Every other dated item: one short line under the next step");
{
  const step = nextStepFor(base({ invites: [leoTransfer], bookings: [leoDec5] }));
  check("a pending e-transfer and a booked assessment: the transfer leads, the assessment is a line under it", () =>
    step.kind === "etransfer" && lines(step) === JSON.stringify(["Leo's assessment is Sat Dec 5 at 10:20am."]),
    () => lines(step)
  );
  check("…its day, date and time kept whole, so a phone breaks the line before them, never inside", () =>
    step.also?.[0] === `Leo's assessment is ${["Sat", "Dec", "5", "at", "10:20am."].join(NBSP)}`
  );
  const html = dashboard(step, { self: dana, players: [dana, mayaRecord, leoRecord], roster: [mayaRecord, leoRecord], voice: "named", quizTaken: true });
  const card = stepCard(html);
  check("…drawn right under the detail, in the detail's own size and colour, with no label and no card of its own", () => {
    const detailAt = card.indexOf(step.detail.slice(0, 20));
    const list = card.match(/<ul role="list" class="([^"]*)"><li>([^<]*)<\/li><\/ul>/);
    return (
      detailAt > -1 &&
      !!list &&
      list[1] === "mt-2 space-y-1 text-sm leading-relaxed text-white/70" &&
      list[2].split(NBSP).join(" ") === "Leo&#x27;s assessment is Sat Dec 5 at 10:20am." &&
      card.indexOf(list[0]) > detailAt &&
      card.indexOf(list[0]) < card.indexOf("See my programs") &&
      !/uppercase/.test(card.slice(card.indexOf(list[0]) - 200, card.indexOf(list[0])))
    );
  }, () => card.slice(0, 1600));
  check("nothing new when there is nothing else", () => nextStepFor(base({ invites: [leoTransfer] })).also === undefined && !stepCard(dashboard(nextStepFor(base({ invites: [leoTransfer] })))).includes("<ul"));
  check("the step's own item is never repeated under it", () => {
    const assessment = nextStepFor(base({ bookings: [leoDec5] }));
    const paid: DashEnrollment = { id: "e1", cohort_id: "coh_youth", program: null, participant_name: "Maya Chen", status: "paid", created_at: "" };
    const session: DashSession = { id: "s1", cohort_id: "coh_youth", session_date: "2027-01-16", start_time: "13:00:00", end_time: "14:00:00", status: "scheduled", makeup_for: null };
    const lesson = nextStepFor(base({ enrollments: [paid], sessionsByCohort: { coh_youth: [session] } }));
    return assessment.kind === "assessment" && assessment.also === undefined && lesson.kind === "session" && lesson.also === undefined;
  });
  // A household with everything at once: two held spots, two bookings and a
  // paid player's next class. The card leads with the soonest hold; the
  // other four items are lines, the three soonest only, soonest first.
  const paid: DashEnrollment = { id: "e_maya", cohort_id: "coh_youth", program: null, participant_name: "Maya Chen", status: "paid", created_at: "" };
  const mayaClass: DashSession = { id: "s_maya", cohort_id: "coh_youth", session_date: "2027-01-16", start_time: "13:00:00", end_time: "14:00:00", status: "scheduled", makeup_for: null };
  const busy = nextStepFor(
    base({
      enrollments: [paid],
      sessionsByCohort: { coh_youth: [mayaClass] },
      invites: [
        invite({ id: "inv_leo_adult", cohort_id: "adult-beg", token: "tok_a", expires_at: "2026-11-27T23:00:00.000Z" }),
        invite({ id: "inv_leo_youth", cohort_id: "coh_youth", token: "tok_y", expires_at: "2026-11-29T17:00:00.000Z" }),
      ],
      bookings: [leoDec5, { ...leoDec5, id: "bk_maya", participantId: "p_maya", playerName: "Maya Chen", date: "2026-11-28", start: "09:00" }],
    })
  );
  check("three at most, soonest first, never the item the card shows", () =>
    busy.kind === "invite" &&
    busy.headline.startsWith("Leo's spot is held until Fri, Nov 27") &&
    lines(busy) ===
      JSON.stringify([
        "Maya's assessment is Sat Nov 28 at 9am.",
        "Leo's spot in Youth Bootcamps is held until Sun, Nov 29, 12:00pm.",
        "Leo's assessment is Sat Dec 5 at 10:20am.",
      ]),
    () => lines(busy)
  );
  check("the next class is a line when the card leads with something else", () => {
    const step = nextStepFor(base({ enrollments: [paid], sessionsByCohort: { coh_youth: [mayaClass] }, invites: [leoTransfer] }));
    return lines(step) === JSON.stringify(["Maya's next class is Sat Jan 16 at 1pm."]);
  });
  check("a solo account reads its own lines as yours", () => {
    const own = nextStepFor(
      base({
        selfId: "p_sam",
        roster: [{ id: "p_sam", relationship: "self", full_name: "Sam Patel", level: null }],
        voice: "you",
        invites: [invite({ id: "inv_sam", participant_id: "p_sam", payment_method: "etransfer", payment_note: "Sam Patel" })],
        bookings: [{ ...leoDec5, id: "bk_sam", participantId: "p_sam", playerName: "Sam Patel" }],
      })
    );
    return lines(own) === JSON.stringify(["Your assessment is Sat Dec 5 at 10:20am."]);
  });
}

// ─── The wiring ──────────────────────────────────────────────────────────────
console.log("The page hands the rules their facts");
{
  const page = read("src/app/dashboard/page.tsx");
  check("Groups with dates leaves out the blocks the account holds a spot in", () => page.includes("heldCohortIds: heldCohortIds(invites, now),") && page.includes("const now = new Date().toISOString();") && page.includes("    now,\n"));
  check("the next step knows when nothing is on file", () => page.includes("nothingOnFile: nothingOnFile({ players, enrollments: rows, invites, bookings, credits }),"));
  check("the credit line leaves out the $20 a waiting transfer took", () => page.includes("creditLine={creditLine(credits, roster, self?.id ?? null, { invites, cohorts, today })}"));
  const panelSrc = read("src/components/quiz/AlreadyTakenPanel.tsx");
  check("the quiz's screen lists by the same rule", () => panelSrc.includes("accountOpenCards(cards, { enrolledCohortIds: [], players })"));
  const pkg = JSON.parse(read("package.json")) as { scripts: { test: string } };
  check("npm test runs this file", () => pkg.scripts.test.includes("npx tsx src/scripts/test-dashboard-messages.ts"));
}

if (failed > 0) {
  console.log(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll dashboard message checks passed.");
