// Run from project root: npx tsx src/scripts/test-safety-round.ts
//
// Pins the fix round that followed the safety review of backlog #84: one
// block per point, each written before its fix and failing without it.
//
//   1. A row number the browser sent is moved only when it is the payer's
//      own: at checkout (cohort, contact email, still pending) and again when
//      a payment event moves it; a test-mode event never moves a paid row; a
//      reversal finds its row by the payment's cohort and email.
//   2. The $20 credit is one rule: the dashboard's line, card checkout, the
//      e-transfer amount and the coach's invite read it, so the dashboard
//      never promises what a charge will not apply. A booking linked to an
//      account but to no player still comes off, once. A booking not on the
//      account yet is named, with the sign-in link that puts it there.
//   3. A webhook delivery that stops half-way is finished by the next one:
//      every delivery walks the guarded steps, and only the one whose row
//      move landed sends the emails.
//   4. The limits count what a request does, not only that it arrived: the
//      three sign-up routes cap the body and the players, and an e-transfer
//      try counts once for each player it emails for.
//   5. A booking that links late never writes its old level over one the
//      coach set by hand since.
//   6. A refund gives back only an invite its own payment settled, and a
//      second card payment through an already-paid invite is noted for the
//      coach.
//   7. Mock checkout marks its test rows through the same guarded flip.
//   8. A test payment enrolls nobody: its row never reads "Already enrolled".
//   9. On the sign-up routes a tripped bot check is a plain refusal the page
//      shows, never a fake success.
//
// Pure: it calls pure functions, drives in-memory stores and reads source
// files. No network, no database, no env. Exits non-zero on any failure.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CHECKOUT_ROW_STATUS,
  foreignRows,
  paymentRowsToMove,
  rowsNotPayable,
  type EnrollmentSheetSnapshot,
} from "../lib/enrollGate";
import {
  REVERSE_FROM,
  REVERSE_FROM_TEST,
  SETTLE_FROM,
  SETTLE_FROM_TEST,
  cardPaidNote,
  duplicatePaymentNote,
  duplicateReversedNote,
  noteNamesDuplicate,
  noteSettledBy,
  paidInviteHit,
  reversalNote,
  reversalReleasesInvite,
  reverseFrom,
  settleFrom,
} from "../lib/stripeOutcome";
import { planMarkUnpaid } from "../lib/paymentTransitions";
import { seatsFromSnapshot } from "../lib/seatCount";
import {
  ASSESSMENT_CREDIT_CENTS,
  accountCredits,
  carriesCredit,
  creditReach,
  decideCredits,
  type CreditBooking,
} from "../lib/creditRules";
import {
  settleEnrollmentPayment,
  settlementStage,
  type SettlementDeps,
  type SettlementInput,
} from "../lib/paymentSettlement";
import {
  LIMITS,
  maxDailyEmailsPerAddress,
  submissionWeight,
  takeTicket,
  type LimitScope,
  type LimitStore,
  type StoredHit,
} from "../lib/submissionLimits";
import { MAX_PARTICIPANTS_PER_ACCOUNT, tooManyPlayers } from "../lib/participantInput";
import { BOT_REFUSAL_ERROR, MAX_BODY_BYTES, bodyTooLarge, checkBot } from "../lib/botCheck";
import { withHumanFallback } from "../lib/formValidation";
import { linkedBookingPlayer, linkedLevelApplies } from "../lib/guestAccount";
import { alreadyInCohortReason, enrollmentRowBlocks } from "../lib/enrollPlayers";
import { creditLine } from "../lib/dashboardState";
import { amountDueCents } from "../lib/paymentTransitions";
import { rowsWithEmail } from "../lib/enrollmentLink";
import {
  CREDIT_WAITING_LEAD,
  CREDIT_WAITING_STEP,
  SIGN_IN_LINK_BUTTON,
  SIGN_IN_LINK_COOLDOWN_MS,
  SIGN_IN_LINK_DAILY_CAP,
  SIGN_IN_LINK_FAILED,
  SIGN_IN_LINK_META_KEY,
  SIGN_IN_LINK_SENT,
  SIGN_IN_LINK_SUBJECT,
  recordSignInLink,
  signInLinkAllowed,
} from "../lib/signInLink";

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

const sections: (() => void | Promise<void>)[] = [];

// ─── 1. A browser-sent row number never moves another family's row ───────────

/** An enrollments tab in memory: the three columns the checks read, by name. */
function sheetOf(rows: [cohort: string, email: string, status: string][]): EnrollmentSheetSnapshot & {
  status(n: number): string;
  apply(moved: number[], to: string): void;
} {
  const header = ["timestamp", "cohort_id", "program", "contact_email", "status"];
  const data = rows.map(([cohort, email, status]) => ["t", cohort, "p", email, status]);
  return {
    header,
    rows: data,
    status: (n) => data[n - 2][4],
    apply: (moved, to) => {
      for (const n of moved) data[n - 2][4] = to;
    },
  };
}

