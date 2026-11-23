// Run from project root: npx tsx src/scripts/test-safety-round.ts
//
// Pins the fix round that followed the safety review of backlog #84: one
// block per point, each written before its fix and failing without it.
//
//   1. A row number the browser sent is moved only when it is the payer's
//      own: at checkout (cohort, contact email, still pending) and again when
//      a payment event moves it; a test-mode event never moves a paid row; a
//      reversal finds its row by the payment's cohort and email.
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
