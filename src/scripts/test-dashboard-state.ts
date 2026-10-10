// Run from project root: npx tsx src/scripts/test-dashboard-state.ts
//
// Pins audit item I (household, dashboard states and admin operations):
//   M25  the next-step card picks the most urgent state (open invite, then an
//        e-transfer waiting on Sina, then a booked assessment, then the next
//        session), pending and cancelled rows never drive "Next session",
//        status chips read in words, and the $20 credit line;
//   M26  a holder who only registered a child is the account, not a player;
//   M30  a cancelled cohort reads as cancelled on the dashboard;
//   M31  the stored age band decides the program fit; migration 0009 is
//        additive and guarded;
//   M32  one primary, a truthful empty state, "Welcome" on a first visit;
//   M34  a player with history can't be removed;
//   L20/L23 the admin's words for statuses and self-estimates.
// Exits non-zero on any failure.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Cohort } from "../types/cohort";
import {
  holderIsPlayer,
  trainingRoster,
  rosterVoice,
  namesList,
  possessive,
  removalBlocker,
  type RosterPlayer,
} from "../lib/householdView";
import {
  ENROLLMENT_CHIP,
  creditLine,
  enrollmentIsActive,
  enrollmentNote,
  enrollmentState,
  fmtHoldDeadline,
  nextStepFor,
  welcomeHeading,
  type DashBooking,
  type DashEnrollment,
  type DashInvite,
  type DashSession,
  type NextStepInput,
} from "../lib/dashboardState";
import {
  BOOKING_STATUS_LABELS,
  COHORT_STATUS_LABELS,
  INVITE_STATUS_LABELS,
  programTitleFor,
  selfEstimateLine,
  statusLabel,
} from "../lib/adminLabels";
import { programFitsPlayer, suggestProgramsFor } from "../lib/programCatalog";
import { listedPrograms, programs, COHORT_LENGTH, COHORT_TOTAL, formatDollars } from "../content/programs";
import { aggregateAvailabilityMatrix } from "../lib/availabilityMatrix";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ ${name}\n      expected ${e}\n      got      ${a}`);
  }
}
function ok(name: string, cond: boolean) {
  check(name, cond, true);
}

const TODAY = "2026-10-10";
const NOW = "2026-10-10T16:00:00.000Z";
const PRICE = COHORT_TOTAL * 100;

function cohort(over: Partial<Cohort>): Cohort {
  return {
    id: "coh_deuce",
    programId: "youth-programs",
    locationId: "",
    label: "Fall Saturday",
    startDate: "2026-10-17",
    endDate: "2026-11-21",
    weeks: 6,
    sessions: [{ day: "Sat", start: "12:00", end: "13:00" }],
    capacityMin: 3,
    capacityMax: 6,
    priceCents: PRICE,
    currency: "CAD",
    status: "open",
    levelMin: 3,
    levelMax: 3.5,
    visibility: "private",
    dbStatus: "inviting",
    paymentMode: "etransfer",
    ...over,
  };
}

const parent: RosterPlayer = { id: "p_dana", relationship: "self", full_name: "Dana Chen", level: null, availability: null };
const maya: RosterPlayer = { id: "p_maya", relationship: "child", full_name: "Maya Chen", level: 3.0, availability: { days: { sat: ["aft"] }, v: 1 } };
const leo: RosterPlayer = { id: "p_leo", relationship: "child", full_name: "Leo Chen", level: null, availability: { days: { sat: ["mor"] }, v: 1 } };

// ─── M26: who on the account trains ───────────────────────────────────────────

console.log("holderIsPlayer / trainingRoster (audit M26)");
{
  ok("a solo holder is always the player", holderIsPlayer(parent, [parent]));
  check("a parent who only registered a child is the account, not a player", holderIsPlayer(parent, [parent, maya]), false);
  ok("…unless Sina set their level", holderIsPlayer({ ...parent, level: 2.5 }, [parent, maya]));
  ok("…or a quiz named them (age band, 0009)", holderIsPlayer({ ...parent, age_band: "adult" }, [parent, maya]));
  ok("…or a self-estimate is on file, even Prefer not to say", holderIsPlayer({ ...parent, self_level: "" }, [parent, maya]));
  ok("…or they have availability on file", holderIsPlayer({ ...parent, availability: { days: { sun: ["eve"] }, v: 1 } }, [parent, maya]));
  ok("…or a booking or invite names them", holderIsPlayer(parent, [parent, maya], { participantIds: ["p_dana"] }));
  ok("…or an enrollment is in their name (case and spaces folded)", holderIsPlayer(parent, [parent, maya], { enrollmentNames: ["  dana  CHEN "] }));
  check("a sibling's booking doesn't name the parent", holderIsPlayer(parent, [parent, maya], { participantIds: ["p_maya"], enrollmentNames: ["Maya Chen"] }), false);
  check("roster drops the account-only parent", trainingRoster([parent, maya, leo]).map((p) => p.id), ["p_maya", "p_leo"]);
  check("roster keeps a named parent first", trainingRoster([parent, maya], { enrollmentNames: ["Dana Chen"] }).map((p) => p.id), ["p_dana", "p_maya"]);
  check("voice: holder alone → you", rosterVoice([parent], parent.id), "you");
  check("voice: one child → named", rosterVoice([maya], parent.id), "named");
  check("voice: a household → named", rosterVoice([parent, maya], parent.id), "named");
  check("names list", [namesList(["Maya"]), namesList(["Maya", "Leo"]), namesList(["you", "Maya", "Leo"])], ["Maya", "Maya and Leo", "you, Maya and Leo"]);
  check("possessive", [possessive("Maya"), possessive("James")], ["Maya's", "James'"]);
}

// ─── M34: removing a player ───────────────────────────────────────────────────

console.log("removalBlocker (audit M34)");
{
  const none = { bookings: 0, invites: 0, enrollments: 0 };
  check("a child added by mistake can go", removalBlocker(leo, none), null);
  ok("the holder stays", removalBlocker(parent, none) !== null);
  ok("a levelled player stays", removalBlocker(maya, none) !== null);
  ok("a booking keeps them", removalBlocker(leo, { ...none, bookings: 1 }) !== null);
  ok("an invite keeps them", removalBlocker(leo, { ...none, invites: 1 }) !== null);
  ok("an enrollment keeps them", removalBlocker(leo, { ...none, enrollments: 2 }) !== null);
}

// ─── M25 / M30: enrollment states ─────────────────────────────────────────────

console.log("enrollmentState + chips (audit M25, M30)");
{
  const e = (status: string): DashEnrollment => ({ id: "e", cohort_id: "coh_deuce", program: null, participant_name: "Maya Chen", status, created_at: "" });
  const etr = cohort({});
  const card = cohort({ paymentMode: "card" });
  check("paid → Enrolled", ENROLLMENT_CHIP[enrollmentState(e("paid"), etr)].label, "Enrolled");
  check("test_paid → Test enrollment (never 'Test enrolled')", ENROLLMENT_CHIP[enrollmentState(e("test_paid"), etr)].label, "Test enrollment");
  check("pending on an e-transfer cohort → E-transfer pending", ENROLLMENT_CHIP[enrollmentState(e("pending"), etr)].label, "E-transfer pending");
  check("pending on a card cohort → Payment pending", ENROLLMENT_CHIP[enrollmentState(e("pending"), card)].label, "Payment pending");
  check("a cancelled cohort wins over paid", enrollmentState(e("paid"), cohort({ dbStatus: "cancelled" })), "cancelled");
  check("cancelled note promises nothing beyond the fact (D22 open)", enrollmentNote("cancelled"), "This cohort was cancelled. Sina will contact you directly.");
  check("only paid and test rows are active", ["enrolled", "test", "etransfer-pending", "payment-pending", "cancelled", "on-file"].map((s) => enrollmentIsActive(s as never)), [true, true, false, false, false, false]);
  ok("no chip label is a raw status", Object.values(ENROLLMENT_CHIP).every((c) => /^[A-Z]/.test(c.label) && !c.label.includes("_")));
}

// ─── M25: the next-step state machine ─────────────────────────────────────────

console.log("nextStepFor — most urgent first (audit M25)");
const progs = programs.map((p) => ({ id: p.id, title: p.title }));
const base = (over: Partial<NextStepInput> = {}): NextStepInput => ({
  selfId: parent.id,
  roster: [maya],
  voice: "named",
  enrollments: [],
  cohorts: [cohort({})],
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
  id: "inv1",
  cohort_id: "coh_deuce",
  token: "tok123",
  status: "invited",
  expires_at: "2026-10-12T22:00:00.000Z",
  payment_method: null,
  participant_id: "p_maya",
  amountDueCents: PRICE,
  ...over,
});
const booking: DashBooking = { id: "b1", participantId: "p_maya", playerName: "Maya Chen", date: "2026-10-14", start: "18:00", locationLabel: null };
const session = (over: Partial<DashSession> = {}): DashSession => ({
  id: "s1",
  cohort_id: "coh_deuce",
  session_date: "2026-10-17",
  start_time: "12:00:00",
  end_time: "13:00:00",
  status: "scheduled",
  makeup_for: null,
  ...over,
});
{
  const step = nextStepFor(base({ invites: [invite()], bookings: [booking] }));
  check("an open invite outranks everything", step.kind, "invite");
  check("it names the player and the hold deadline in Toronto time", step.headline, "Maya's spot is held until Mon, Oct 12, 6:00pm.");
  ok("it says the group, the slot and the price from the cohort", step.detail.includes("Deuce group") && step.detail.includes("Saturdays 12pm–1pm") && step.detail.includes(`${formatDollars(COHORT_TOTAL)} for the ${COHORT_LENGTH}`));
  check("Claim links the invite token", step.primary, { href: "/enroll/coh_deuce?invite=tok123", label: "Claim Maya's spot" });

  const credited = nextStepFor(base({ invites: [invite({ amountDueCents: PRICE - 2000 })] }));
  ok("a $20 credit is spelled out with the amount due", credited.detail.includes("Maya's $20 assessment comes off the price, so") && credited.detail.includes(`${formatDollars(COHORT_TOTAL - 20)} is due`));

  const mine = nextStepFor(base({ roster: [parent], voice: "you", invites: [invite({ participant_id: parent.id })] }));
  check("a holder's own invite speaks to them", [mine.headline.startsWith("Your spot is held"), mine.primary?.label], [true, "Claim my spot"]);

  check("an expired hold is not an open invite", nextStepFor(base({ invites: [invite({ expires_at: "2026-10-09T00:00:00.000Z" })] })).kind, "placed");
  check("an invite to a cancelled cohort is not an open invite", nextStepFor(base({ invites: [invite()], cohorts: [cohort({ dbStatus: "cancelled" })] })).kind, "placed");

  const waiting = nextStepFor(base({ invites: [invite({ payment_method: "etransfer" })], bookings: [booking] }));
  check("an e-transfer waiting on Sina comes next", waiting.kind, "etransfer");
  ok("it carries the amount, the recipient and the memo", waiting.detail.includes(formatDollars(COHORT_TOTAL)) && waiting.detail.includes("info@tennisbootcamp.ca") && waiting.detail.includes("“Maya Chen – Fall Saturday”"));
  check("…even after the hold lapsed", nextStepFor(base({ invites: [invite({ payment_method: "etransfer", status: "expired", expires_at: "2026-10-01T00:00:00.000Z" })] })).kind, "etransfer");

  const assessment = nextStepFor(base({ bookings: [booking] }));
  check("then a booked assessment", [assessment.kind, assessment.eyebrow, assessment.headline], ["assessment", "Maya's assessment", "Wed Oct 14 · 6pm"]);
  ok("…with what to bring", assessment.detail.includes("Bring a racquet if you have one, water, and court shoes."));

  const paid: DashEnrollment = { id: "e1", cohort_id: "coh_deuce", program: null, participant_name: "Maya Chen", status: "paid", created_at: "" };
  const sessions = { coh_deuce: [session()] };
  check("then the next session of a paid enrollment", nextStepFor(base({ enrollments: [paid], sessionsByCohort: sessions })).kind, "session");
  check(
    "a pending enrollment never drives Next session",
    nextStepFor(base({ enrollments: [{ ...paid, status: "pending" }], sessionsByCohort: sessions })).kind,
    "placed"
  );
  check(
    "a cancelled cohort never drives Next session",
    nextStepFor(base({ enrollments: [paid], sessionsByCohort: sessions, cohorts: [cohort({ dbStatus: "cancelled" })] })).kind,
    "placed"
  );
  check(
    "a cancelled session is skipped for the next one",
    nextStepFor(
      base({
        enrollments: [paid],
        sessionsByCohort: { coh_deuce: [session({ status: "cancelled" }), session({ id: "s2", session_date: "2026-10-24" })] },
      })
    ).headline,
    "Sat Oct 24 · 12pm–1pm"
  );
  check("paid with no dated sessions → dates coming", nextStepFor(base({ enrollments: [paid] })).kind, "dates-coming");

  const placing = nextStepFor(base({ roster: [parent], voice: "you" }));
  check("nothing on the account → Sina is placing you", placing.headline, "Sina is placing you in a group and time.");
  check("one primary, the optional assessment as the secondary", [placing.primary?.label, placing.secondary?.label], ["Update my availability", "Book Your Assessment"]);
  ok("the $20 mechanic is spelled out (voice rule 2)", placing.detail.includes("It costs $20, and if you enroll in a program afterward that $20 comes off the price."));
  check("a child-only account speaks about the child", nextStepFor(base({ roster: [leo] })).headline, "Sina is placing Leo in a group and time.");
  check("a household names everyone", nextStepFor(base({ roster: [maya, leo] })).headline, "Sina is placing Maya and Leo in groups and times.");
  check("a levelled solo player reads as placed", nextStepFor(base({ roster: [{ ...parent, level: 3 }], voice: "you" })).kind, "placed");
}

console.log("creditLine + welcomeHeading (audit M25, M32)");
{
  const c = (participantId: string | null, playerName: string) => ({ bookingId: `b_${playerName}`, participantId, playerName, creditCents: 2000 });
  check("no credit → no line", creditLine([], [parent], parent.id), null);
  check("the holder's own", creditLine([c(parent.id, "Dana Chen")], [parent], parent.id), "Your $20 assessment comes off the price when you enroll in a program.");
  check("a child's, by name", creditLine([c("p_maya", "Maya Chen")], [maya], parent.id), "Maya's $20 assessment comes off the price when Maya enrolls in a program.");
  ok("two players each keep their own", (creditLine([c("p_maya", "Maya Chen"), c("p_leo", "Leo Chen")], [maya, leo], parent.id) ?? "").includes("Maya's and Leo's"));
  check("a first visit says Welcome", welcomeHeading("Dana", false), "Welcome, Dana");
  check("a return visit says Welcome back", welcomeHeading("Dana", true), "Welcome back, Dana");
  check("hold deadline formatting", [fmtHoldDeadline("2026-10-17T22:00:00Z"), fmtHoldDeadline("bad")], ["Sat, Oct 17, 6:00pm", ""]);
}

// ─── M31: the stored age band decides the fit ─────────────────────────────────

console.log("programFitsPlayer / suggestProgramsFor with age bands (audit M31)");
{
  const camp = programs.find((p) => p.id === "kids-summer-camp");
  const youth = programs.find((p) => p.id === "youth-programs");
  const adult = programs.find((p) => p.id === "bootcamps");
  if (!camp || !youth || !adult) throw new Error("catalog ids moved");
  check("a teen is not a Kids' Camp junior", programFitsPlayer(camp, { is_minor: true, level: null, age_band: "teen" }), false);
  check("before 0009 (no band) a minor still fits by is_minor", programFitsPlayer(camp, { is_minor: true, level: null }), true);
  check("a teen fits Youth Programs", programFitsPlayer(youth, { is_minor: true, level: null, age_band: "teen" }), true);
  check("an adult band never fits Youth", programFitsPlayer(youth, { is_minor: false, level: null, age_band: "adult" }), false);
  const kidsOnly = suggestProgramsFor([{ ...leo, is_minor: true, age_band: "junior" }], listedPrograms, []);
  ok("a child-only roster is never pitched Adult Bootcamps", !kidsOnly.some((s) => s.program.id === "bootcamps"));
}

// ─── L20 / L23: admin words ───────────────────────────────────────────────────

console.log("admin labels (audit L20, L23)");
{
  check("program title, not the slug", programTitleFor("youth-programs"), "Youth Programs");
  check("unknown id stays", programTitleFor("mystery"), "mystery");
  check("cohort statuses in sentence case", ["draft", "inviting", "cancelled"].map((s) => statusLabel(COHORT_STATUS_LABELS, s)), ["Draft", "Inviting", "Cancelled"]);
  check("invite statuses", ["invited", "paid"].map((s) => statusLabel(INVITE_STATUS_LABELS, s)), ["Invited", "Paid"]);
  check("no_show reads No-show", statusLabel(BOOKING_STATUS_LABELS, "no_show"), "No-show");
  check("an unknown status is tidied, not raw", statusLabel({}, "pending_etransfer"), "Pending etransfer");
  check("quiz self-estimate with its provisional tier", selfEstimateLine("rally"), "Quiz: I can rally (≈ Rally)");
  check("third person for a child", selfEstimateLine("rally", { self: false }), "Quiz: They can rally (≈ Rally)");
  check("Not sure carries no tier", selfEstimateLine("unsure"), "Quiz: Not sure");
  check("nothing on file → nothing", selfEstimateLine(null), "");
}

// ─── M28: matrix ticks carry participant ids ──────────────────────────────────

console.log("availability matrix — who, by participant id (audit M28)");
{
  const m = aggregateAvailabilityMatrix(
    [
      { id: "p_maya", name: "Maya Chen", level: 3, availability: { days: { sat: ["aft"] }, v: 1 } },
      { id: "p_ava", name: "Ava", level: 3.5, availability: { days: { sat: ["aft"] }, v: 1 } },
    ],
    3,
    3.5
  );
  check("each cell lists its players by id, in name order", m.who.sat.aft, [
    { id: "p_ava", name: "Ava" },
    { id: "p_maya", name: "Maya Chen" },
  ]);
  check("names and who agree", m.cells.sat.aft.names, m.who.sat.aft.map((p) => p.name));
}

// ─── Sources: the wiring the rules depend on ──────────────────────────────────

console.log("sources");
{
  const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), "utf8");
  const view = read("src", "app", "dashboard", "DashboardView.tsx");
  const primaries = (view.match(/className=\{primaryButton\}/g) ?? []).length + (view.match(/\$\{primaryButton\}/g) ?? []).length;
  check("the dashboard has one primary: the next-step card's", primaries, 1);
  ok("the empty state is the truth, with no button", view.includes("Sina is placing you — your group, dates and price land here."));
  ok("'your coach' is gone from the dashboard", !/your coach/i.test(view) && !/your coach/i.test(read("src", "lib", "dashboardState.ts")));

  const actions = read("src", "lib", "cohortActions.ts");
  ok("invites pair email and player by position", actions.includes("participantIds?.[i]") && !actions.includes("participantByEmail"));
  ok("invite by player exists", actions.includes("export async function createInvitesForParticipants"));
  const reopen = actions.slice(actions.indexOf("export async function reopenCohort"), actions.indexOf("export type CohortInput"));
  ok("reopen exists and never emails", reopen.length > 0 && !/Email\(/.test(reopen));

  const detail = read("src", "app", "admin", "cohorts", "[id]", "AdminCohortDetailClient.tsx");
  ok("Cancel cohort asks first", detail.includes("Cancel cohort…") && detail.includes('role="alertdialog"'));
  ok("status changes check the response", detail.includes("if (!res.ok)") && detail.includes("setStatusError"));
  ok("Reopen is offered on a cancelled cohort", detail.includes('action: "reopen"'));

  const create = read("src", "app", "admin", "cohorts", "AdminCohortsClient.tsx");
  ok("new cohorts default to e-transfer", create.includes('useState<"card" | "etransfer">("etransfer")'));
  ok("the label placeholder speaks tiers", create.includes('placeholder="Saturday 12pm — Deuce"'));

  const webhook = read("src", "app", "api", "webhooks", "stripe", "route.ts");
  ok("a household card payment marks every Supabase row paid", webhook.includes('.in("id", paidEnrollmentIds)'));

  const sql = read("supabase", "migrations", "0009_participants_age_band_self_level.sql");
  ok("0009 is additive and guarded", sql.includes("add column if not exists age_band") && sql.includes("add column if not exists self_level") && !/\bdrop\b/i.test(sql.replace(/--.*$/gm, "")));
  ok("0009 carries a verify block", sql.includes("-- verify:"));

  const players = read("src", "lib", "players.ts");
  ok("reads fall back to the 0007 columns before 0009", players.includes("isUndefinedColumn(first.error)") && players.includes("PARTICIPANT_BASE_COLUMNS"));
  const household = read("src", "lib", "household.ts");
  ok("answers are remembered without blocking a form", household.includes("async function rememberAnswers") && household.includes("catch (err)"));
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll dashboard-state checks passed.");
