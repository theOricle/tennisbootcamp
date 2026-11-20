// Run from project root: npx tsx src/scripts/test-refunds.ts
//
// Pins backlog #84 part 3 (audit follow-up, owner 2026-11-14): refunds,
// disputes, redelivered events and payments that land on an expired hold.
//
//   1. A full refund or a dispute frees the seat (or the booking) and shows
//      in admin as refunded or disputed; a partial refund changes nothing.
//   2. A redelivered event changes nothing twice and sends no email twice:
//      every write is a guarded move out of the state it expects, and the
//      account email goes only from the delivery that made the move.
//   3. A payment that lands on an assessment hold that already expired is
//      never dropped: the booking comes back when the slot is still free,
//      else it is marked cancelled-but-paid and logged plainly for the coach.
//      No email.
//   4. No new email: the reversal paths send nothing.
//
// Pure: it calls pure functions and reads source files. No network, no
// database, no env. Exits non-zero on any failure.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  REVERSE_FROM,
  SETTLE_FROM,
  bookingReversalPatch,
  latePaymentPlan,
  refundReversal,
  rowsInStatus,
} from "../lib/stripeOutcome";
import { seatsFromSnapshot } from "../lib/seatCount";
import { planMarkUnpaid } from "../lib/paymentTransitions";
import { PAYMENT_STATUS_LABELS, statusLabel } from "../lib/adminLabels";
import {
  ENROLLMENT_CHIP,
  enrollmentIsActive,
  enrollmentNote,
  enrollmentState,
  type DashEnrollment,
} from "../lib/dashboardState";

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

// ─── 1. Which refunds count ───────────────────────────────────────────────────

console.log("refundReversal — only a full refund reverses a payment");
{
  check("refunded in full → refunded", refundReversal({ amount: 21000, amount_refunded: 21000, refunded: true }), "refunded");
  check("Stripe's flag alone is enough", refundReversal({ amount: 21000, amount_refunded: 0, refunded: true }), "refunded");
  check("the amounts alone are enough", refundReversal({ amount: 19000, amount_refunded: 19000, refunded: false }), "refunded");
  check("a partial refund changes nothing", refundReversal({ amount: 21000, amount_refunded: 2000, refunded: false }), null);
  check("nothing refunded yet changes nothing", refundReversal({ amount: 21000, amount_refunded: 0, refunded: false }), null);
  check("an empty charge changes nothing", refundReversal({}), null);
}

// ─── 2. Seats, guarded moves and redelivery ───────────────────────────────────

console.log("Enrollment rows — what a payment and a reversal may move");
{
  check("a payment settles only rows still waiting on it", [...SETTLE_FROM], ["pending", "pending_etransfer"]);
  check("a reversal takes back this session's rows, paid or not yet marked", [...REVERSE_FROM], ["pending", "paid", "test_paid"]);
  check("a refunded row is never settled again", SETTLE_FROM.includes("refunded" as never), false);
  check("a disputed row is never settled again", SETTLE_FROM.includes("disputed" as never), false);
  check("a reversal never re-reverses", REVERSE_FROM.includes("refunded" as never) || REVERSE_FROM.includes("disputed" as never), false);

  const status = new Map<number, string>([[2, "paid"], [3, "pending"], [4, "refunded"], [5, "test_paid"]]);
  check("the rows a reversal flips", rowsInStatus(status, REVERSE_FROM), [2, 3, 5]);
  check("the rows a payment flips", rowsInStatus(status, SETTLE_FROM), [3]);
  check("a row the read never saw is left alone", rowsInStatus(new Map(), REVERSE_FROM), []);
}

