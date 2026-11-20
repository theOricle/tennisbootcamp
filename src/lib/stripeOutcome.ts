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
 * (the seat count only ever counts "paid") and nothing else: no credit spent,
 * no invite paid, so no minimum met and no "confirmed" email, and no account
 * email either (review fix 7). An unpaid session touches nothing.
 */
export function settlementPlan(outcome: PaymentOutcome): SettlementPlan {
  switch (outcome) {
    case "paid":
      return { rowStatus: "paid", applyCredits: true, settleInvites: true, notifyAccount: true };
    case "test":
      return { rowStatus: "test_paid", applyCredits: false, settleInvites: false, notifyAccount: false };
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

// ─── Refunds, disputes, redelivery (part 3) ───────────────────────────────────

/** How a reversed payment reads on our records and in admin. */
export type ReversalKind = "refunded" | "disputed";

/**
 * A charge.refunded event reverses a payment only when the refund is full —
 * Stripe's `refunded` flag, or the refunded amount reaching the charge. A
 * partial refund changes nothing: the seat (or the booking) stays paid.
 */
export function refundReversal(charge: {
  amount?: number | null;
  amount_refunded?: number | null;
  refunded?: boolean | null;
}): ReversalKind | null {
  if (charge.refunded === true) return "refunded";
  const amount = charge.amount ?? 0;
  const refunded = charge.amount_refunded ?? 0;
  return amount > 0 && refunded >= amount ? "refunded" : null;
}

/**
 * The enrollment statuses a completed payment moves a row out of. Never a
 * refunded or disputed row: a late or redelivered event cannot bring a
 * reversed seat back, and a row already paid is not paid twice.
 */
export const SETTLE_FROM = ["pending", "pending_etransfer"] as const;

/**
 * The enrollment statuses a reversal moves one of this session's rows out
 * of: paid, a test payment, or still pending (a refund that outran its own
 * completed event — that event then finds nothing to settle). A row already
 * refunded or disputed is left as it is, so a redelivery changes nothing.
 */
export const REVERSE_FROM = ["pending", "paid", "test_paid"] as const;

/**
 * Whether this delivery of a completed payment is the one that settles it —
 * the only one that spends credits, settles invites and sends the account
 * email. When the session carries Supabase enrollment rows, their move
 * decides: it is one guarded update, so of two deliveries at the same moment
 * exactly one moves them (the Sheet's read-then-write flip cannot tell them
 * apart). With no Supabase rows, the Sheet's flip decides; with nothing to
 * check at all (local development), the delivery counts as the first.
 */
export function isFirstDelivery(input: {
  /** How many Supabase enrollment rows the session carries. */
  dbRows: number;
  /** How many of them this delivery moved. */
  dbMoved: number;
  /** How many Sheet rows the session carries. */
  sheetRows: number;
  /** How many of them this delivery moved; null when Sheets is not configured. */
  sheetMoved: number | null;
}): boolean {
  if (input.dbRows > 0) return input.dbMoved > 0;
  if (input.sheetMoved !== null && input.sheetRows > 0) return input.sheetMoved > 0;
  return true;
}

/** The row numbers whose status (as read) is in `from`; rows not read are left alone. */
export function rowsInStatus(
  statusByRow: ReadonlyMap<number, string>,
  from: readonly string[]
): number[] {
  const out: number[] = [];
  for (const [row, status] of statusByRow) {
    if (from.includes(status)) out.push(row);
  }
  return out.sort((a, b) => a - b);
}

// ─── Assessment bookings ──────────────────────────────────────────────────────

/**
 * The statuses a booking takes for its payment's states (migration 0012
 * widens the table's check to allow them): a test-mode payment, a full
 * refund, a dispute. None holds a slot, and the admin list names each.
 */
export const BOOKING_PAYMENT_STATUSES = ["test", "refunded", "disputed"] as const;
export type BookingPaymentStatus = (typeof BOOKING_PAYMENT_STATUSES)[number];

/** The statuses that hold a slot: the database's one-active-hold index. */
export const SLOT_HOLDING_STATUSES = ["pending", "booked"] as const;

/**
 * What a payment does to an assessment booking (part 2's rule, review fix
 * 2): live money books it, paid; a free ($0) assessment books it, unpaid;
 * a test-mode payment (Stripe test keys, or mock mode) makes it a test
 * booking, which holds no slot and sends nothing — no confirmation, no
 * account email — and earns no $20 credit.
 */
export function bookingPaymentPlan(paid: boolean | "test"): {
  status: "booked" | "test";
  paid: boolean;
  holdsSlot: boolean;
  sendEmails: boolean;
} {
  if (paid === "test") return { status: "test", paid: false, holdsSlot: false, sendEmails: false };
  return { status: "booked", paid: paid === true, holdsSlot: true, sendEmails: true };
}

/**
 * What a booking's status becomes while migration 0012 has not run: the
 * table's check still refuses the three payment states, and "cancelled" —
 * which also holds no slot — stands in. Null for any other status.
 */
export function bookingStatusFallback(status: string): "cancelled" | null {
  return (BOOKING_PAYMENT_STATUSES as readonly string[]).includes(status) ? "cancelled" : null;
}

/** A write the table's check constraint refused (Postgres 23514). */
export function isCheckViolation(error: { code?: string | null } | null | undefined): boolean {
  return error?.code === "23514";
}

/**
 * What an assessment booking becomes once its payment is reversed: a hold or
 * a booking still ahead — or one that kept the money with no slot — reads
 * refunded or disputed, which frees any slot it held (only pending and booked
 * rows hold one); a completed assessment keeps its result and loses `paid`.
 * Every reversed booking loses `paid`, so no $20 credit stands on money that
 * went back. Null when there is nothing left to undo: already reversed (a
 * redelivery), or a test booking, which held no slot and no money.
 */
export function bookingReversalPatch(
  booking: { status: string; paid: boolean },
  kind: ReversalKind
): { status?: ReversalKind; paid: false } | null {
  if (booking.status === "pending" || booking.status === "booked") {
    return { status: kind, paid: false };
  }
  if (booking.status === "cancelled" && booking.paid) return { status: kind, paid: false };
  if (booking.status === "completed" && booking.paid) return { paid: false };
  return null;
}

/**
 * A paid assessment session landing on a booking that is no longer pending:
 *   restore  the hold was swept to expired before the money arrived: book it
 *            again if the slot is still free, else mark it cancelled with the
 *            money kept and log it plainly for the coach;
 *   nothing  already booked (a redelivery), completed, or cancelled (logged
 *            already, or the coach's own call);
 *   missing  no such booking: logged plainly, never dropped silently.
 */
export function latePaymentPlan(status: string | null): "restore" | "nothing" | "missing" {
  if (status === null) return "missing";
  return status === "expired" ? "restore" : "nothing";
}

/**
 * The line a released card invite carries in admin (its payment note): the
 * fact first, then whatever note it already had (the player's name, the
 * coach's words), so nothing is lost. Capped like every payment note.
 */
export function reversalNote(kind: ReversalKind, existing: string | null | undefined): string {
  const line = kind === "refunded" ? "Card payment refunded in Stripe" : "Card payment disputed in Stripe";
  const rest = (existing ?? "").trim();
  return (rest ? `${line} · ${rest}` : line).slice(0, 500);
}