sections.push(function point1() {
  console.log("1. rowsNotPayable — at checkout the row must be the payer's own, and pending");
  {
    const sheet = sheetOf([
      ["coh_1", "dana@example.com", "pending_etransfer"], // row 2: a family waiting on its e-transfer
      ["coh_1", "rui@example.org", "paid"], // row 3: a family that paid
      ["coh_1", "sam@example.net", "pending"], // row 4: the payer's own
      ["coh_2", "sam@example.net", "pending"], // row 5: the payer's, in another cohort
      ["coh_1", "  Sam@Example.NET ", "pending"], // row 6: the payer's, typed differently
    ]);
    const mine = { cohortId: "coh_1", email: "sam@example.net" };
    check("the status /api/enroll writes is the one a checkout may pay for", CHECKOUT_ROW_STATUS, "pending");
    check("the payer's own pending row passes", rowsNotPayable(sheet, { ...mine, rowNumbers: [4] }), []);
    check("…case and spaces aside", rowsNotPayable(sheet, { ...mine, rowNumbers: [6] }), []);
    check("the hole: the cohort check alone let a stranger name any row of the cohort", foreignRows(sheet, "coh_1", [2, 3]), []);
    check("a stranger naming another family's rows is refused", rowsNotPayable(sheet, { ...mine, rowNumbers: [2, 3] }), [2, 3]);
    check(
      "…even typing that family's email: a row waiting on an e-transfer is not pending",
      rowsNotPayable(sheet, { cohortId: "coh_1", email: "dana@example.com", rowNumbers: [2] }),
      [2]
    );
    check(
      "…and a paid row is nobody's to pay for again",
      rowsNotPayable(sheet, { cohortId: "coh_1", email: "rui@example.org", rowNumbers: [3] }),
      [3]
    );
    check("the payer's row in another cohort is refused", rowsNotPayable(sheet, { ...mine, rowNumbers: [5] }), [5]);
    check("one bad row among good ones is named", rowsNotPayable(sheet, { ...mine, rowNumbers: [4, 3, 6] }), [3]);
    check("a checkout with no email owns no row", rowsNotPayable(sheet, { cohortId: "coh_1", email: "", rowNumbers: [4] }), [4]);
    check("the header row, a row past the end and nonsense numbers are refused", rowsNotPayable(sheet, { ...mine, rowNumbers: [1, 99, 0, -4, 2.5] }), [1, 99, 0, -4, 2.5]);
    check(
      "a tab without the columns trusts nothing",
      rowsNotPayable({ header: ["cohort_id", "status"], rows: [["coh_1", "pending"]] }, { ...mine, rowNumbers: [2] }),
      [2]
    );
  }

  console.log("1. settleFrom / reverseFrom — what a test-mode event may move");
  {
    check("a live payment settles rows still waiting on it", [...settleFrom("paid")], [...SETTLE_FROM]);
    check("a test payment settles a pending row only", [...settleFrom("test")], ["pending"]);
    check("…never one that waits on a real e-transfer", (SETTLE_FROM_TEST as readonly string[]).includes("pending_etransfer"), false);
    check("a live reversal takes back paid, test-paid or still-pending rows", [...reverseFrom(true)], [...REVERSE_FROM]);
    check("a test-mode reversal never moves a paid row", [...reverseFrom(false)], ["pending", "test_paid"]);
    check("…and a missing flag is never taken for live", [reverseFrom(null), reverseFrom(undefined)], [[...REVERSE_FROM_TEST], [...REVERSE_FROM_TEST]]);
  }

  console.log("1. paymentRowsToMove — at flip time: cohort, email and expected status, again");
  {
    const sheet = sheetOf([
      ["coh_1", "dana@example.com", "pending_etransfer"], // 2
      ["coh_1", "rui@example.org", "paid"], // 3
      ["coh_1", "sam@example.net", "pending"], // 4
      ["coh_1", "sam@example.net", "paid"], // 5
    ]);
    const sam = { cohortId: "coh_1", email: "sam@example.net" };
    check(
      "the payment's own pending row settles",
      paymentRowsToMove(sheet, { ...sam, rowNumbers: [4], from: settleFrom("paid") }),
      { rows: [4], own: [4], unresolved: [] }
    );
    check(
      "a row that is another family's is not moved, whatever its status",
      paymentRowsToMove(sheet, { ...sam, rowNumbers: [2, 3], from: settleFrom("paid") }),
      { rows: [], own: [], unresolved: [2, 3] }
    );
    check(
      "a row of its own that is already paid is left (a redelivery): own, not moved",
      paymentRowsToMove(sheet, { ...sam, rowNumbers: [5], from: settleFrom("paid") }),
      { rows: [], own: [5], unresolved: [] }
    );
    check(
      "a test payment typed with the family's own email still cannot move its e-transfer row",
      paymentRowsToMove(sheet, { cohortId: "coh_1", email: "dana@example.com", rowNumbers: [2], from: settleFrom("test") }).rows,
      []
    );
    check(
      "a test-mode dispute typed with the family's own email still cannot move its paid row",
      paymentRowsToMove(sheet, { cohortId: "coh_1", email: "rui@example.org", rowNumbers: [3], from: reverseFrom(false), relocate: true }).rows,
      []
    );
    check(
      "no email or no cohort on the event moves nothing",
      [
        paymentRowsToMove(sheet, { cohortId: "coh_1", email: "", rowNumbers: [4], from: settleFrom("paid") }).rows,
        paymentRowsToMove(sheet, { cohortId: "", email: "sam@example.net", rowNumbers: [4], from: settleFrom("paid") }).rows,
      ],
      [[], []]
    );
    check("row numbers are read once each, and nonsense is dropped", paymentRowsToMove(sheet, { ...sam, rowNumbers: [4, 4, 1, 0, 2.5], from: settleFrom("paid") }).rows, [4]);
  }

  console.log("1. Scenario — the three stories from the review, each ending with the victim's row untouched");
  {
    // The victim: a family on the e-transfer rail (row 2), and one that paid (row 3).
    const sheet = sheetOf([
      ["coh_1", "dana@example.com", "pending_etransfer"],
      ["coh_1", "rui@example.org", "paid"],
    ]);
    const before = () => [sheet.status(2), sheet.status(3)];

    // Story 1: signed out, a stranger posts the victim's row number and pays
    // with Stripe's test card. Checkout refuses; and had a session existed,
    // the completed event (its own email in metadata) moves nothing.
    check("story 1: checkout refuses the row", rowsNotPayable(sheet, { cohortId: "coh_1", email: "mallory@example.com", rowNumbers: [2] }), [2]);
    const settled = paymentRowsToMove(sheet, { cohortId: "coh_1", email: "mallory@example.com", rowNumbers: [2], from: settleFrom("test") });
    sheet.apply(settled.rows, "test_paid");
    check("story 1: the e-transfer row is still waiting on its e-transfer", before(), ["pending_etransfer", "paid"]);

    // Story 2: the test dispute card against the row that paid.
    check("story 2: checkout refuses the row", rowsNotPayable(sheet, { cohortId: "coh_1", email: "mallory@example.com", rowNumbers: [3] }), [3]);
    const disputed = paymentRowsToMove(sheet, { cohortId: "coh_1", email: "mallory@example.com", rowNumbers: [3], from: reverseFrom(false), relocate: true });
    sheet.apply(disputed.rows, "disputed");
    check("story 2: the paid row is still paid, and its seat is still taken", [before(), seatsFromSnapshot(sheet, "coh_1", 8)], [["pending_etransfer", "paid"], 7]);

    // Story 3: a refund weeks later, when another family's row sits at the
    // number the session remembers.
    const later = sheetOf([
      ["coh_1", "rui@example.org", "paid"], // row 2: where the refunded payment's row used to be
      ["coh_1", "sam@example.net", "pending"], // row 3: an unfinished sign-up of the payer's
      ["coh_1", "sam@example.net", "paid"], // row 4: the refunded payment's own row, moved down
    ]);
    const refund = paymentRowsToMove(later, { cohortId: "coh_1", email: "sam@example.net", rowNumbers: [2], from: reverseFrom(true), relocate: true });
    check("story 3: the refund finds its own row by cohort and email, not the row at the old number", refund, { rows: [4], own: [4], unresolved: [] });
    later.apply(refund.rows, "refunded");
    check("story 3: the other family's row is untouched and only the refunded seat is free", [later.status(2), later.status(3), later.status(4)], ["paid", "pending", "refunded"]);
    const again = paymentRowsToMove(later, { cohortId: "coh_1", email: "sam@example.net", rowNumbers: [2], from: reverseFrom(true), relocate: true });
    check("story 3: redelivered, the refund finds nothing more to move and guesses at nothing", again, { rows: [], own: [], unresolved: [2] });

    // Two settled rows for one family and one remembered number that no
    // longer fits: nothing is guessed.
    const twins = sheetOf([
      ["coh_1", "rui@example.org", "paid"],
      ["coh_1", "sam@example.net", "paid"],
      ["coh_1", "sam@example.net", "paid"],
    ]);
    check(
      "when the row cannot be told apart, nothing is moved and the position is reported",
      paymentRowsToMove(twins, { cohortId: "coh_1", email: "sam@example.net", rowNumbers: [2], from: reverseFrom(true), relocate: true }),
      { rows: [], own: [], unresolved: [2] }
    );
    check(
      "a settle never goes looking: a remembered row that is not its own is left and reported",
      paymentRowsToMove(later, { cohortId: "coh_1", email: "sam@example.net", rowNumbers: [2], from: settleFrom("paid") }),
      { rows: [], own: [], unresolved: [2] }
    );
  }

  console.log("1. Source — every move of a remembered row goes through the check");
  {
    const checkout = read("src/app/api/checkout/route.ts");
    const verifyAt = checkout.indexOf("rowsNotPayable(sheet.snapshot, {");
    check("checkout asks rowsNotPayable, with the email it checked", verifyAt !== -1 && /rowsNotPayable\(sheet\.snapshot, \{\s*cohortId: cohort\.id,\s*email: typedEmail,\s*rowNumbers: toVerify,\s*\}\)/.test(checkout));
    check("…both the single row number and every player's", checkout.includes("const toVerify = Array.from(new Set([enrollmentRowNumber, ...rowNumbers]));"));
    check("…before any enrollment row or Stripe session", verifyAt < checkout.indexOf("saveEnrollmentToSupabase(") && verifyAt < checkout.indexOf("createCheckoutSession("));
    check("…and the cohort-only check is gone from the route", checkout.includes("foreignRows("), false);

    const sheetSrc = read("src/lib/enrollmentSheet.ts");
    const flip = sheetSrc.slice(sheetSrc.indexOf("export async function flipPaymentRows("));
    const flipBody = flip.slice(0, flip.indexOf("\n}\n"));
    check("the Sheet flip reads the rows back and lets paymentRowsToMove decide", flipBody.includes("values.get(") && flipBody.includes("paymentRowsToMove("));
    check("…and writes only the rows it decided on", flipBody.includes("data: plan.rows.map("));
    check("no flip by row number alone is left", sheetSrc.includes("flipEnrollmentRows"), false);

    const hook = read("src/app/api/webhooks/stripe/route.ts");
    // The settle steps live in src/lib/paymentSettlement.ts since point 3.
    const settle = read("src/lib/paymentSettlement.ts");
    check("the webhook settles through the guarded flip, with the session's cohort and email", hook.includes("flipSheetRows: flipPaymentRows,") && hook.includes("sheetRows: paidRows,") && /deps\.flipSheetRows\(\{\s*rowNumbers: input\.sheetRows,\s*cohortId,\s*email: input\.contactEmail,\s*from,\s*to,\s*\}\)/.test(settle));
    check("…out of the statuses its outcome allows", settle.includes("const from = settleFrom(input.outcome);") && settle.includes("deps.moveEnrollments(input.enrollmentIds, from, to)"));
    check("…and writes the credit only onto a row of its own", settle.includes("sheet.own.includes(target)"));
    check("the webhook tells a reversal whether the event is live", hook.includes("reverseCheckoutSession(session, kind, { livemode: event.livemode === true })"));

    const reversal = read("src/lib/paymentReversal.ts");
    check("a reversal moves its Sheet rows by cohort and email, and may look for them", /flipPaymentRows\(\{\s*rowNumbers: rows,\s*cohortId,\s*email: meta\.contactEmail \?\? "",\s*from,\s*to: kind,\s*relocate: true,\s*\}\)/.test(reversal));
    check("…out of the statuses the event's mode allows, in the Sheet and the database", reversal.includes("const from = reverseFrom(livemode);") && reversal.includes('.in("status", [...from])'));
  }
});

// ─── 2. The $20 credit: one rule for the line and for every charge ───────────

const PRICE = 21000;

/** A family's world in memory: its account, its players and the bookings table. */
function creditWorld(bookings: Partial<CreditBooking>[]) {
  const table: CreditBooking[] = bookings.map((b, i) => ({
    id: `bk_${i + 1}`,
    user_id: null,
    participant_id: null,
    email: "dana@example.com",
    name: "Maya Chen",
    status: "completed",
    paid: true,
    credit_status: "unused",
    created_at: `2026-11-0${i + 1}T10:00:00.000Z`,
    ...b,
  }));
  let applied = 0;
  return {
    table,
    applied: () => applied,
    /** markCreditApplied: guarded on unused, so a second mark changes nothing. */
    markApplied(id: string) {
      const b = table.find((x) => x.id === id);
      if (b && b.credit_status === "unused") {
        b.credit_status = "applied";
        applied++;
      }
    },
    /**
     * /auth/callback after an emailed link (linkBookingsToAccount): unowned
     * bookings under the account's own address become the account's, and the
     * player is attached only when the name is clear.
     */
    link(accountId: string, email: string, players: { id: string; full_name: string | null }[]) {
      for (const b of rowsWithEmail(table, email, (x) => x.email)) {
        if (b.user_id) continue;
        b.user_id = accountId;
        const who = linkedBookingPlayer({ participantId: b.participant_id ?? null, name: b.name }, players);
        if (who && who !== "new-self" && !b.participant_id) b.participant_id = who;
      }
    },
    /** Card checkout by a signed-in account: the discount, and the bookings Stripe is told. */
    checkout(accountId: string | null, seats: (string | null)[]) {
      const credits = decideCredits({ accountId, seats, bookings: table });
      const ids = credits.flatMap((c) => (c ? [c.bookingId] : []));
      return { totalCents: PRICE * seats.length - ids.length * ASSESSMENT_CREDIT_CENTS, ids };
    },
    /** The e-transfer rail and the coach's invite: the invite row decides. */
    invite(row: { user_id: string | null; participant_id: string | null }) {
      const [credit] = decideCredits({ accountId: row.user_id, seats: [row.participant_id], bookings: table });
      return { dueCents: amountDueCents(PRICE, credit?.creditCents ?? 0), id: credit?.bookingId ?? null };
    },
  };
}

