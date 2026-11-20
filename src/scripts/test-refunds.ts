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
  BOOKING_PAYMENT_STATUSES,
  REVERSE_FROM,
  SETTLE_FROM,
  SLOT_HOLDING_STATUSES,
  bookingPaymentPlan,
  bookingReversalPatch,
  bookingStatusFallback,
  isCheckViolation,
  isFirstDelivery,
  latePaymentPlan,
  refundReversal,
  rowsInStatus,
  writeBookingState,
} from "../lib/stripeOutcome";
import { seatsFromSnapshot } from "../lib/seatCount";
import { planMarkUnpaid } from "../lib/paymentTransitions";
import { BOOKING_STATUS_LABELS, PAYMENT_STATUS_LABELS, statusLabel } from "../lib/adminLabels";
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

console.log("isFirstDelivery — the database move decides when the session has rows there");
{
  check("rows in Supabase, this delivery moved them → first", isFirstDelivery({ dbRows: 2, dbMoved: 2, sheetRows: 2, sheetMoved: 0 }));
  check("rows in Supabase, none moved → a redelivery, even if the Sheet moved", isFirstDelivery({ dbRows: 2, dbMoved: 0, sheetRows: 2, sheetMoved: 2 }), false);
  check("rows in Supabase, none moved, Sheets off → a redelivery", isFirstDelivery({ dbRows: 1, dbMoved: 0, sheetRows: 1, sheetMoved: null }), false);
  check("no Supabase rows: the Sheet decides — moved → first", isFirstDelivery({ dbRows: 0, dbMoved: 0, sheetRows: 2, sheetMoved: 2 }));
  check("no Supabase rows: the Sheet decides — none moved → a redelivery", isFirstDelivery({ dbRows: 0, dbMoved: 0, sheetRows: 2, sheetMoved: 0 }), false);
  check("nothing it can check (local development) → first", isFirstDelivery({ dbRows: 0, dbMoved: 0, sheetRows: 0, sheetMoved: null }));
  check("no Sheet rows and Sheets off → first", isFirstDelivery({ dbRows: 0, dbMoved: 0, sheetRows: 2, sheetMoved: null }));
}

console.log("Scenario — two deliveries of one payment at the same moment send one account email");
{
  // A shared Sheet and a shared enrollments table. The Sheet flip reads then
  // writes, so both deliveries can see "pending" and both write "paid"; the
  // table's update is one guarded statement, so only one moves the rows.
  const sheet = new Map<number, string>([[2, "pending"], [3, "pending"]]);
  const table = new Map<string, string>([["enr_1", "pending"], ["enr_2", "pending"]]);
  const guardedUpdate = (ids: string[]) => {
    const moved = ids.filter((id) => SETTLE_FROM.includes(table.get(id) as never));
    for (const id of moved) table.set(id, "paid");
    return moved;
  };
  const sheetReads = [rowsInStatus(sheet, SETTLE_FROM), rowsInStatus(sheet, SETTLE_FROM)]; // both read first
  for (const n of sheetReads[0]) sheet.set(n, "paid");
  for (const n of sheetReads[1]) sheet.set(n, "paid");
  const deliveries = [guardedUpdate(["enr_1", "enr_2"]), guardedUpdate(["enr_1", "enr_2"])];
  const firsts = deliveries.map((dbMoved, i) =>
    isFirstDelivery({ dbRows: 2, dbMoved: dbMoved.length, sheetRows: 2, sheetMoved: sheetReads[i].length })
  );
  check("both deliveries saw the Sheet rows pending", sheetReads.map((r) => r.length), [2, 2]);
  check("only one is the first delivery: one account email", firsts.filter(Boolean).length, 1);
  check("a third, later delivery is a redelivery", isFirstDelivery({ dbRows: 2, dbMoved: guardedUpdate(["enr_1", "enr_2"]).length, sheetRows: 2, sheetMoved: 0 }), false);
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
  check("booked → refunded and unpaid (the slot is free, the admin list says so)", bookingReversalPatch({ status: "booked", paid: true }, "refunded"), { status: "refunded", paid: false });
  check("booked → disputed and unpaid", bookingReversalPatch({ status: "booked", paid: true }, "disputed"), { status: "disputed", paid: false });
  check("a hold that outran its payment event is freed", bookingReversalPatch({ status: "pending", paid: false }, "refunded"), { status: "refunded", paid: false });
  check("a completed assessment keeps its result but loses its payment (no $20 credit on refunded money)", bookingReversalPatch({ status: "completed", paid: true }, "refunded"), { paid: false });
  check("a booking that kept the money with no slot (slot taken) reads refunded", bookingReversalPatch({ status: "cancelled", paid: true }, "refunded"), { status: "refunded", paid: false });
  check("redelivered: already refunded → nothing", bookingReversalPatch({ status: "refunded", paid: false }, "refunded"), null);
  check("a dispute after a refund → nothing", bookingReversalPatch({ status: "refunded", paid: false }, "disputed"), null);
  check("a test booking held no slot and no money → nothing", bookingReversalPatch({ status: "test", paid: false }, "refunded"), null);
  check("an unpaid cancelled booking → nothing", bookingReversalPatch({ status: "cancelled", paid: false }, "refunded"), null);
}

