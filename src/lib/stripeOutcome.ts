// What a Stripe event means for our records (backlog #84, audit follow-up,
// owner 2026-11-14). Pure: the webhook (src/app/api/webhooks/stripe/route.ts)
// does the writes, these rules decide them, and src/scripts/test-paid-only.ts
// pins every one without Stripe or a database.

/**
 * The money behind a completed Checkout session:
 *   paid    Stripe reports the payment paid, with live keys.
 *   test    Stripe reports it paid, with test keys (livemode false): the
 *           joining path can be tried with a test card while the site runs in
 *           test mode, and nothing it records counts as money.
 *   unpaid  anything else. Checkout is card only, so no payment arrives
 *           after the session completes; a $0 session ("no_payment_required")
 *           is no money either.
 */
export type PaymentOutcome = "paid" | "test" | "unpaid";

export function paymentOutcome(input: {
  livemode: boolean | null | undefined;
  paymentStatus: string | null | undefined;
}): PaymentOutcome {
  if (input.paymentStatus !== "paid") return "unpaid";
  // Only an explicit `true` is live: a missing flag is never taken for money.
  return input.livemode === true ? "paid" : "test";
}

/** What a completed enrollment session may touch, by outcome. */
export type SettlementPlan = {
  /** The status the session's enrollment rows (Sheet and Supabase) take; null leaves them. */
  rowStatus: "paid" | "test_paid" | null;
  /** Mark the $20 assessment credits the session used as applied. */
  applyCredits: boolean;
  /**
   * Flip the session's invites to paid and run the minimum-to-run check — the
   * only path to a cohort's confirmation and its "confirmed" email.
   */
  settleInvites: boolean;
  /** Send the account email (the set-up email, or "You're enrolled"). */
  notifyAccount: boolean;
};

/**
 * A live payment counts as it always has. A test payment records test rows
 * (the seat count only ever counts "paid") and nothing else that counts: no
 * credit spent, no invite paid, so no minimum met and no "confirmed" email.
 * The account email still goes, so the test-card run sees the whole joining
 * path. An unpaid session touches nothing.
 */
export function settlementPlan(outcome: PaymentOutcome): SettlementPlan {
  switch (outcome) {
    case "paid":
      return { rowStatus: "paid", applyCredits: true, settleInvites: true, notifyAccount: true };
    case "test":
      return { rowStatus: "test_paid", applyCredits: false, settleInvites: false, notifyAccount: true };
    default:
      return { rowStatus: null, applyCredits: false, settleInvites: false, notifyAccount: false };
  }
}

/**
 * What an assessment booking's payment becomes: paid on live money; booked
 * but unpaid on a test payment (it never earns the $20 credit, which needs a
 * paid assessment), marked "test" in the assessments tab; null for a session
 * that completed unpaid — the hold is not confirmed.
 */
export function bookingPaid(outcome: PaymentOutcome): true | "test" | null {
  if (outcome === "paid") return true;
  if (outcome === "test") return "test";
  return null;
}
