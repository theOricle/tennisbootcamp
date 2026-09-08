// Run from project root: npx tsx src/scripts/test-etransfer.ts
// Exercises the pure payment-transition logic behind the admin mark_paid /
// mark_unpaid actions and the e-transfer instructions (src/lib/paymentTransitions.ts).
// Exits non-zero on any failure.

import {
  planMarkPaid,
  planMarkUnpaid,
  amountDueCents,
  etransferMemo,
  etransferRecipient,
  PAYABLE_STATUSES,
} from "../lib/paymentTransitions";

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

const NOW = new Date("2026-09-30T15:00:00.000Z");
const LIVE = "2026-10-02T15:00:00.000Z"; // hold still running at NOW
const LAPSED = "2026-09-28T15:00:00.000Z"; // hold lapsed before NOW

// ─── mark_paid ────────────────────────────────────────────────────────────────

console.log("planMarkPaid");

check(
  "invited → paid records e-transfer method, trimmed note, paid_at",
  planMarkPaid(
    { status: "invited" },
    { method: "etransfer", note: "  e-transfer received 2026-09-30, ref C1A2B3  ", now: NOW }
  ),
  {
    ok: true,
    patch: {
      status: "paid",
      payment_method: "etransfer",
      payment_note: "e-transfer received 2026-09-30, ref C1A2B3",
      paid_at: "2026-09-30T15:00:00.000Z",
    },
  }
);

check(
  "expired → paid is allowed (money after the hold lapsed still buys the spot)",
  planMarkPaid({ status: "expired" }, { method: "etransfer", now: NOW }).ok,
  true
);

check(
  "empty note is stored as null",
  (() => {
    const p = planMarkPaid({ status: "invited" }, { method: "etransfer", note: "   ", now: NOW });
    return p.ok ? p.patch.payment_note : "not ok";
  })(),
  null
);

check(
  "card payments record method 'card' with no note",
  (() => {
    const p = planMarkPaid({ status: "invited" }, { method: "card", now: NOW });
    return p.ok ? [p.patch.payment_method, p.patch.payment_note] : "not ok";
  })(),
  ["card", null]
);

check(
  "paid → paid is refused (idempotent double-tap)",
  planMarkPaid({ status: "paid" }, { method: "etransfer", now: NOW }).ok,
  false
);

check(
  "declined → paid is refused",
  planMarkPaid({ status: "declined" }, { method: "etransfer", now: NOW }).ok,
  false
);

check(
  "a note longer than 500 chars is truncated",
  (() => {
    const p = planMarkPaid(
      { status: "invited" },
      { method: "etransfer", note: "x".repeat(600), now: NOW }
    );
    return p.ok ? p.patch.payment_note?.length : "not ok";
  })(),
  500
);

check("PAYABLE_STATUSES guards the database update", PAYABLE_STATUSES, ["invited", "expired"]);

// ─── mark_unpaid ──────────────────────────────────────────────────────────────

console.log("planMarkUnpaid");

check(
  "paid → invited while the hold is live; paid_at and note cleared",
  planMarkUnpaid({ status: "paid", expires_at: LIVE }, NOW),
  { ok: true, patch: { status: "invited", paid_at: null, payment_note: null } }
);

check(
  "paid → expired once the hold has lapsed",
  planMarkUnpaid({ status: "paid", expires_at: LAPSED }, NOW),
  { ok: true, patch: { status: "expired", paid_at: null, payment_note: null } }
);

check(
  "unpaid on a non-paid invite is refused",
  planMarkUnpaid({ status: "invited", expires_at: LIVE }, NOW).ok,
  false
);

check(
  "round trip: invited → paid → unpaid lands back on invited",
  (() => {
    const paid = planMarkPaid({ status: "invited" }, { method: "etransfer", now: NOW });
    if (!paid.ok) return "mark_paid failed";
    const undone = planMarkUnpaid({ status: paid.patch.status, expires_at: LIVE }, NOW);
    return undone.ok ? undone.patch.status : "mark_unpaid failed";
  })(),
  "invited"
);

// ─── e-transfer instructions ──────────────────────────────────────────────────

console.log("amountDueCents / etransferMemo / etransferRecipient");

check("$649 with the $20 assessment credit → $629", amountDueCents(64900, 2000), 62900);
check("no credit → full price", amountDueCents(64900, 0), 64900);
check("credit never exceeds the price", amountDueCents(1500, 2000), 0);
check("negative credit is ignored", amountDueCents(64900, -500), 64900);

check(
  "memo is player name + cohort label",
  etransferMemo("  Maya   Chen ", "Tue/Thu Evening — Level 3.0"),
  "Maya Chen – Tue/Thu Evening — Level 3.0"
);
check("memo falls back to the label without a name", etransferMemo("", "Fall Session"), "Fall Session");

check("ETRANSFER_EMAIL wins when set", etransferRecipient(" pay@tennisbootcamp.ca "), "pay@tennisbootcamp.ca");
check("blank ETRANSFER_EMAIL falls back to info@", etransferRecipient("   "), "info@tennisbootcamp.ca");
check("unset ETRANSFER_EMAIL falls back to info@", etransferRecipient(undefined), "info@tennisbootcamp.ca");

// ─────────────────────────────────────────────────────────────────────────────

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll e-transfer checks passed.");