console.log("Booking states — test, refunded and disputed hold no slot, and say so in admin");
{
  check("the three states", [...BOOKING_PAYMENT_STATUSES], ["test", "refunded", "disputed"]);
  check("none of them holds a slot (only pending and booked do, as the database's index)", BOOKING_PAYMENT_STATUSES.some((s) => (SLOT_HOLDING_STATUSES as readonly string[]).includes(s)), false);
  check("admin: test → Test booking", statusLabel(BOOKING_STATUS_LABELS, "test"), "Test booking");
  check("admin: refunded → Refunded", statusLabel(BOOKING_STATUS_LABELS, "refunded"), "Refunded");
  check("admin: disputed → Disputed", statusLabel(BOOKING_STATUS_LABELS, "disputed"), "Disputed");
  check("before migration 0012, each falls back to cancelled (which also frees the slot)", BOOKING_PAYMENT_STATUSES.map((s) => bookingStatusFallback(s)), ["cancelled", "cancelled", "cancelled"]);
  check("any other status has no fallback", bookingStatusFallback("booked"), null);
  check("a check-constraint refusal is recognised", [isCheckViolation({ code: "23514" }), isCheckViolation({ code: "23505" }), isCheckViolation(null)], [true, false, false]);
  const assessments = read("src/lib/assessments.ts");
  check(
    "the admin list shows the three states, and cancelled, which stands in for them before 0012",
    /\.in\("status", \["pending", "booked", "completed", "no_show", "cancelled", "test", "refunded", "disputed"\]\)/.test(assessments)
  );
  check("admin: cancelled → Cancelled", statusLabel(BOOKING_STATUS_LABELS, "cancelled"), "Cancelled");
  const sql = read("supabase/migrations/0012_booking_payment_states.sql");
  const verifyAt = sql.indexOf("-- verify:");
  const body = sql.slice(0, verifyAt).split("\n").map((l) => l.replace(/--.*$/, "")).join(" ").replace(/\s+/g, " ").toLowerCase();
  check("migration 0012 carries a -- verify: block", verifyAt > 0);
  check("migration 0012 widens the status check, guarded, and nothing else", body.includes("do $$ begin if exists ( select 1 from pg_constraint where conname = 'assessment_bookings_status_check'") && body.includes("check (status in ('pending','booked','completed','no_show','cancelled','expired','requested','test','refunded','disputed'))") && !/create table|drop table|drop column|update public|delete from|create policy|grant |revoke /.test(body));
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
  // The decision is the tested helper's, fed by what this delivery moved —
  // never a value the route makes up.
  check(
    "firstDelivery is isFirstDelivery's answer, from the moves themselves",
    /const firstDelivery = isFirstDelivery\(\{\s*dbRows: paidEnrollmentIds\.length,\s*dbMoved: dbMoved\.length,\s*sheetRows: paidRows\.length,\s*sheetMoved: sheetMoved === null \? null : sheetMoved\.length,\s*\}\);/.test(hook)
  );
  const actions = read("src/lib/supabase/enrollmentActions.ts");
  const move = actions.slice(actions.indexOf("export async function setEnrollmentStatusByIds("));
  check(
    "a failed database move throws, so the webhook answers 500 and Stripe retries",
    /if \(error\) \{[^}]*throw new Error\(/.test(move.slice(0, move.indexOf("\n}\n")))
  );
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

// ─── Before migration 0012: cancelled stands in ───────────────────────────────

async function fallbackScenarios() {
  console.log("Before migration 0012 — the table refuses the new states, and cancelled stands in");
  // One booking row behind the status check as 0003 left it (or as 0012
  // widens it), written the way reverseBooking and recordTestBooking write: a
  // guarded update on the state they read. A refused status is Postgres 23514.
  const PRE_0012 = ["pending", "booked", "completed", "no_show", "cancelled", "expired", "requested"];
  const POST_0012 = [...PRE_0012, "test", "refunded", "disputed"];
  const bookingTable = (row: { status: string; paid: boolean }, allowed: readonly string[]) => {
    const state: Record<string, unknown> = { ...row };
    let writes = 0;
    const write = async (patch: Record<string, unknown>) => {
      writes++;
      if (typeof patch.status === "string" && !allowed.includes(patch.status)) {
        return { data: null, error: { code: "23514" } };
      }
      if (state.status !== row.status || state.paid !== row.paid) return { data: null, error: null };
      Object.assign(state, patch);
      return { data: { id: "booking-1" }, error: null };
    };
    return { state, write, writes: () => writes };
  };

  const bookedPaid = { status: "booked", paid: true };
  for (const kind of ["refunded", "disputed"] as const) {
    const t = bookingTable(bookedPaid, PRE_0012);
    const result = await writeBookingState(t.write, bookingReversalPatch(bookedPaid, kind)!);
    check(`${kind} before 0012: the booking is cancelled and unpaid, never left booked and paid`, t.state, { status: "cancelled", paid: false });
    check("…the write reports the row it moved, with no error", [result.data !== null, result.error], [true, null]);
  }
  {
    const t = bookingTable(bookedPaid, POST_0012);
    await writeBookingState(t.write, bookingReversalPatch(bookedPaid, "refunded")!);
    check("after 0012 the same refund reads refunded, in one write", [t.state, t.writes()], [{ status: "refunded", paid: false }, 1]);
  }
  {
    const pending = { status: "pending", paid: false };
    const plan = bookingPaymentPlan("test");
    const before = bookingTable(pending, PRE_0012);
    await writeBookingState(before.write, { status: plan.status, paid: plan.paid });
    check("a test payment before 0012: the hold is cancelled (no slot held), never left pending", before.state, { status: "cancelled", paid: false });
    const after = bookingTable(pending, POST_0012);
    await writeBookingState(after.write, { status: plan.status, paid: plan.paid });
    check("…after 0012 it reads test", after.state, { status: "test", paid: false });
  }
  {
    let calls = 0;
    const result = await writeBookingState(
      async () => {
        calls++;
        return { data: null, error: { code: "42501" } };
      },
      { status: "refunded", paid: false }
    );
    check("any other error is returned as it is, with no second write", [result.error?.code, calls], ["42501", 1]);
  }

  // Both writes go through it, so neither fallback can quietly go.
  const reversal = read("src/lib/paymentReversal.ts");
  const reverseBody = reversal.slice(reversal.indexOf("async function reverseBooking(")).split("\n}\n")[0];
  check("the refund and dispute write goes through writeBookingState", reverseBody.includes("await writeBookingState(move, patch)"));
  const assessmentsSrc = read("src/lib/assessments.ts");
  const testBody = assessmentsSrc.slice(assessmentsSrc.indexOf("async function recordTestBooking(")).split("\n}\n")[0];
  check("the test-payment write goes through writeBookingState", testBody.includes("await writeBookingState(write, {"));
}

fallbackScenarios()
  .then(() => {
    if (failures > 0) {
      console.error(`\n${failures} check(s) failed.`);
      process.exit(1);
    }
    console.log("\nAll refund checks passed.");
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