sections.push(function point2() {
  const dana = { id: "acc_dana", email: "dana@example.com" };
  const maya = { id: "p_maya", full_name: "Maya Chen" };
  const leo = { id: "p_leo", full_name: "Leo Chen" };
  const roster = [
    { id: "p_dana", relationship: "self", full_name: "Dana Chen", level: null },
    { id: "p_maya", relationship: "child", full_name: "Maya Chen", level: null },
  ];
  const view = (w: ReturnType<typeof creditWorld>, players: { id: string }[]) =>
    accountCredits({ accountId: dana.id, email: dana.email, playerIds: players.map((p) => p.id), bookings: w.table });

  console.log("2. creditReach — how a booking's $20 reaches an account");
  {
    const b = (over: Partial<CreditBooking>): CreditBooking => creditWorld([over]).table[0];
    const who = { accountId: dana.id, playerIds: [maya.id], email: dana.email };
    check("a credit is a completed, paid, unused assessment", [carriesCredit(b({})), carriesCredit(b({ paid: false })), carriesCredit(b({ status: "booked" })), carriesCredit(b({ credit_status: "applied" }))], [true, false, false, false]);
    check("it names one of the account's players → that player's", creditReach(b({ participant_id: maya.id, user_id: dana.id }), who), "player");
    check("linked to the account, to no player → the account's", creditReach(b({ user_id: dana.id }), who), "account");
    check("under the account's own address, linked to nothing → waiting", creditReach(b({}), who), "waiting");
    check("another player's own booking is not this enrollment's", creditReach(b({ participant_id: "p_other", user_id: dana.id }), who), null);
    check("another account's booking is nobody else's", creditReach(b({ user_id: "acc_rui", email: "rui@example.org" }), who), null);
    check("an unlinked booking under another address is nothing", creditReach(b({ email: "rui@example.org" }), who), null);
    check("with no account proved, an unlinked booking is nothing at all", creditReach(b({}), { accountId: null, playerIds: [] }), null);
    check("a used or unpaid booking reaches nobody", [creditReach(b({ participant_id: maya.id, credit_status: "applied" }), who), creditReach(b({ user_id: dana.id, paid: false }), who)], [null, null]);
  }

  console.log("2. Story A — booked signed out, paid, assessed, then signed in with a password");
  for (const rail of ["card checkout", "the e-transfer amount", "the coach's invite"] as const) {
    const w = creditWorld([{}]); // one paid, completed assessment under the account's address, linked to nothing
    // Signed in with the password: nothing links (a password proves no mailbox).
    const before = view(w, [maya]);
    check(`${rail}: before the link the dashboard promises nothing…`, creditLine(before.ready, roster, "p_dana"), null);
    check("…and names the waiting $20 instead", before.waiting.map((c) => c.bookingId), ["bk_1"]);
    check("…and no charge takes it off: the line and the charge agree", [w.checkout(dana.id, [maya.id]).totalCents, w.invite({ user_id: dana.id, participant_id: maya.id }).dueCents], [PRICE, PRICE]);
    // The emailed sign-in link: /auth/callback links the booking.
    w.link(dana.id, dana.email, [maya]);
    const after = view(w, [maya]);
    check("after the link it is Maya's, and the dashboard says so", creditLine(after.ready, roster, "p_dana"), "Maya's $20 assessment comes off the price when Maya enrolls in a program.");
    check("…with nothing left waiting", after.waiting, []);
    if (rail === "card checkout") {
      const paid = w.checkout(dana.id, [maya.id]);
      check("$20 off at checkout", paid.totalCents, PRICE - 2000);
      paid.ids.forEach((id) => w.markApplied(id));
      paid.ids.forEach((id) => w.markApplied(id)); // a redelivered webhook
    } else {
      const told = w.invite({ user_id: dana.id, participant_id: maya.id });
      check("$20 off the amount the player is told and the coach expects", told.dueCents, PRICE - 2000);
      const atMarkPaid = w.invite({ user_id: dana.id, participant_id: maya.id });
      check("…and mark-paid spends the same booking", atMarkPaid.id, told.id);
      if (atMarkPaid.id) w.markApplied(atMarkPaid.id);
    }
    check("the credit is marked used once", [w.applied(), w.table[0].credit_status], [1, "applied"]);
    check("…and the next enrollment pays the full price", [w.checkout(dana.id, [maya.id]).totalCents, w.invite({ user_id: dana.id, participant_id: maya.id }).dueCents, view(w, [maya]).ready], [PRICE, PRICE, []]);
  }

  console.log("2. Story B — the name on the booking is not the player's: the link attaches the account, no player");
  for (const rail of ["card checkout", "the e-transfer amount", "the coach's invite"] as const) {
    const w = creditWorld([{ name: "M. Chen-Lee" }]);
    w.link(dana.id, dana.email, [maya, leo]);
    check(`${rail}: the booking is the account's, with no player`, [w.table[0].user_id, w.table[0].participant_id], [dana.id, null]);
    const ready = view(w, [maya, leo]).ready;
    check("the dashboard promises it to the account's next enrollment", creditLine(ready, roster, "p_dana"), "Your $20 assessment comes off the price when you enroll in a program.");
    if (rail === "card checkout") {
      const paid = w.checkout(dana.id, [maya.id, leo.id]);
      check("$20 off once, for one player, though two are enrolled", [paid.totalCents, paid.ids], [2 * PRICE - 2000, ["bk_1"]]);
      paid.ids.forEach((id) => w.markApplied(id));
    } else {
      const told = w.invite({ user_id: dana.id, participant_id: maya.id });
      check("$20 off the invite's amount, whatever the name on the booking", told.dueCents, PRICE - 2000);
      if (told.id) w.markApplied(told.id);
    }
    check("the credit is marked used once", w.applied(), 1);
    check("…and nothing is left for the sibling or the next enrollment", [w.checkout(dana.id, [leo.id]).totalCents, w.invite({ user_id: dana.id, participant_id: leo.id }).dueCents], [PRICE, PRICE]);
  }

  console.log("2. Story C — linked to the account long ago, to no player, and nothing retried");
  {
    const w = creditWorld([{ user_id: dana.id, name: "Someone Else" }]);
    check("the dashboard and the charge agree it comes off", [view(w, [maya]).ready.length, w.checkout(dana.id, [maya.id]).totalCents], [1, PRICE - 2000]);
    check("…for a player typed in at sign-up too (a seat with no record)", w.checkout(dana.id, [null]).totalCents, PRICE - 2000);
    check("…on the coach's invite for that account", w.invite({ user_id: dana.id, participant_id: null }).dueCents, PRICE - 2000);
    const paid = w.checkout(dana.id, [maya.id]);
    paid.ids.forEach((id) => w.markApplied(id));
    check("used once; the next enrollment pays the full price", [w.applied(), w.checkout(dana.id, [maya.id]).totalCents], [1, PRICE]);
  }

  console.log("2. A typed email still proves nothing");
  {
    const w = creditWorld([{}, { user_id: dana.id }, { participant_id: maya.id, user_id: dana.id }]);
    check("signed out, nothing comes off, whatever is typed", w.checkout(null, [null, null]).totalCents, 2 * PRICE);
    check("signed out, naming the family's player id finds only that player's own (the route scrubs ids it does not own)", w.checkout(null, [null]).ids, []);
    check("another account gets nothing of this family's", w.checkout("acc_mallory", [null, "p_mallory"]).totalCents, 2 * PRICE);
    check("an invite nobody owns reaches no credit", w.invite({ user_id: null, participant_id: null }).dueCents, PRICE);
    check("a waiting booking is never taken off, even handed to the rule", decideCredits({ accountId: dana.id, seats: [null], bookings: [w.table[0]] }), [null]);
    const two = w.checkout(dana.id, [maya.id, leo.id]);
    check("each booking is given once: Maya's own, then the account's to Leo", two.ids, ["bk_3", "bk_2"]);
    check("a booking something else on the request used is not given again", decideCredits({ accountId: dana.id, seats: [maya.id], bookings: w.table, claimed: ["bk_3"] }).map((c) => c?.bookingId ?? null), ["bk_2"]);
    check("a player's own credit never goes to a sibling when no account credit is left", decideCredits({ accountId: dana.id, seats: [leo.id], bookings: [w.table[2]] }), [null]);
  }

  console.log("2. The dashboard never promises what a charge will not apply");
  {
    const shapes: Partial<CreditBooking>[][] = [
      [{}],
      [{ user_id: dana.id }],
      [{ participant_id: maya.id }],
      [{}, { user_id: dana.id }, { participant_id: maya.id }, { participant_id: leo.id, user_id: dana.id }],
      [{ user_id: dana.id }, { user_id: dana.id, credit_status: "applied" }, { participant_id: "p_other" }, { user_id: "acc_rui" }],
    ];
    for (const [i, shape] of shapes.entries()) {
      const w = creditWorld(shape);
      const promised = view(w, [maya, leo]).ready.map((c) => c.bookingId).sort();
      // An enrollment by this account for both players, plus as many typed
      // seats as there are account credits to place.
      const charged = decideCredits({ accountId: dana.id, seats: [maya.id, leo.id, null, null], bookings: w.table })
        .flatMap((c) => (c ? [c.bookingId] : []))
        .sort();
      check(`shape ${i + 1}: every credit the dashboard names is one a charge takes off, and no other`, promised, charged);
    }
  }

  console.log("2. The waiting line and its sign-in link");
  {
    const words = [CREDIT_WAITING_LEAD, CREDIT_WAITING_STEP.dashboard, CREDIT_WAITING_STEP.enroll, SIGN_IN_LINK_BUTTON, SIGN_IN_LINK_SENT, SIGN_IN_LINK_FAILED, SIGN_IN_LINK_SUBJECT];
    check("the line says the number, why it is not applied and what puts it there", CREDIT_WAITING_LEAD.includes("$20 assessment") && CREDIT_WAITING_LEAD.includes("isn't on your account yet") && CREDIT_WAITING_STEP.dashboard.includes("sign-in link") && CREDIT_WAITING_STEP.dashboard.includes("that $20 comes off the price when you enroll in a program"));
    check("on the sign-up page it names that page's price", CREDIT_WAITING_STEP.enroll.includes("that $20 comes off this price at payment"));
    check("a failed send names the inbox", SIGN_IN_LINK_FAILED.includes("info@tennisbootcamp.ca"));
    check("no exclamation mark, no 'credited', no dash", words.some((w) => /!|credited|—|–/.test(w)), false);

    const t0 = Date.parse("2026-11-23T15:00:00.000Z");
    check("a first link may go", signInLinkAllowed({}, t0) && signInLinkAllowed(null, t0));
    let meta: Record<string, unknown> = recordSignInLink({}, t0);
    check("the send is recorded on the account", meta[SIGN_IN_LINK_META_KEY], { day: "2026-11-23", count: 1, at: "2026-11-23T15:00:00.000Z" });
    check("not again inside a minute", signInLinkAllowed(meta, t0 + SIGN_IN_LINK_COOLDOWN_MS - 1), false);
    check("again after a minute", signInLinkAllowed(meta, t0 + SIGN_IN_LINK_COOLDOWN_MS));
    for (let i = 1; i < SIGN_IN_LINK_DAILY_CAP; i++) meta = recordSignInLink(meta, t0 + i * 2 * SIGN_IN_LINK_COOLDOWN_MS);
    const late = t0 + 3 * 60 * 60 * 1000;
    check(`not a ${SIGN_IN_LINK_DAILY_CAP + 1}th the same day`, [(meta[SIGN_IN_LINK_META_KEY] as { count: number }).count, signInLinkAllowed(meta, late)], [SIGN_IN_LINK_DAILY_CAP, false]);
    check("the next day it may go again, counted from one", [signInLinkAllowed(meta, t0 + 24 * 60 * 60 * 1000), (recordSignInLink(meta, t0 + 24 * 60 * 60 * 1000)[SIGN_IN_LINK_META_KEY] as { count: number }).count], [true, 1]);
    check("a record that cannot be read never locks an account out", signInLinkAllowed({ [SIGN_IN_LINK_META_KEY]: "x" }, t0));
    check("a stamp ahead of the clock counts as inside the minute", signInLinkAllowed(recordSignInLink({}, t0 + 5000), t0), false);
  }

  console.log("2. Source — one rule behind the line and every charge");
  {
    const credit = read("src/lib/assessmentCredit.ts");
    const loader = credit.slice(credit.indexOf("export async function loadCreditBookings("));
    const loaderBody = loader.slice(0, loader.indexOf("\n}\n"));
    check("the reads that can take money off are by player id and by account id", loaderBody.includes('.in("participant_id", ids)') && loaderBody.includes('.eq("user_id", input.accountId).is("participant_id", null)'));
    check("…and never by an email", /ilike|email/i.test(loaderBody), false);
    check("creditsForSeats is decideCredits over those reads", /export async function creditsForSeats\([\s\S]*?return decideCredits\(\{ \.\.\.input, bookings \}\);/.test(credit));
    check("the account's own address finds only what waits: unowned, escaped, re-checked", credit.includes('.is("user_id", null).ilike("email", ilikePattern(own))') && credit.includes("rowsWithEmail("));
    check("the old per-email and per-player lookups are gone", /findUnusedCredit|listUnusedCreditsForAccount/.test(credit), false);

    const checkout = read("src/app/api/checkout/route.ts");
    check("checkout: the rule, for the signed-in account and its scrubbed players", checkout.includes("await creditsForSeats({ accountId: signedIn.id, seats: creditFor })") && checkout.includes("checkoutCreditParticipants(Boolean(signedIn), players)"));
    check("checkout: signed out, nothing is looked up", checkout.includes(": creditFor.map(() => null);"));
    const actions = read("src/lib/cohortActions.ts");
    check("the invite email, the amount due, the amount told and mark-paid all ask the rule", (actions.match(/await creditsForSeats\(\{/g) ?? []).length, 4);
    check("…by the invite row's own account and player", actions.includes("accountId: invite.user_id ?? null,\n    seats: [invite.participant_id ?? null],") && actions.includes("accountId: invite.user_id ?? null,\n    seats: [params.participantId ?? invite.participant_id ?? null],"));
    check("…and mark-paid by the same two", actions.includes("settleEtransferEnrollment(cohortId, invite.email, invite.participant_id, invite.user_id)"));
    const page = read("src/app/enroll/[cohortId]/page.tsx");
    check("the sign-up page reads the same rule", page.includes("accountCreditView({") && page.includes("await creditsForSeats({") && !/findUnusedCredit|listUnusedCreditsForAccount/.test(page));
    const dash = read("src/app/dashboard/page.tsx");
    check("the dashboard's line is fed what a charge would apply, and nothing else", dash.includes("const credits = creditView.ready;") && dash.includes("creditLine={creditLine(credits, roster, self?.id ?? null)}"));
    check("…and the waiting $20 is named, not promised", dash.includes("creditWaiting={creditView.waiting.length > 0}"));
    for (const file of ["src/app/api/checkout/route.ts", "src/lib/cohortActions.ts", "src/app/enroll/[cohortId]/page.tsx", "src/app/dashboard/page.tsx", "src/app/profile/page.tsx"]) {
      check(`${file}: no credit lookup of its own`, /findUnusedCredit|listUnusedCreditsForAccount|claimCredit\(/.test(read(file)), false);
    }
  }

  console.log("2. Source — the note, and a link only the mailbox owner can open");
  {
    const view = read("src/app/dashboard/DashboardView.tsx");
    check("the dashboard shows the note when a credit waits", /\{creditWaiting && \(\s*<CreditWaitingNote\s+page="dashboard"/.test(view));
    const wizard = read("src/app/enroll/[cohortId]/EnrollWizard.tsx");
    check("the sign-up page shows it on the price, in place of 'automatically'", wizard.includes("creditWaitingNext === null && (") && /creditWaitingNext !== null && \(\s*<CreditWaitingNote\s+page="enroll"/.test(wizard));
    check("…only for a signed-in account", wizard.includes("creditWaitingNext={signedIn && creditWaiting ? signInLinkNext : null}"));
    const note = read("src/components/account/CreditWaitingNote.tsx");
    check("the note's words are the tested ones, and its button asks the route", note.includes("{CREDIT_WAITING_LEAD} {CREDIT_WAITING_STEP[page]}") && note.includes("{SIGN_IN_LINK_BUTTON}") && note.includes('fetch("/api/auth/sign-in-link"'));
    check("it sends no address: the route knows whose it is", /email/i.test(note.slice(note.indexOf("async function send()"), note.indexOf("return ("))), false);

    const route = read("src/app/api/auth/sign-in-link/route.ts");
    const userAt = route.indexOf("const user = await currentUser();");
    const waitAt = route.indexOf("if (view.waiting.length === 0) return");
    const sendAt = route.indexOf("await sendLinkEmail(");
    check("the route needs a signed-in session before anything", userAt !== -1 && /if \(!user\) \{\s*return NextResponse\.json\(\{ error: "Sign in first\." \}, \{ status: 401 \}\);/.test(route) && userAt < route.indexOf("accountCreditView("));
    check("it sends only while a credit waits, and inside its limits", waitAt !== -1 && waitAt < sendAt && route.indexOf("if (!signInLinkAllowed(meta, now)) return") < sendAt);
    check("the link goes to the account's own address as Supabase holds it, never one from the request", route.includes("email: account.email,") && route.includes("account.email,\n      SIGN_IN_LINK_SUBJECT,") && !/body\??\.email/.test(route));
    check("where it lands is checked here and by the callback", route.includes("safeNextPath(typeof body?.next === \"string\" ? body.next : null)"));
    check("it is a magic link through /auth/callback, which is the one place bookings link", route.includes('type: "magiclink"') && route.includes("/auth/callback?token_hash=") && !route.includes("linkBookingsToAccount"));
    const callback = read("src/app/auth/callback/route.ts");
    check("linking still happens only after an emailed link or code was verified", callback.includes("linkBookingsToAccount(user.id, user.email)") && callback.indexOf("if (signedIn) {") < callback.indexOf("linkBookingsToAccount("));
    for (const file of ["src/app/dashboard/page.tsx", "src/app/enroll/[cohortId]/page.tsx", "src/app/login/page.tsx", "src/app/api/checkout/route.ts"]) {
      check(`${file}: a password session links nothing`, read(file).includes("linkBookingsToAccount"), false);
    }
  }
});

// ─── 3. A delivery that stops half-way is finished by the next one ───────────

class Killed extends Error {}

/** One paid enrollment in memory: a Sheet row, an enrollment row, a $20 credit, an invite, a cohort one payment short of its minimum. */
function settleWorld(over: { sheet?: string; row?: string; hasInvite?: boolean; hasRows?: boolean } = {}) {
  const w = {
    sheet: new Map<number, string>([[5, over.sheet ?? "pending"]]),
    rows: new Map<string, string>(over.hasRows === false ? [] : [["enr_1", over.row ?? "pending"]]),
    credit: "unused",
    creditMarks: 0,
    sheetCredit: new Map<number, string>(),
    invite: "invited",
    inviteNote: "Maya Chen" as string | null,
    inviteFlips: 0,
    duplicateFlags: 0,
    cohort: "inviting",
    confirmedEmails: 0,
    accountEmails: 0,
    unmatchedEmails: 0,
    steps: [] as string[],
  };
  const hasInvite = over.hasInvite ?? true;
  /** The writes, each one guarded as the real one is. `killAfter`: the function dies once that many steps have landed. */
  const deps = (killAfter?: number, sessionId = "cs_1"): SettlementDeps => {
    let n = 0;
    const step = async <T>(name: string, fn: () => T): Promise<T> => {
      await Promise.resolve(); // let another delivery in between any two steps
      const out = fn();
      w.steps.push(name);
      if (++n === killAfter) throw new Killed(name);
      return out;
    };
    return {
      readEnrollmentStatuses: (ids) => step("readEnrollmentStatuses", () => ids.map((id) => w.rows.get(id) ?? "")),
      flipSheetRows: ({ rowNumbers, from, to }) =>
        step("flipSheetRows", () => {
          const moved = rowNumbers.filter((r) => from.includes(w.sheet.get(r) ?? ""));
          moved.forEach((r) => w.sheet.set(r, to));
          return { moved, own: [...rowNumbers], unresolved: [] };
        }),
      applyCredit: () =>
        step("applyCredit", () => {
          if (w.credit === "unused") {
            w.credit = "applied";
            w.creditMarks++;
          }
        }),
      recordSheetCredit: (row, amount) => step("recordSheetCredit", () => void w.sheetCredit.set(row, amount)),
      requiresInvite: () => step("requiresInvite", () => true),
      settleInvite: () =>
        step("settleInvite", () => {
          if (!hasInvite) return { matched: false, alreadyPaid: false };
          if (w.invite === "invited" || w.invite === "expired") {
            // The flip and the note are one statement, as in cohortActions.
            w.invite = "paid";
            w.inviteNote = cardPaidNote(sessionId, w.inviteNote);
            w.inviteFlips++;
            return { matched: true, alreadyPaid: false };
          }
          const second = w.invite === "paid" && paidInviteHit(w.inviteNote, sessionId) === "duplicate";
          return { matched: true, alreadyPaid: false, duplicateInviteId: second ? "inv_1" : undefined };
        }),
      flagDuplicate: () =>
        step("flagDuplicate", () => {
          if (w.invite !== "paid" || paidInviteHit(w.inviteNote, sessionId) !== "duplicate") return;
          w.inviteNote = duplicatePaymentNote(sessionId, w.inviteNote);
          w.duplicateFlags++;
        }),
      moveEnrollments: (ids, from, to) =>
        step("moveEnrollments", () => {
          const moved = ids.filter((id) => from.includes(w.rows.get(id) ?? ""));
          moved.forEach((id) => w.rows.set(id, to));
          return moved;
        }),
      emailUnmatched: () => step("emailUnmatched", () => void w.unmatchedEmails++),
      notifyAccount: ({ notify }) =>
        step("notifyAccount", () => {
          if (notify) w.accountEmails++;
        }),
      confirmCohort: () =>
        step("confirmCohort", () => {
          if (w.cohort === "inviting" && w.invite === "paid") {
            w.cohort = "confirmed";
            w.confirmedEmails++;
          }
        }),
      log: () => {},
      warn: () => {},
    };
  };
  const input = (outcome: "paid" | "test" = "paid", patch: Partial<SettlementInput> = {}): SettlementInput => ({
    sessionId: "cs_1",
    outcome,
    cohortId: "coh_1",
    contactEmail: "dana@example.com",
    sheetRows: [5],
    enrollmentIds: over.hasRows === false ? [] : ["enr_1"],
    creditBookingIds: ["bk_1"],
    perCreditCents: 2000,
    inviteId: hasInvite ? "inv_1" : undefined,
    participantIds: [],
    ...patch,
  });
  const state = () => ({
    sheet: w.sheet.get(5),
    row: w.rows.get("enr_1") ?? null,
    credit: w.credit,
    creditMarks: w.creditMarks,
    sheetCredit: w.sheetCredit.get(5) ?? null,
    invite: w.invite,
    inviteFlips: w.inviteFlips,
    cohort: w.cohort,
    confirmedEmails: w.confirmedEmails,
  });
  return { w, deps, input, state };
}

const SETTLED = {
  sheet: "paid",
  row: "paid",
  credit: "applied",
  creditMarks: 1,
  sheetCredit: "20.00",
  invite: "paid",
  inviteFlips: 1,
  cohort: "confirmed",
  confirmedEmails: 1,
};

sections.push(async function point3() {
  console.log("3. settlementStage — where a payment stands before a delivery touches it");
  {
    const live = { from: ["pending", "pending_etransfer"], to: "paid" };
    check("rows still waiting → settle", settlementStage({ statuses: ["pending", "pending"], ...live }), "settle");
    check("rows already paid (a retry finishing the job) → settle", settlementStage({ statuses: ["paid", "paid"], ...live }), "settle");
    check("a refund got there first → reversed", settlementStage({ statuses: ["refunded"], ...live }), "reversed");
    check("a dispute got there first → reversed", settlementStage({ statuses: ["paid", "disputed"], ...live }), "reversed");
    check("no rows to read: the Sheet decides", settlementStage({ statuses: [], ...live }), "settle");
    check("a test payment never takes a paid row for its own", settlementStage({ statuses: ["paid"], from: ["pending"], to: "test_paid" }), "reversed");
  }

  console.log("3. One healthy delivery, then a redelivery");
  let claimStep = 0;
  let stepCount = 0;
  {
    const { w, deps, input, state } = settleWorld();
    const first = await settleEnrollmentPayment(deps(), input());
    stepCount = w.steps.length;
    claimStep = w.steps.indexOf("moveEnrollments") + 1;
    check("the order: Sheet, credit, invite, the claim, the account email, the confirmation", w.steps, ["readEnrollmentStatuses", "flipSheetRows", "applyCredit", "recordSheetCredit", "requiresInvite", "settleInvite", "moveEnrollments", "notifyAccount", "confirmCohort"]);
    check("everything is settled, once", [first, state(), w.accountEmails], [{ stage: "settled", spoke: true }, SETTLED, 1]);
    const again = await settleEnrollmentPayment(deps(), input());
    check("redelivered: nothing changes and nothing is sent twice", [again, state(), w.accountEmails], [{ stage: "redelivery", spoke: false }, SETTLED, 1]);
  }

  console.log("3. Stopped after each step, then delivered again");
  for (let k = 1; k <= stepCount; k++) {
    const { w, deps, input, state } = settleWorld();
    let died = "";
    await settleEnrollmentPayment(deps(k), input()).catch((err) => {
      if (!(err instanceof Killed)) throw err;
      died = err.message;
    });
    await settleEnrollmentPayment(deps(), input());
    await settleEnrollmentPayment(deps(), input()); // and once more, for good measure
    check(`stopped after ${died}: the end state is complete, and nothing was done twice`, state(), SETTLED);
    // The claim is the record that the email went. A stop between the claim
    // and the send loses that one email; it is never sent twice.
    check(k === claimStep ? "…the account email is the one thing a stop right after the claim loses: never sent twice" : "…and the account email went exactly once", w.accountEmails, k === claimStep ? 0 : 1);
  }
  check("the stops covered every step of a delivery", stepCount, 9);

  console.log("3. Two deliveries at the same moment");
  {
    const { w, deps, input, state } = settleWorld();
    const both = await Promise.all([settleEnrollmentPayment(deps(), input()), settleEnrollmentPayment(deps(), input())]);
    check("exactly one makes the claim and speaks", both.filter((r) => r.spoke).length, 1);
    check("one account email, one credit, one invite, one confirmation", [state(), w.accountEmails], [SETTLED, 1]);
  }

  console.log("3. A payment that matched no invite tells the coach once");
  {
    const { w, deps, input } = settleWorld({ hasInvite: false });
    await settleEnrollmentPayment(deps(), input());
    await settleEnrollmentPayment(deps(), input());
    check("one email to the coach, however often it is delivered", w.unmatchedEmails, 1);
    const stopped = settleWorld({ hasInvite: false });
    await settleEnrollmentPayment(stopped.deps(4), stopped.input()).catch(() => {});
    await settleEnrollmentPayment(stopped.deps(), stopped.input());
    check("…and a delivery stopped before the claim still gets it out, once", [stopped.w.unmatchedEmails, stopped.w.accountEmails], [1, 1]);
  }

  console.log("3. What a delivery must leave alone");
  {
    const reversed = settleWorld({ row: "refunded", sheet: "refunded" });
    const result = await settleEnrollmentPayment(reversed.deps(), reversed.input());
    check("a payment refunded before its own event arrived: nothing is settled, spent or sent", [result, reversed.state(), reversed.w.accountEmails], [{ stage: "reversed", spoke: false }, { sheet: "refunded", row: "refunded", credit: "unused", creditMarks: 0, sheetCredit: null, invite: "invited", inviteFlips: 0, cohort: "inviting", confirmedEmails: 0 }, 0]);

    const test = settleWorld();
    await settleEnrollmentPayment(test.deps(), test.input("test"));
    await settleEnrollmentPayment(test.deps(), test.input("test"));
    check("a test payment: test rows, and no credit, invite, confirmation or email, however often", [test.state(), test.w.accountEmails], [{ sheet: "test_paid", row: "test_paid", credit: "unused", creditMarks: 0, sheetCredit: null, invite: "invited", inviteFlips: 0, cohort: "inviting", confirmedEmails: 0 }, 0]);
    const waiting = settleWorld({ sheet: "pending_etransfer" });
    await settleEnrollmentPayment(waiting.deps(), waiting.input("test"));
    check("a test payment leaves a row that waits on an e-transfer", waiting.w.sheet.get(5), "pending_etransfer");

    const bare = settleWorld({ hasRows: false });
    const first = await settleEnrollmentPayment(bare.deps(), bare.input());
    const second = await settleEnrollmentPayment(bare.deps(), bare.input());
    check("a checkout that saved no enrollment rows: the Sheet decides, as before", [first.spoke, second, bare.w.accountEmails, bare.w.creditMarks], [true, { stage: "redelivery", spoke: false }, 1, 1]);
  }

  console.log("3. Source — the webhook walks the steps; a redelivery no longer returns early");
  {
    const hook = read("src/app/api/webhooks/stripe/route.ts");
    check("a completed enrollment payment goes to settleEnrollmentPayment", hook.includes("await settleEnrollmentPayment("));
    check("the early return that left a payment half settled is gone", /if \(!firstDelivery\)|already settled: redelivery, nothing changed/.test(hook), false);
    check("the writes it hands over are the guarded ones", hook.includes("flipSheetRows: flipPaymentRows,") && hook.includes("applyCredit: markCreditApplied,") && hook.includes("moveEnrollments: setEnrollmentStatusByIds,") && hook.includes("readEnrollmentStatuses: enrollmentStatuses,"));
    check("the invite is flipped without its confirmation, which is the last step", /markInvitePaidAndMaybeConfirm\(\{\s*cohortId,\s*\.\.\.by,\s*confirm: false,/.test(hook) && hook.includes("confirmCohort: () => maybeConfirmCohort(cohortId),"));
    const actions = read("src/lib/cohortActions.ts");
    check("everyone else still confirms where they always did", actions.includes("if (params.confirm !== false) await maybeConfirmCohort(cohortId);"));
    const settle = read("src/lib/paymentSettlement.ts");
    const at = (needle: string) => settle.indexOf(needle);
    const order = ["await deps.flipSheetRows(", "await deps.applyCredit(", "await deps.settleInvite(", "await deps.moveEnrollments(", "if (speaks) {", "await deps.emailUnmatched(", "await deps.notifyAccount(", "await deps.confirmCohort("].map(at);
    check("the steps are written in the order the test walked", order.every((n, i) => n !== -1 && (i === 0 || order[i - 1] < n)));
    check("it imports no service: the writes are handed in", /from "@\/lib\/(supabase|email|cohortActions|assessmentCredit|enrollmentSheet)|server-only|stripe"/.test(settle), false);
  }
});

// ─── 4. The limits count rows and emails, not only requests ──────────────────

/** Migration 0011's table in memory. */
function limitTable(clock: () => number) {
  const rows: StoredHit[] = [];
  let n = 0;
  const store: LimitStore = {
    async insert(hits) {
      const created_at = new Date(clock()).toISOString();
      return hits.map((h) => {
        const id = `hit_${++n}`;
        rows.push({ id, key_hash: h.key_hash, scope: h.scope, created_at });
        return id;
      });
    },
    async readWindow(keys, since) {
      return rows.filter((r) => keys.includes(r.key_hash) && r.created_at > since).map((r) => ({ ...r }));
    },
    async remove(ids) {
      for (const id of ids) {
        const i = rows.findIndex((r) => r.id === id);
        if (i !== -1) rows.splice(i, 1);
      }
    },
  };
  return { rows, store };
}

sections.push(async function point4() {
  const SECRET = "test-secret";
  let now = Date.parse("2026-11-23T18:00:00.000Z");
  const tick = (ms = 1000) => (now += ms);
  /** One try, as a route makes it: an e-transfer is weighed by its players. */
  const attempt = async (store: LimitStore, scope: LimitScope, address: string, email: string, players = 1) => {
    tick();
    const ticket = await takeTicket(store, { secret: SECRET, scope, address, email, now, weight: scope === "etransfer" ? players : 1 });
    if (ticket === "missing") throw new Error("the table is always there");
    return ticket;
  };

  console.log("4. One request carries one household at most");
  {
    const list = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `Player ${i + 1}` }));
    check("the cap is the household's own: 12 players", MAX_PARTICIPANTS_PER_ACCOUNT, 12);
    check("a full household passes", tooManyPlayers(list(MAX_PARTICIPANTS_PER_ACCOUNT)), false);
    check("one more is refused", tooManyPlayers(list(MAX_PARTICIPANTS_PER_ACCOUNT + 1)));
    check("thousands are refused", tooManyPlayers(list(5000)));
    check("a body that names no list names nobody", [tooManyPlayers(undefined), tooManyPlayers(null), tooManyPlayers("x"), tooManyPlayers({ length: 99 })], [false, false, false, false]);
    const household = JSON.stringify({ cohortId: "coh_1", contactEmail: "dana@example.com", participants: Array.from({ length: 12 }, () => ({ name: "A long player name here", dob: "2015-06-01", isMinor: true, participantId: "2f6b1c4e-9a3d-4e8f-b7c2-1d5e6f7a8b9c", relationship: "child" })) });
    check("a full household's request sits well under the body cap", bodyTooLarge(household, null), false);
    check("a body past the cap is refused, whatever it holds", bodyTooLarge(JSON.stringify({ participants: list(2000) }), null) && MAX_BODY_BYTES === 20 * 1024);
  }

  console.log("4. An e-transfer try counts once for each player");
  {
    check("a try weighs one by default; an e-transfer its players; never more than a household", [submissionWeight(undefined), submissionWeight(1), submissionWeight(3), submissionWeight(500), submissionWeight(0), submissionWeight(-2), submissionWeight(Number.NaN), submissionWeight(2.9)], [1, 1, 3, 12, 1, 1, 1, 2]);
    const { rows, store } = limitTable(() => now);
    const ticket = await attempt(store, "etransfer", "203.0.113.7", "dana@example.com", 3);
    check("three players: three hits under the address and three under the email", [ticket.allowed, rows.length, new Set(rows.map((r) => r.key_hash)).size], [true, 6, 2]);
    await ticket.release();
    check("a try the route then refuses gives every one of them back", rows.length, 0);
    const quiz = await attempt(store, "intake", "203.0.113.7", "dana@example.com", 3);
    check("any other form counts one, whatever it is handed", [quiz.allowed, rows.length], [true, 2]);
  }

  console.log("4. Scenario — families are not refused");
  {
    const two = limitTable(() => now);
    const tries = [await attempt(two.store, "etransfer", "198.51.100.1", "dana@example.com", 2), await attempt(two.store, "etransfer", "198.51.100.1", "dana@example.com", 2)];
    check("one e-transfer for two children, retried once: both go through", tries.map((t) => t.allowed), [true, true]);
    const big = limitTable(() => now);
    check("a household of twelve gets its e-transfer through on the first try", (await attempt(big.store, "etransfer", "198.51.100.2", "big@example.com", 12)).allowed);
    const evening = limitTable(() => now);
    const families = [];
    for (let i = 0; i < 20; i++) {
      tick(3 * 60 * 1000 - 1000);
      families.push((await attempt(evening.store, "etransfer", "192.0.2.50", `family${i}@example.com`, 1)).allowed);
    }
    check("twenty one-player families on the club's Wi-Fi inside an hour: all through", families.every(Boolean));
  }

  console.log("4. Scenario — a script cannot spend the day's emails through e-transfers");
  {
    // The worst a script on one address can do: one-player tries until one
    // short of the day's limit, then a full household on the last one.
    const { store } = limitTable(() => now);
    let emails = 0;
    let through = 0;
    for (let i = 0; i < 200; i++) {
      const players = i < LIMITS.mail.addressDay - 1 ? 1 : 12;
      const ticket = await attempt(store, "etransfer", "203.0.113.99", `fresh${i}@example.com`, players);
      if (!ticket.allowed) continue;
      through++;
      emails += 2 * players + 1; // the instructions and the coach's notice for each player, one account email
    }
    check("tries that got through", through, LIMITS.mail.addressDay);
    check("the emails they caused are the bound the module states", emails, maxDailyEmailsPerAddress());
    check("…82, under the day's 100", [maxDailyEmailsPerAddress(), maxDailyEmailsPerAddress() < 100], [82, true]);

    // Before the fix a try counted one whatever it carried: twenty tries of
    // twelve players each got through.
    const old = limitTable(() => now);
    let oldEmails = 0;
    for (let i = 0; i < 40; i++) {
      tick();
      const ticket = await takeTicket(old.store, { secret: SECRET, scope: "etransfer", address: "203.0.113.98", email: `fresh${i}@example.com`, now });
      if (ticket !== "missing" && ticket.allowed) oldEmails += 2 * 12 + 1;
    }
    check("for contrast, counted per request the same script sent five times the day's emails", oldEmails, 500);
  }

  console.log("4. Source — the three sign-up routes cap the body and the players; the comment says what is true");
  {
    for (const [file, list, work] of [
      ["src/app/api/enroll/route.ts", "tooManyPlayers(body.participants)", "values.append("],
      ["src/app/api/checkout/route.ts", "tooManyPlayers(enrollmentMeta?.participants)", "createCheckoutSession("],
      ["src/app/api/enroll/etransfer/route.ts", "tooManyPlayers(enrollmentMeta.participants)", "recordEtransferIntent("],
    ] as const) {
      const src = read(file);
      const sizeAt = src.indexOf('bodyTooLarge(raw, req.headers.get("content-length"))');
      const listAt = src.indexOf(list);
      check(`${file}: the body-size check, before the body is parsed`, sizeAt !== -1 && sizeAt < src.indexOf("JSON.parse(raw)") && !src.includes("await req.json()"));
      check(`${file}: the players cap, before the gate, the limits and any work`, listAt !== -1 && listAt < src.indexOf("resolveEnrollGate(") && listAt < src.indexOf("checkSubmissionLimit(") && listAt < src.indexOf(work));
      check(`${file}: both answer a plain 400`, (src.match(/\{ error: REQUEST_TOO_LARGE \}, \{ status: 400 \}/g) ?? []).length, 2);
    }
    const etransfer = read("src/app/api/enroll/etransfer/route.ts");
    check("the e-transfer try is weighed by its players", /checkSubmissionLimit\(\s*req,\s*"etransfer",\s*String\(enrollmentMeta\.contactEmail\),\s*sent\.length\s*\)/.test(etransfer));
    const db = read("src/lib/submissionLimitsDb.ts");
    check("the weight reaches the count", db.includes("weight = 1") && /takeTicket\(store, \{[\s\S]*?weight,\s*\}\)/.test(db));
    const limits = read("src/lib/submissionLimits.ts");
    const header = limits.slice(0, limits.indexOf("import "));
    check("the comment says an e-transfer counts once for each player", header.includes("an e-transfer\n// try counts once for each player on it"));
    check("…and states the bound the code computes", header.includes(`31 players, ${maxDailyEmailsPerAddress()} emails`) && header.includes("at most 12 players"));
    check("…and no longer claims three emails a submission", header.includes("at most 3 emails each: 60"), false);
  }
});

// ─── 5. An old booking never overwrites a newer level ────────────────────────

sections.push(function point5() {
  console.log("5. linkedLevelApplies — the booking's level against the one the coach left");
  {
    const assessedOn = "2026-10-03";
    check("a player with no level takes the booking's", linkedLevelApplies({ playerHasLevel: false, playerLevelSetAt: null, assessedOn }));
    check("a level set by hand weeks after the assessment stays", linkedLevelApplies({ playerHasLevel: true, playerLevelSetAt: "2026-11-10T16:00:00.000Z", assessedOn }), false);
    check("a level set the day after the assessment stays", linkedLevelApplies({ playerHasLevel: true, playerLevelSetAt: "2026-10-04T15:00:00.000Z", assessedOn }), false);
    check("a level from before the assessment gives way to its result", linkedLevelApplies({ playerHasLevel: true, playerLevelSetAt: "2026-09-20T15:00:00.000Z", assessedOn }));
    check("the day is Toronto's: 10:30 pm on the assessment day is not a later day, though it is one in UTC", linkedLevelApplies({ playerHasLevel: true, playerLevelSetAt: "2026-10-04T02:30:00.000Z", assessedOn }));
    check("…and just past midnight in Toronto is", linkedLevelApplies({ playerHasLevel: true, playerLevelSetAt: "2026-10-04T04:30:00.000Z", assessedOn }), false);
    check("a level with no date on it gives way, as before", linkedLevelApplies({ playerHasLevel: true, playerLevelSetAt: null, assessedOn }));
    check("an assessment day that cannot be read overwrites nothing that is dated", [linkedLevelApplies({ playerHasLevel: true, playerLevelSetAt: "2026-11-10T16:00:00.000Z", assessedOn: null }), linkedLevelApplies({ playerHasLevel: true, playerLevelSetAt: "2026-11-10T16:00:00.000Z", assessedOn: "soon" })], [false, false]);
  }

  console.log("5. Scenario — two bookings link at once, around a level the coach set by hand");
  {
    // Maya was assessed on Oct 3 (2.5) and again on Nov 20 (3.5); between the
    // two the coach set 3.0 by hand, on Nov 10. Both bookings link on Nov 23.
    const levelBefore = { hasLevel: true, setAt: "2026-11-10T16:00:00.000Z" };
    let level = 3.0;
    const linked = [
      { level_result: 2.5, assessedOn: "2026-10-03" },
      { level_result: 3.5, assessedOn: "2026-11-20" },
    ]; // oldest first, as the link walks them
    const written: number[] = [];
    for (const booking of linked) {
      if (linkedLevelApplies({ playerHasLevel: levelBefore.hasLevel, playerLevelSetAt: levelBefore.setAt, assessedOn: booking.assessedOn })) {
        level = booking.level_result;
        written.push(booking.level_result);
      }
    }
    check("the October result does not replace the coach's November level; the later assessment does", [written, level], [[3.5], 3.5]);
    // Weighed against the level as it stood before the link, the first write
    // (stamped now) cannot block the second.
    const fresh = { hasLevel: false, setAt: null as string | null };
    check("with no level before the link, both results are walked and the latest is kept", linked.filter((b) => linkedLevelApplies({ playerHasLevel: fresh.hasLevel, playerLevelSetAt: fresh.setAt, assessedOn: b.assessedOn })).map((b) => b.level_result), [2.5, 3.5]);
  }

  console.log("5. Source — the link asks before it writes a level");
  {
    const assessments = read("src/lib/assessments.ts");
    const link = assessments.slice(assessments.indexOf("export async function linkBookingsToAccount("));
    const body = link.slice(0, link.indexOf("\n}\n"));
    const snapshotAt = body.indexOf("const levelBefore = new Map(");
    const loopAt = body.indexOf("for (const booking of linked) {");
    check("the players' levels are read once, before the loop writes anything", snapshotAt !== -1 && snapshotAt < loopAt && body.indexOf("setPlayerLevel(") > loopAt);
    check("the assessment's day comes from its block", body.includes('.select("id, block_date")') && body.includes("assessedOn.set(block.id, block.block_date)"));
    check("the level is written only when linkedLevelApplies says so", /if \(levelApplies\) \{\s*await setPlayerLevel\(participantId, \{/.test(body) && body.includes("const levelApplies = linkedLevelApplies({"));
    check("the availability keeps its own newer-wins rule, outside that check", body.indexOf("await setKnownPlayerAvailability(participantId, {") > body.indexOf("} else {") && body.includes("onlyIfOlderThan: booking.created_at"));
  }
});

// ─── 6. A reversal releases only what its own payment settled ────────────────

sections.push(async function point6() {
  console.log("6. The invite's note names the payment that settled it");
  {
    const settled = cardPaidNote("cs_live_a1", "Maya Chen");
    check("a card payment's flip writes its session in front of the note", settled, "Paid by card (Stripe cs_live_a1) · Maya Chen");
    check("…and it is read back", [noteSettledBy(settled), noteSettledBy("Maya Chen"), noteSettledBy(null)], ["cs_live_a1", null, null]);
    check("paid again after a refund, the newest payment is the one named", noteSettledBy(cardPaidNote("cs_live_c3", reversalNote("refunded", settled))), "cs_live_c3");
    check("the same payment delivered again is its own", paidInviteHit(settled, "cs_live_a1"), "own");
    check("another payment on that invite is a second one", paidInviteHit(settled, "cs_live_b2"), "duplicate");
    check("…also on an invite paid by e-transfer, or settled before the notes carried a session", [paidInviteHit("E-transfer from Dana", "cs_live_b2"), paidInviteHit(null, "cs_live_b2")], ["duplicate", "duplicate"]);
    const flagged = duplicatePaymentNote("cs_live_b2", settled);
    check("the coach's line says what happened and what to do, with the Stripe session to look up", flagged, "Second card payment on this invite (Stripe cs_live_b2): refund it in Stripe if it was a mistake · Paid by card (Stripe cs_live_a1) · Maya Chen");
    check("once named, it is not named again", [noteNamesDuplicate(flagged, "cs_live_b2"), paidInviteHit(flagged, "cs_live_b2"), noteNamesDuplicate(flagged, "cs_live_a1")], [true, "flagged", false]);
    check("the first payment is still the one that settled it", [noteSettledBy(flagged), paidInviteHit(flagged, "cs_live_a1")], ["cs_live_a1", "own"]);
    check("a note never grows past the column's 500", cardPaidNote("cs_live_a1", "x".repeat(900)).length, 500);
  }

  console.log("6. reversalReleasesInvite — only what its own payment settled");
  {
    const settled = cardPaidNote("cs_live_a1", "Maya Chen");
    const flagged = duplicatePaymentNote("cs_live_b2", settled);
    check("the payment that settled the invite gives it back", reversalReleasesInvite(settled, "cs_live_a1", true));
    check("a second payment's refund does not: the first payment stands", reversalReleasesInvite(flagged, "cs_live_b2", true), false);
    check("…named or not", reversalReleasesInvite(settled, "cs_live_b2", true), false);
    check("the first payment's refund still gives it back, with the second one's line kept for the coach", [reversalReleasesInvite(flagged, "cs_live_a1", true), reversalNote("refunded", flagged).includes("Second card payment on this invite (Stripe cs_live_b2)")], [true, true]);
    check("a test-mode refund or dispute gives back nothing", [reversalReleasesInvite(settled, "cs_live_a1", false), reversalReleasesInvite("Maya Chen", "cs_test_x", false)], [false, false]);
    check("an invite settled before the notes carried a session is given back as before", reversalReleasesInvite("Maya Chen", "cs_live_old", true));
    check("once the second payment went back, its line says so", duplicateReversedNote("refunded", "cs_live_b2", flagged), "Second card payment refunded in Stripe (cs_live_b2) · Paid by card (Stripe cs_live_a1) · Maya Chen");
    check("…and a redelivered refund of it still releases nothing", reversalReleasesInvite(duplicateReversedNote("refunded", "cs_live_b2", flagged), "cs_live_b2", true), false);
    check("a dispute reads as one", duplicateReversedNote("disputed", "cs_live_b2", flagged).startsWith("Second card payment disputed in Stripe (cs_live_b2)"));
  }

  console.log("6. Scenario — two card payments through one invite, then the second is refunded");
  {
    const { w, deps, input } = settleWorld();
    // The first payment settles the invite.
    await settleEnrollmentPayment(deps(undefined, "cs_1"), input("paid"));
    check("the first payment settles the invite and is named on it", [w.invite, noteSettledBy(w.inviteNote), w.duplicateFlags], ["paid", "cs_1", 0]);
    // A second payment through the same invite: its own rows, the same invite.
    w.sheet.set(6, "pending");
    w.rows.set("enr_2", "pending");
    const second = input("paid", { sessionId: "cs_2", sheetRows: [6], enrollmentIds: ["enr_2"], creditBookingIds: [] });
    await settleEnrollmentPayment(deps(undefined, "cs_2"), second);
    check("the second payment tells the coach, in the invite's note", [w.duplicateFlags, noteNamesDuplicate(w.inviteNote, "cs_2"), w.inviteFlips], [1, true, 1]);
    await settleEnrollmentPayment(deps(undefined, "cs_2"), second);
    await settleEnrollmentPayment(deps(undefined, "cs_1"), input("paid"));
    check("redelivered, either payment adds nothing to the note", [w.duplicateFlags, w.accountEmails], [1, 2]);

    // The refunds, decided as releaseCardInvites decides them.
    const refund = (sessionId: string) => {
      if (w.invite !== "paid") return "nothing";
      if (noteNamesDuplicate(w.inviteNote, sessionId)) {
        w.inviteNote = duplicateReversedNote("refunded", sessionId, w.inviteNote);
        return "kept";
      }
      if (!reversalReleasesInvite(w.inviteNote, sessionId, true)) return "kept";
      const plan = planMarkUnpaid({ status: "paid", expires_at: "2099-01-01T00:00:00.000Z" }, new Date("2026-11-23T00:00:00.000Z"));
      if (!plan.ok) return "nothing";
      w.invite = plan.patch.status;
      w.inviteNote = reversalNote("refunded", w.inviteNote);
      return "released";
    };
    check("refunding the second payment leaves the invite paid", [refund("cs_2"), w.invite], ["kept", "paid"]);
    check("…and the coach reads that it went back", (w.inviteNote ?? "").startsWith("Second card payment refunded in Stripe (cs_2)"));
    check("a redelivered refund of it changes nothing", [refund("cs_2"), w.invite], ["kept", "paid"]);
    check("refunding the first payment gives the invite back", [refund("cs_1"), w.invite], ["released", "invited"]);
  }

  console.log("6. Scenario — the same payment, stopped after its invite flip, is not called a second one");
  {
    const { w, deps, input } = settleWorld();
    const flipStep = 6; // the invite flip, as the healthy run walked it
    await settleEnrollmentPayment(deps(flipStep, "cs_1"), input()).catch(() => {});
    check("the delivery stopped with the invite paid and the rows not yet claimed", [w.steps[w.steps.length - 1], w.invite, w.rows.get("enr_1")], ["settleInvite", "paid", "pending"]);
    await settleEnrollmentPayment(deps(undefined, "cs_1"), input());
    check("the retry claims and speaks, and tells the coach nothing about a second payment", [w.accountEmails, w.duplicateFlags, noteNamesDuplicate(w.inviteNote, "cs_1")], [1, 0, false]);
  }

  console.log("6. Source — the note is written with the flip, and the reversal asks before it releases");
  {
    const actions = read("src/lib/cohortActions.ts");
    check("the session goes into the note in the same guarded statement as the flip", actions.includes("? { status, payment_note: cardPaidNote(cardSessionId, target.payment_note) }") && /const flip = \(patch: Record<string, unknown>\) =>\s*supabase\s*\.from\("cohort_invites"\)\s*\.update\(patch\)\s*\.eq\("id", target\.id\)\s*\.in\("status", PAYABLE_STATUSES\)/.test(actions));
    check("an already-paid invite is reported as a second payment only when it is not this payment's own", (actions.match(/paidInviteHit\((target|paid)\.payment_note, cardSessionId\) === "duplicate"/g) ?? []).length, 2);
    check("…and never one found by the email alone", actions.includes("paid &&\n      participantId &&\n      cardSessionId &&"));
    const flag = actions.slice(actions.indexOf("export async function flagDuplicatePayment("));
    const flagBody = flag.slice(0, flag.indexOf("\n}\n"));
    check("the coach's note is written once, on an invite still paid", flagBody.includes('.eq("status", "paid")') && flagBody.includes("noteSettledBy(note) === sessionId || noteNamesDuplicate(note, sessionId)") && flagBody.includes("duplicatePaymentNote(sessionId, note)"));
    check("…and sends no email of its own", /send[A-Z]\w*\(/.test(flagBody), false);
    const hook = read("src/app/api/webhooks/stripe/route.ts");
    check("the webhook names its session on the invite, and flags a second payment", hook.includes("cardSessionId: session.id,") && hook.includes("await flagDuplicatePayment(cohortId, duplicateInviteId, session.id);"));
    const settle = read("src/lib/paymentSettlement.ts");
    check("the flag is written by the delivery that made the claim", settle.indexOf("if (speaks) {") < settle.indexOf("await deps.flagDuplicate(inviteId)") && settle.indexOf("await deps.flagDuplicate(inviteId)") < settle.indexOf("} else {\n    deps.log("));
    const reversal = read("src/lib/paymentReversal.ts");
    const release = reversal.slice(reversal.indexOf("async function releaseCardInvites("));
    const releaseBody = release.slice(0, release.indexOf("\n}\n"));
    check("a test-mode reversal releases no invite", releaseBody.includes("if (!cohortId || !supabaseConfigured() || !payment.livemode) return 0;"));
    check("an invite is released only when reversalReleasesInvite says it is this payment's", releaseBody.indexOf("if (!reversalReleasesInvite(invite.payment_note, payment.sessionId, payment.livemode)) continue;") !== -1 && releaseBody.indexOf("reversalReleasesInvite(") < releaseBody.indexOf("planMarkUnpaid("));
    check("a second payment's refund rewrites its line and leaves the status alone", /if \(noteNamesDuplicate\(invite\.payment_note, payment\.sessionId\)\) \{[\s\S]*?\.update\(\{ payment_note: duplicateReversedNote\(kind, payment\.sessionId, invite\.payment_note\) \}\)[\s\S]*?continue;/.test(releaseBody));
    check("the reversal is told which payment and which mode", reversal.includes("{ sessionId, livemode }"));
    const admin = read("src/app/admin/cohorts/[id]/AdminCohortDetailClient.tsx");
    check("the cohort page shows the invite's note, where these lines land", admin.includes("{invite.payment_note}"));
  }
});

// ─── 7. Mock checkout never overwrites a row that is not its own ─────────────

sections.push(function point7() {
  console.log("7. The mock path's flip, on the rows a mock checkout could be handed");
  {
    const sheet = sheetOf([
      ["coh_1", "rui@example.org", "paid"], // 2: a paid seat
      ["coh_1", "dana@example.com", "pending_etransfer"], // 3: waiting on an e-transfer
      ["coh_1", "sam@example.net", "pending"], // 4: this checkout's own
      ["coh_1", "sam@example.net", "paid"], // 5: the same family's seat, already paid
    ]);
    const mock = (rowNumbers: number[]) => {
      const plan = paymentRowsToMove(sheet, { rowNumbers, cohortId: "coh_1", email: "sam@example.net", from: settleFrom("test") });
      sheet.apply(plan.rows, "test_paid");
      return plan.rows;
    };
    check("its own pending row becomes a test row", [mock([4]), sheet.status(4)], [[4], "test_paid"]);
    check("a paid row of the cohort is left paid: the old write turned it into a test row", [mock([2]), sheet.status(2)], [[], "paid"]);
    check("…its own paid row too", [mock([5]), sheet.status(5)], [[], "paid"]);
    check("a row waiting on an e-transfer is left waiting", [mock([3]), sheet.status(3)], [[], "pending_etransfer"]);
    check("the seat count never moved", seatsFromSnapshot(sheet, "coh_1", 8), 6);
  }

  console.log("7. Source — the mock tail writes through flipPaymentRows");
  {
    const checkout = read("src/app/api/checkout/route.ts");
    const mockAt = checkout.indexOf('if (rail === "mock") {');
    const mockTail = checkout.slice(mockAt, checkout.indexOf("const res = NextResponse.json({ sessionUrl })"));
    check("the tail moves its rows through the guarded flip", /await flipPaymentRows\(\{\s*rowNumbers: rowNumbers\.length > 0 \? rowNumbers : \[enrollmentRowNumber\],\s*cohortId,\s*email: typedEmail,\s*from: settleFrom\("test"\),\s*to: "test_paid",\s*\}\);/.test(mockTail));
    check("the write by row number alone is gone, with its Sheets client", /markEnrollmentStatus|values\.update\(|googleapis/.test(checkout), false);
  }
});

// ─── 8. A test payment enrolls nobody ────────────────────────────────────────

sections.push(function point8() {
  console.log("8. enrollmentRowBlocks — what a row in a player's name means on the sign-up page");
  {
    check("a paid row: already enrolled", [enrollmentRowBlocks("paid"), alreadyInCohortReason("enrolled")], ["enrolled", "Already enrolled in this group"]);
    check("an e-transfer on its way: a spot held", enrollmentRowBlocks("pending_etransfer"), "pending");
    check("a test payment enrolls nobody: the player can still be chosen", enrollmentRowBlocks("test_paid"), null);
    check("a refunded, disputed or unfinished row blocks nobody either", ["refunded", "disputed", "pending", "", null, undefined].map((s) => enrollmentRowBlocks(s)), [null, null, null, null, null, null]);
  }

  console.log("8. Source — the sign-up page asks it for every row");
  {
    const page = read("src/app/enroll/[cohortId]/page.tsx");
    check("the page reads each enrollment row through enrollmentRowBlocks", page.includes("const kind = enrollmentRowBlocks(row.status);") && page.includes("if (kind) out.set(player.id, alreadyInCohortReason(kind));"));
    check("…and no longer treats a test payment as a seat", page.includes('"test_paid"'), false);
  }
});

// ─── 9. A tripped bot check on a sign-up route is said, not hidden ───────────

sections.push(function point9() {
  console.log("9. The refusal a wrongly flagged person reads");
  {
    check("a person can trip the check: a password manager fills the hidden field", checkBot({ tb_hp_x: "Dana", fillTime: 45000 }), { bot: true, reason: "honeypot" });
    check("…or the page reports no fill time", checkBot({ cohortId: "coh_1" }), { bot: true, reason: "no_fill_time" });
    check("the line says it did not go through, the way on, and the inbox", BOT_REFUSAL_ERROR.includes("didn't go through") && BOT_REFUSAL_ERROR.includes("Reload the page and try again") && BOT_REFUSAL_ERROR.includes("info@tennisbootcamp.ca"));
    check("it blames nobody and names no robot, no exclamation mark", /!|bot\b|robot|spam|suspicious|you (did|must|failed)/i.test(BOT_REFUSAL_ERROR), false);
    check("the wizard adds nothing to it: it already names the inbox", withHumanFallback(BOT_REFUSAL_ERROR), BOT_REFUSAL_ERROR);
  }

  console.log("9. Source — the three sign-up routes refuse; the page shows the line and goes nowhere");
  {
    for (const file of ["src/app/api/enroll/route.ts", "src/app/api/checkout/route.ts", "src/app/api/enroll/etransfer/route.ts"]) {
      const src = read(file);
      const at = src.indexOf("if (verdict.bot) {");
      const block = src.slice(at, src.indexOf("\n    }\n", at));
      check(`${file}: a tripped check answers the refusal with a 400`, at !== -1 && block.includes("return NextResponse.json({ error: BOT_REFUSAL_ERROR }, { status: 400 });"));
      check(`${file}: …and nothing success-shaped`, /ok: true|sessionUrl|alreadyPaid|rowNumber/.test(block), false);
      check(`${file}: …before anything is read, written or sent`, at < src.indexOf("resolveEnrollGate(") && at < src.indexOf("checkSubmissionLimit("));
    }
    const wizard = read("src/app/enroll/[cohortId]/EnrollWizard.tsx");
    check("the wizard reads a 400's own line", wizard.includes("if (res.status !== 400 && res.status !== 403") && wizard.includes("if (body?.error) throw new Error(`refused:${body.error}`);"));
    const send = wizard.slice(wizard.indexOf("async function sendEtransfer()"));
    const sendBody = send.slice(0, send.indexOf("\n  }\n"));
    check("a refused e-transfer never reaches the 'spot held' page", sendBody.indexOf("await throwIfRefused(res);") !== -1 && sendBody.indexOf("await throwIfRefused(res);") < sendBody.indexOf("window.location.href = `/enroll/${cohort.id}/confirmed"));
    const save = wizard.slice(wizard.indexOf("async function saveEnrollment()"));
    const saveBody = save.slice(0, save.indexOf("\n  }\n"));
    check("a refused enrollment is not remembered as saved", saveBody.indexOf("await throwIfRefused(enrollRes);") < saveBody.indexOf("setSaved(result);"));
    // The four forms that only collect a lead keep their silent drop.
    const intake = read("src/app/api/intake/route.ts");
    check("the quiz still drops silently", intake.includes('if (decision.action === "drop") {') && !intake.includes("BOT_REFUSAL_ERROR"));
  }
});

// ─── Run ──────────────────────────────────────────────────────────────────────

async function main() {
  for (const section of sections) await section();
  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll safety-round checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