console.log("Scenario — a full refund frees the seat; a redelivered refund changes nothing twice");
{
  const header = ["timestamp", "cohort_id", "status"];
  const rows = new Map<number, string>([[2, "paid"], [3, "paid"]]);
  const snapshot = () => ({ header, rows: [...rows.values()].map((s) => ["t", "coh_1", s]) });
  const deliver = (from: readonly string[], to: string) => {
    const flipped = rowsInStatus(rows, from);
    for (const n of flipped) rows.set(n, to);
    return flipped;
  };
  check("two paid seats taken", seatsFromSnapshot(snapshot(), "coh_1", 8), 6);
  // A refund for the session carrying row 3:
  const first = rowsInStatus(new Map([[3, rows.get(3)!]]), REVERSE_FROM);
  for (const n of first) rows.set(n, "refunded");
  check("the refund flips its row", first, [3]);
  check("the seat is free again", seatsFromSnapshot(snapshot(), "coh_1", 8), 7);
  const again = rowsInStatus(new Map([[3, rows.get(3)!]]), REVERSE_FROM);
  check("the redelivered refund finds nothing to flip", again, []);
  check("a late completed event cannot bring the seat back", deliver(SETTLE_FROM, "paid").includes(3), false);
  check("the seat stays free", seatsFromSnapshot(snapshot(), "coh_1", 8), 7);
}

console.log("Scenario — a redelivered payment sends no email twice");
{
  // The webhook sends the account email only when this delivery moved a row.
  const rows = new Map<number, string>([[2, "pending"]]);
  let emails = 0;
  const deliver = () => {
    const flipped = rowsInStatus(rows, SETTLE_FROM);
    for (const n of flipped) rows.set(n, "paid");
    if (flipped.length > 0) emails++;
  };
  deliver();
  deliver();
  deliver();
  check("three deliveries, one email", emails, 1);
  check("the row is paid once", rows.get(2), "paid");
}

console.log("Invites — a reversed card payment gives the spot back");
{
  const now = new Date("2026-11-20T15:00:00.000Z");
  check("a paid invite whose hold still runs goes back to invited", planMarkUnpaid({ status: "paid", expires_at: "2026-11-21T00:00:00.000Z" }, now), { ok: true, patch: { status: "invited", paid_at: null } });
  check("a paid invite whose hold lapsed goes to expired", planMarkUnpaid({ status: "paid", expires_at: "2026-11-01T00:00:00.000Z" }, now), { ok: true, patch: { status: "expired", paid_at: null } });
  check("an invite that is not paid has nothing to give back (a redelivery)", planMarkUnpaid({ status: "invited", expires_at: "2026-11-21T00:00:00.000Z" }, now).ok, false);
}

console.log("Bookings — a reversed assessment payment frees the slot");
{
  check("booked → cancelled and unpaid (the slot is free)", bookingReversalPatch({ status: "booked", paid: true }), { status: "cancelled", paid: false });
  check("a test booking frees its slot too", bookingReversalPatch({ status: "booked", paid: false }), { status: "cancelled", paid: false });
  check("a hold that outran its payment event is freed", bookingReversalPatch({ status: "pending", paid: false }), { status: "cancelled", paid: false });
  check("a completed assessment keeps its result but loses its payment (no $20 credit on refunded money)", bookingReversalPatch({ status: "completed", paid: true }), { paid: false });
  check("redelivered: already cancelled and unpaid → nothing", bookingReversalPatch({ status: "cancelled", paid: false }), null);
  check("a cancelled booking that kept the money (slot taken) gives it up", bookingReversalPatch({ status: "cancelled", paid: true }), { paid: false });
}

// ─── 3. A payment on an expired hold ──────────────────────────────────────────

console.log("latePaymentPlan — a payment on a hold that is no longer pending");
{
  check("an expired hold is restored (or, if the slot is gone, marked for the coach)", latePaymentPlan("expired"), "restore");
  check("already booked (a redelivery) → nothing", latePaymentPlan("booked"), "nothing");
  check("completed → nothing", latePaymentPlan("completed"), "nothing");
  check("cancelled (this payment was already logged, or the coach cancelled it) → nothing", latePaymentPlan("cancelled"), "nothing");
  check("no booking at all → said plainly", latePaymentPlan(null), "missing");
}

// ─── Admin and dashboard words ────────────────────────────────────────────────

