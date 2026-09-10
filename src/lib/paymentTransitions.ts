// Pure payment-state logic for cohort invites (backlog #12: e-transfer rail).
// No imports, no I/O — the Supabase writes live in src/lib/cohortActions.ts
// and call these planners so the transition table is testable without a
// database (src/scripts/test-etransfer.ts).

export type PaymentMethod = "card" | "etransfer";
export type CohortPaymentMode = PaymentMethod;
export type InviteStatus = "invited" | "paid" | "declined" | "expired";

export const DEFAULT_ETRANSFER_EMAIL = "info@tennisbootcamp.ca";

/** Statuses an invite can be marked paid from. `expired` is included on
 *  purpose: money that arrives after the hold lapsed still buys the spot. */
export const PAYABLE_STATUSES: InviteStatus[] = ["invited", "expired"];

/** Recipient for e-transfers: ETRANSFER_EMAIL, else the business inbox. */
export function etransferRecipient(
  envValue: string | undefined = process.env.ETRANSFER_EMAIL
): string {
  const v = (envValue ?? "").trim();
  return v || DEFAULT_ETRANSFER_EMAIL;
}

/** Price after the assessment credit; the credit never exceeds the price. */
export function amountDueCents(priceCents: number, creditCents: number): number {
  const price = Math.max(0, Math.round(priceCents));
  const credit = Math.max(0, Math.min(Math.round(creditCents), price));
  return price - credit;
}

/** The message a player puts on the transfer so the coach can match it. */
export function etransferMemo(playerName: string, cohortLabel: string): string {
  const name = playerName.trim().replace(/\s+/g, " ");
  const label = cohortLabel.trim();
  if (!name) return label;
  if (!label) return name;
  return `${name} – ${label}`;
}

export type InviteLike = {
  status: InviteStatus;
  expires_at: string; // ISO
  payment_method?: PaymentMethod | null;
};

export type PaidPatch = {
  status: "paid";
  payment_method: PaymentMethod;
  payment_note: string | null;
  paid_at: string;
};

export type MarkPaidPlan =
  | { ok: true; patch: PaidPatch }
  | { ok: false; error: string };

/**
 * Decide whether an invite can be marked paid and what to write if so.
 * `invited` and `expired` move to `paid`; `paid` and `declined` are refused.
 */
export function planMarkPaid(
  invite: Pick<InviteLike, "status">,
  opts: { method: PaymentMethod; note?: string | null; now: Date }
): MarkPaidPlan {
  if (invite.status === "paid") {
    return { ok: false, error: "That invite is already marked paid." };
  }
  if (invite.status === "declined") {
    return { ok: false, error: "That invite was declined — send a fresh invite instead." };
  }
  const note = (opts.note ?? "").trim();
  return {
    ok: true,
    patch: {
      status: "paid",
      payment_method: opts.method,
      payment_note: note ? note.slice(0, 500) : null,
      paid_at: opts.now.toISOString(),
    },
  };
}

export type UnpaidPatch = {
  status: "invited" | "expired";
  paid_at: null;
  payment_note: null;
};

export type MarkUnpaidPlan =
  | { ok: true; patch: UnpaidPatch }
  | { ok: false; error: string };

/**
 * Reverse a paid mark without deleting the invite. The row returns to
 * `invited` while its hold is still live, `expired` once the hold has lapsed
 * (matching what the lazy expiry sweep would do on the next read). The
 * player's chosen rail (payment_method) is kept as history; the paid
 * timestamp and note are cleared.
 */
export function planMarkUnpaid(
  invite: Pick<InviteLike, "status" | "expires_at">,
  now: Date
): MarkUnpaidPlan {
  if (invite.status !== "paid") {
    return { ok: false, error: "That invite isn't marked paid." };
  }
  const lapsed = invite.expires_at < now.toISOString();
  return {
    ok: true,
    patch: { status: lapsed ? "expired" : "invited", paid_at: null, payment_note: null },
  };
}

// ─── Mark-paid receipt (backlog #15) ──────────────────────────────────────────

/** Cohort lifecycle statuses that a payment can confirm out of. */
export const CONFIRMABLE_STATUSES = ["draft", "inviting"];

export type ReceiptDecision =
  | { send: true }
  | { send: false; reason: "no-transition" | "confirmed-instead" };

/**
 * Whether the admin mark-paid should email the player a receipt.
 *
 * Two cases stay silent:
 *  - `no-transition` — the invite was not moved from invited/expired to paid
 *    (an admin double-tap, or a row that changed underneath us).
 *  - `confirmed-instead` — the cohort left draft/inviting for `confirmed`
 *    during this mark, so maybeConfirmCohort already emailed every paid
 *    member (this one included) the schedule. One email per member, not two.
 *
 * A payment into an already-confirmed cohort still gets a receipt: that
 * confirmation flip is one-way and its emails went out long before.
 */
export function planPaymentReceipt(params: {
  /** The invite's status as read before the mark. */
  statusBefore: InviteStatus;
  /** Whether the guarded flip to `paid` actually landed. */
  flipped: boolean;
  /** Cohort status read before the mark, and after it. */
  cohortStatusBefore: string | null;
  cohortStatusAfter: string | null;
}): ReceiptDecision {
  const { statusBefore, flipped, cohortStatusBefore, cohortStatusAfter } = params;
  if (!flipped || !PAYABLE_STATUSES.includes(statusBefore)) {
    return { send: false, reason: "no-transition" };
  }
  const confirmedNow =
    cohortStatusBefore !== null &&
    CONFIRMABLE_STATUSES.includes(cohortStatusBefore) &&
    cohortStatusAfter === "confirmed";
  if (confirmedNow) return { send: false, reason: "confirmed-instead" };
  return { send: true };
}
