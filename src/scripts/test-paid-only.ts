// Run from project root: npx tsx src/scripts/test-paid-only.ts
//
// Pins backlog #84 part 2 (audit follow-up, owner 2026-11-14): a seat or a
// booking counts as paid only on real money.
//
//   1. In production (VERCEL_ENV === "production") a missing Stripe key
//      refuses checkout and booking payment with a plain message, before any
//      row or hold exists. Mock mode runs only outside production, and its
//      rows are test rows.
//   2. Stripe's word decides: a Checkout session counts as paid only when its
//      payment_status is "paid". Checkout is card only, so nothing arrives
//      later; a session that completes unpaid marks nothing paid.
//   3. A payment made with test keys (livemode false) is a test payment: the
//      rows become test_paid, it never counts toward the seats, the minimum
//      or the confirmation, never spends a credit, never sends "confirmed" to
//      a group, and the admin labels it as a test. With live keys a payment
//      counts as it always has.
//
// Pure: it calls pure functions and reads source files. No network, no
// database, no env. Exits non-zero on any failure.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ASSESSMENT_PAYMENT_UNAVAILABLE,
  CARD_PAYMENT_UNAVAILABLE,
  assessmentSessionParams,
  enrollmentSessionParams,
  paymentRail,
} from "../lib/payments";
import { bookingPaid, bookingPaymentPlan, paymentOutcome, settlementPlan } from "../lib/stripeOutcome";
import { seatsFromSnapshot } from "../lib/seatCount";
import { PAYMENT_STATUS_LABELS, statusLabel } from "../lib/adminLabels";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown = true) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ ${name}
      expected ${e}
      got      ${a}`);
  }
}

const ROOT = process.cwd();
// Either line ending: this repo is checked out with CRLF on Windows.
const read = (path: string) => readFileSync(join(ROOT, path), "utf8").replace(/\r\n/g, "\n");

// ─── 1. The rail ──────────────────────────────────────────────────────────────

console.log("paymentRail — no mock mode in production");
{
  check("no key in production → refuse", paymentRail({ stripeKey: undefined, vercelEnv: "production" }), "refuse");
  check("a blank key in production → refuse", paymentRail({ stripeKey: "  ", vercelEnv: "production" }), "refuse");
  check("no key on a preview → mock (test rows)", paymentRail({ stripeKey: undefined, vercelEnv: "preview" }), "mock");
  check("no key in local development → mock (test rows)", paymentRail({ stripeKey: "", vercelEnv: undefined }), "mock");
  check("a key in production → Stripe", paymentRail({ stripeKey: "sk_live_x", vercelEnv: "production" }), "stripe");
  check("a test key in production → Stripe (Stripe's livemode decides the rest)", paymentRail({ stripeKey: "sk_test_x", vercelEnv: "production" }), "stripe");
  for (const [name, line] of [["checkout", CARD_PAYMENT_UNAVAILABLE], ["booking", ASSESSMENT_PAYMENT_UNAVAILABLE]] as const) {
    check(`${name}: the refusal says nothing was charged`, line.includes("nothing was charged"));
    check(`${name}: the refusal names the inbox`, line.includes("info@tennisbootcamp.ca"));
    check(`${name}: no exclamation mark`, line.includes("!"), false);
  }
}

// ─── 2. Stripe's word ─────────────────────────────────────────────────────────

console.log("paymentOutcome — paid only when Stripe says paid");
{
  check("live, paid → paid", paymentOutcome({ livemode: true, paymentStatus: "paid" }), "paid");
  check("test keys, paid → test", paymentOutcome({ livemode: false, paymentStatus: "paid" }), "test");
  check("live, unpaid → unpaid", paymentOutcome({ livemode: true, paymentStatus: "unpaid" }), "unpaid");
  check("a $0 session (no_payment_required) is no money either", paymentOutcome({ livemode: true, paymentStatus: "no_payment_required" }), "unpaid");
  check("no status at all → unpaid", paymentOutcome({ livemode: true, paymentStatus: null }), "unpaid");
  check("livemode missing is never taken for live", paymentOutcome({ livemode: undefined, paymentStatus: "paid" }), "test");
}

console.log("settlementPlan — what each outcome may touch");
{
  check("paid → rows paid, credits spent, invites settled, account told", settlementPlan("paid"), {
    rowStatus: "paid",
    applyCredits: true,
    settleInvites: true,
    notifyAccount: true,
  });
  check("test → rows test_paid only: no credit, no invite, no confirmation", settlementPlan("test"), {
    rowStatus: "test_paid",
    applyCredits: false,
    settleInvites: false,
    notifyAccount: true,
  });
  check("unpaid → nothing at all", settlementPlan("unpaid"), {
    rowStatus: null,
    applyCredits: false,
    settleInvites: false,
    notifyAccount: false,
  });
  check("a paid booking is paid", bookingPaid("paid"), true);
  check("a test payment is a test booking", bookingPaid("test"), "test");
  check("an unpaid session confirms no booking", bookingPaid("unpaid"), null);
  // Part 2's rule for assessments (review fix 2): a test-mode payment holds
  // no slot and sends no confirmation; it is labelled a test in admin.
  check("live: booked, paid, holds its slot, confirmation sent", bookingPaymentPlan(true), { status: "booked", paid: true, holdsSlot: true, sendEmails: true });
  check("free ($0): booked, unpaid, holds its slot, confirmation sent", bookingPaymentPlan(false), { status: "booked", paid: false, holdsSlot: true, sendEmails: true });
  check("test: status test, unpaid, holds no slot, nothing sent", bookingPaymentPlan("test"), { status: "test", paid: false, holdsSlot: false, sendEmails: false });
}

console.log("Scenario — a test-mode event never moves a seat count or a group's status");
{
  const header = ["timestamp", "cohort_id", "status"];
  const before = { header, rows: [["t", "coh_1", "paid"], ["t", "coh_1", "pending"]] };
  // The webhook writes settlementPlan(...).rowStatus onto the session's rows.
  const after = (status: string | null) => ({
    header,
    rows: [["t", "coh_1", "paid"], ["t", "coh_1", status ?? "pending"]],
  });
  check("seats before", seatsFromSnapshot(before, "coh_1", 8), 7);
  check("a test payment leaves the seats where they were", seatsFromSnapshot(after(settlementPlan("test").rowStatus), "coh_1", 8), 7);
  check("a live payment takes a seat", seatsFromSnapshot(after(settlementPlan("paid").rowStatus), "coh_1", 8), 6);
  check("an unpaid session takes nothing", seatsFromSnapshot(after(settlementPlan("unpaid").rowStatus), "coh_1", 8), 7);
  // The minimum counts paid invites; a test payment settles no invite, so
  // the count — and the cohort's status — cannot move.
  const invites = ["paid", "invited"];
  const settle = (plan: ReturnType<typeof settlementPlan>) =>
    plan.settleInvites ? invites.map((s) => (s === "invited" ? "paid" : s)) : invites;
  check("test: paid invites stay at 1, so a minimum of 2 is not met", settle(settlementPlan("test")).filter((s) => s === "paid").length, 1);
  check("live: the second invite is paid and the minimum of 2 is met", settle(settlementPlan("paid")).filter((s) => s === "paid").length, 2);
}

// ─── 3. Card only, and the admin's words ──────────────────────────────────────

console.log("Checkout is card only");
{
  const enroll = enrollmentSessionParams({
    cohortId: "coh_1",
    programTitle: "Adult Bootcamps",
    priceCents: 21000,
    enrollmentRowNumber: 2,
    successUrl: "https://example.test/ok",
    cancelUrl: "https://example.test/no",
  });
  check("enrollment session: card only", enroll.payment_method_types, ["card"]);
  const assessment = assessmentSessionParams({
    bookingId: "bk_1",
    priceCents: 2000,
    successUrl: "https://example.test/ok",
    cancelUrl: "https://example.test/no",
    contactEmail: "dana@example.com",
  });
  check("assessment session: card only", assessment.payment_method_types, ["card"]);
  check("assessment session: kind and booking id in metadata", [assessment.metadata?.kind, assessment.metadata?.bookingId], ["assessment", "bk_1"]);
  check("assessment session: one $20 line", [assessment.line_items?.[0]?.price_data?.unit_amount, assessment.line_items?.[0]?.quantity], [2000, 1]);
}

console.log("Admin words for a payment");
{
  check("test_paid → Test payment", statusLabel(PAYMENT_STATUS_LABELS, "test_paid"), "Test payment");
  check("paid → Paid", statusLabel(PAYMENT_STATUS_LABELS, "paid"), "Paid");
}

// ─── Source: the wiring ───────────────────────────────────────────────────────

console.log("Source — the routes refuse without a key in production, before anything exists");
{
  const checkout = read("src/app/api/checkout/route.ts");
  const refuse = checkout.indexOf('rail === "refuse"');
  check("checkout asks paymentRail", checkout.includes("const rail = paymentRail();"));
  check("checkout refuses with the plain line and a 503", checkout.includes("{ error: CARD_PAYMENT_UNAVAILABLE }, { status: 503 }"));
  check(
    "checkout refuses before any enrollment row, credit or Stripe session",
    refuse !== -1 &&
      refuse < checkout.indexOf("saveEnrollmentToSupabase(") &&
      refuse < checkout.indexOf("findUnusedCredit(") &&
      refuse < checkout.indexOf("createCheckoutSession(")
  );
  check("checkout no longer reads isMockMode", checkout.includes("isMockMode"), false);
  const mockAt = checkout.indexOf('if (rail === "mock") {');
  const mockTail = mockAt === -1 ? "" : checkout.slice(mockAt, checkout.indexOf("const res = NextResponse.json({ sessionUrl })"));
  check("the mock tail exists", mockAt !== -1);
  check("mock rows are test rows", mockTail.includes('"test_paid"'));
  check("the mock tail settles no invite and confirms no cohort", mockTail.includes("markInvitePaidAndMaybeConfirm"), false);
  check("the mock tail spends no credit", mockTail.includes("markCreditApplied"), false);

  const book = read("src/app/api/assessment/book/route.ts");
  const bookRefuse = book.indexOf('rail === "refuse"');
  check("booking refuses with its plain line and a 503", book.includes("{ error: ASSESSMENT_PAYMENT_UNAVAILABLE }, { status: 503 }"));
  check("booking refuses before the slot is held", bookRefuse !== -1 && bookRefuse < book.indexOf("createPendingBooking("));
  // Since part 5 the confirmation runs after the response, with the same word.
  check("a free booking is not a paid one, a mock booking is a test one", book.includes('const paid = priceCents === 0 ? false : "test";'));
  check("…and that word is what confirmBooking gets", book.includes("confirmBooking(hold.id, { paid })"));
  check("booking no longer reads isMockMode", book.includes("isMockMode"), false);
}

console.log("Source — the webhook reads Stripe's word before it writes");
{
  const hook = read("src/app/api/webhooks/stripe/route.ts");
  check("the outcome comes from livemode and payment_status", hook.includes("paymentOutcome({ livemode: event.livemode, paymentStatus: session.payment_status })"));
  const unpaidAt = hook.indexOf('outcome === "unpaid"');
  check("an unpaid session returns before any booking or row is touched", unpaidAt !== -1 && unpaidAt < hook.indexOf("await confirmBooking(") && unpaidAt < hook.indexOf("await flipEnrollmentRows("));
  check("a booking is confirmed with Stripe's word on the money", hook.includes("const paid = bookingPaid(outcome);") && hook.includes("{ stripeSessionId: session.id, paid }"));
  check("credits are spent only on the plan's word", hook.includes("plan.applyCredits"));
  check("invites settle only on the plan's word", hook.includes("plan.settleInvites"));
  check("rows take the plan's status", hook.includes("plan.rowStatus"));
}

console.log("Source — a test payment is no member and no paid booking");
{
  const actions = read("src/lib/cohortActions.ts");
  check("cohortMembers (the confirmed-email list) counts paid rows only", /\.from\("enrollments"\)\s*\.select\("contact_email, participant_name"\)\s*\.eq\("cohort_id", cohortId\)\s*\.eq\("status", "paid"\)/.test(actions));
  const assessments = read("src/lib/assessments.ts");
  check("confirmBooking stores paid only when the money is real", assessments.includes("paid: opts.paid === true"));
  const confirm = assessments.slice(assessments.indexOf("export async function confirmBooking("));
  check(
    "a test payment leaves confirmBooking before the booked move, the emails or the account link",
    /if \(opts\.paid === "test"\) return recordTestBooking\(/.test(confirm) &&
      confirm.indexOf("recordTestBooking(") < confirm.indexOf('status: "booked"')
  );
  const testBooking = assessments.slice(assessments.indexOf("async function recordTestBooking("));
  const testBody = testBooking.slice(0, testBooking.indexOf("\n}\n"));
  check("recordTestBooking exists", testBody.length > 0);
  check("…moves only a pending or lapsed hold, to status test (no slot)", testBody.includes('.in("status", ["pending", "expired"])') && testBody.includes("bookingPaymentPlan(\"test\")"));
  check("…and sends nothing: no confirmation, no account email", /send[A-Z]\w*\(|issueActivationLink\(/.test(testBody), false);
  // The assessments row is built in src/lib/sheetText.ts since part 4.
  const sheet = read("src/lib/sheetText.ts");
  check("the assessments tab says test for a test booking", sheet.includes('r.paid === "test" ? "test"'));
  const client = read("src/app/admin/cohorts/[id]/AdminCohortDetailClient.tsx");
  check("the cohort page lists card payments with their labels", client.includes("PAYMENT_STATUS_LABELS") && client.includes("Card payments"));
  const api = read("src/app/api/admin/cohorts/[id]/route.ts");
  check("the cohort API hands the page its payments", api.includes("cohortPayments(id)"));
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll paid-only checks passed.");