console.log("Admin and dashboard — refunded and disputed say so");
{
  check("admin: refunded", statusLabel(PAYMENT_STATUS_LABELS, "refunded"), "Refunded");
  check("admin: disputed", statusLabel(PAYMENT_STATUS_LABELS, "disputed"), "Disputed");
  const e = (status: string): DashEnrollment => ({ id: "e", cohort_id: "coh_1", program: null, participant_name: "Maya Chen", status, created_at: "" });
  const card = { dbStatus: "confirmed" as const, paymentMode: "card" as const };
  check("dashboard: refunded → Refunded", ENROLLMENT_CHIP[enrollmentState(e("refunded"), card)].label, "Refunded");
  check("dashboard: disputed → Payment disputed", ENROLLMENT_CHIP[enrollmentState(e("disputed"), card)].label, "Payment disputed");
  check("a refunded seat is not the player's", enrollmentIsActive(enrollmentState(e("refunded"), card)), false);
  check("a disputed seat is not the player's", enrollmentIsActive(enrollmentState(e("disputed"), card)), false);
  check("the refunded note says the spot is released", (enrollmentNote("refunded") ?? "").includes("spot"));
  check("the disputed note names the inbox", (enrollmentNote("disputed") ?? "").includes("info@tennisbootcamp.ca"));
  check("no exclamation mark", `${enrollmentNote("refunded")}${enrollmentNote("disputed")}`.includes("!"), false);
}

// ─── Source: the wiring ───────────────────────────────────────────────────────

console.log("Source — the webhook takes refunds and disputes");
{
  const hook = read("src/app/api/webhooks/stripe/route.ts");
  check("charge.refunded is handled", hook.includes('event.type === "charge.refunded"'));
  check("charge.dispute.created is handled", hook.includes('event.type === "charge.dispute.created"'));
  check("a partial refund stops at refundReversal", hook.includes("refundReversal("));
  check("the session is found by its payment", hook.includes("checkout.sessions.list({ payment_intent:"));
  const redeliveryAt = hook.indexOf("if (!firstDelivery) {");
  check(
    "a redelivery returns before any credit, invite or email",
    redeliveryAt !== -1 &&
      redeliveryAt < hook.indexOf("markCreditApplied(") &&
      redeliveryAt < hook.indexOf("markInvitePaidAndMaybeConfirm(") &&
      redeliveryAt < hook.indexOf("await notifyEnrollmentAccount(") &&
      redeliveryAt < hook.indexOf("sendPaymentUnmatchedAdminEmail(")
  );
  check("…and only the row moves come before it", redeliveryAt > hook.indexOf("await flipEnrollmentRows(") && redeliveryAt > hook.indexOf("await setEnrollmentStatusByIds("));
  check("rows settle only out of SETTLE_FROM", hook.includes("SETTLE_FROM"));
}

console.log("Source — every reversal is a guarded move and sends no email");
{
  const reversal = read("src/lib/paymentReversal.ts");
  check("the reversal module exists and is server-only", reversal.startsWith('import "server-only";'));
  check("enrollment rows move only out of REVERSE_FROM", reversal.includes('.in("status", [...REVERSE_FROM])'));
  check("invites move only from paid, card or unrecorded", reversal.includes('.eq("status", "paid")') && reversal.includes('.or("payment_method.is.null,payment_method.eq.card")'));
  check("the reversal never sends an email", /send[A-Z]\w*\(|notifyEnrollmentAccount|issueActivationLink/.test(reversal), false);
  const assessments = read("src/lib/assessments.ts");
  const late = assessments.slice(assessments.indexOf("async function settleLatePayment("));
  const lateBody = late.slice(0, late.indexOf("\n}\n"));
  check("the late-payment path exists", lateBody.length > 0);
  check("it restores out of expired only", lateBody.includes('.eq("status", "expired")'));
  check("a taken slot is logged plainly for the coach", lateBody.includes("console.error(") && lateBody.includes("Refund it or book another time by hand"));
  check("…and sends no email", /send[A-Z]\w*\(/.test(lateBody), false);
  const sheet = read("src/lib/enrollmentSheet.ts");
  check("the Sheet flip reads before it writes", sheet.includes("export async function flipEnrollmentRows(") && sheet.includes("rowsInStatus("));
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll refund checks passed.");
