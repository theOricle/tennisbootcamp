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
  reverseFrom,
  settleFrom,
} from "../lib/stripeOutcome";
import { seatsFromSnapshot } from "../lib/seatCount";
import {
  ASSESSMENT_CREDIT_CENTS,
  accountCredits,
  carriesCredit,
  creditReach,
  decideCredits,
  type CreditBooking,
} from "../lib/creditRules";
import { linkedBookingPlayer } from "../lib/guestAccount";
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
    check("the webhook settles through the guarded flip, with the session's cohort and email", /flipPaymentRows\(\{\s*rowNumbers: paidRows,\s*cohortId,\s*email: contactEmail,\s*from,\s*to: rowStatus,\s*\}\)/.test(hook));
    check("…out of the statuses its outcome allows", hook.includes("const from = settleFrom(outcome);") && hook.includes("setEnrollmentStatusByIds(paidEnrollmentIds, from, rowStatus)"));
    check("…and writes the credit only onto a row of its own", hook.includes("sheetMoved.own.includes(target)"));
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
