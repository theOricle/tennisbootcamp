// What one delivery of a completed enrollment payment does, in order
// (backlog #84, safety review). The Stripe webhook hands it the session and
// the writes; src/scripts/test-safety-round.ts stops it after every step and
// delivers again.
//
// Before, the enrollment rows moved first and that move decided "first
// delivery": a function that stopped right after it left the credit unused,
// the invite unpaid and the cohort unconfirmed for good, because the retry
// found the rows paid and answered "already settled".
//
// Now every delivery walks the same steps, and each is safe to walk again:
//
//   1. The Sheet rows                guarded on cohort, email and status
//   2. The $20 credits               guarded on unused
//   3. The invites                   guarded on invited or expired
//   4. The enrollment rows (claim)   one guarded statement
//   5. The one-time emails           only the delivery whose claim moved rows
//   6. The cohort's confirmation     guarded on draft or inviting
//
// Step 4 is also the record that the emails went: of two deliveries at the
// same moment exactly one moves the rows, and only that one sends the account
// email, tells the coach about a payment that matched no invite and notes a
// second payment on an invite that was already paid. A retry
// after the claim repeats steps 1–3 and 6, which change nothing twice, and
// sends nothing. So a stop anywhere before the claim is finished by the
// retry, email included; a stop between the claim and the send loses that
// email and never sends it twice.
//
// A payment whose rows were refunded or disputed before its own event
// arrived is left alone: nothing here brings a reversed seat back or spends
// a credit on it.
//
// Pure orchestration: no Stripe, Supabase, Sheets or email import.

import { inviteSettlement, settledByInvite, unmatchedSignal } from "@/lib/enrollGate";
import {
  isFirstDelivery,
  settleFrom,
  settlementPlan,
  type PaymentOutcome,
} from "@/lib/stripeOutcome";

export type SettlementInput = {
  sessionId: string;
  outcome: Exclude<PaymentOutcome, "unpaid">;
  cohortId: string;
  /** The contact email the checkout carried. */
  contactEmail: string;
  /** The Sheet rows the session remembers, one per player. */
  sheetRows: readonly number[];
  /** Every player's Supabase enrollment row. */
  enrollmentIds: readonly string[];
  /** The assessment bookings whose $20 this payment used. */
  creditBookingIds: readonly string[];
  /** What each of them took off, in cents. */
  perCreditCents: number;
  inviteId?: string;
  legacyInviteToken?: string;
  participantIds: readonly string[];
};

/** How one player's invite is looked up (inviteSettlement's answer). */
export type InviteLookupBy = {
  inviteId?: string;
  inviteToken?: string;
  participantId?: string;
  email?: string;
};

export type SettlementDeps = {
  /** The session's enrollment rows' statuses as they read now; throws on a failed read. */
  readEnrollmentStatuses(ids: readonly string[]): Promise<string[]>;
  /** The guarded Sheet flip; null when Sheets is not configured. */
  flipSheetRows(params: {
    rowNumbers: readonly number[];
    cohortId: string;
    email: string;
    from: readonly string[];
    to: string;
  }): Promise<{ moved: number[]; own: number[]; unresolved: number[] } | null>;
  /** Mark one booking's $20 used; guarded on unused. */
  applyCredit(bookingId: string): Promise<void>;
  /** Write the credit beside a Sheet row. */
  recordSheetCredit(rowNumber: number, amount: string): Promise<void>;
  /** The cohort runs on invites (private), or could not be read. */
  requiresInvite(): Promise<boolean>;
  /**
   * Mark one player's invite paid; guarded. The confirmation is step 6.
   * `duplicateInviteId`: the invite was already paid by something else, so
   * this payment is a second one through it.
   */
  settleInvite(
    by: InviteLookupBy
  ): Promise<{ matched?: boolean; alreadyPaid?: boolean; duplicateInviteId?: string } | null>;
  /** Note a second payment on an invite for the coach; guarded. Never throws. */
  flagDuplicate(inviteId: string): Promise<void>;
  /** The claim: the rows this call moved out of `from`. */
  moveEnrollments(ids: readonly string[], from: readonly string[], to: string): Promise<string[]>;
  /** Tell the coach one player's payment settled onto no invite. Never throws. */
  emailUnmatched(params: { playerIndex: number; playerCount: number }): Promise<void>;
  /** The account email (and the row a checkout without Supabase never saved). Never throws. */
  notifyAccount(params: { rowStatus: string; notify: boolean }): Promise<void>;
  /** Confirm the cohort when its paid invites reach the minimum; guarded. */
  confirmCohort(): Promise<void>;
  log(line: string): void;
  warn(line: string): void;
};

/**
 * Where the payment stands before this delivery touches anything, from its
 * enrollment rows: `settle` while every row is still waiting on it or already
 * reads what it settles to (a retry finishing the job); `reversed` once any
 * row reads something else, which is a refund or dispute that got there
 * first. No rows to read (a checkout that saved none) is `settle`: the Sheet
 * decides then.
 */
export function settlementStage(input: {
  statuses: readonly string[];
  from: readonly string[];
  to: string;
}): "settle" | "reversed" {
  return input.statuses.every((s) => s === input.to || input.from.includes(s)) ? "settle" : "reversed";
}

export type SettlementResult = {
  /** settled: this delivery made the claim. redelivery: an earlier one had. reversed: left alone. */
  stage: "settled" | "redelivery" | "reversed";
  /** Whether this delivery sent the one-time emails. */
  spoke: boolean;
};

export async function settleEnrollmentPayment(
  deps: SettlementDeps,
  input: SettlementInput
): Promise<SettlementResult> {
  const plan = settlementPlan(input.outcome);
  // A test payment's rows read test_paid; a live one's read paid.
  const to = plan.rowStatus ?? "paid";
  const from = settleFrom(input.outcome);
  const { cohortId, sessionId } = input;

  const statuses =
    input.enrollmentIds.length > 0 ? await deps.readEnrollmentStatuses(input.enrollmentIds) : [];
  if (settlementStage({ statuses, from, to }) === "reversed") {
    deps.log(`[stripe webhook] session ${sessionId}: its rows were reversed before this event, nothing settled`);
    return { stage: "reversed", spoke: false };
  }

  // 1. The Sheet rows: they carry the seat count. Each is moved only when it
  // still carries this payment's cohort and contact email and a status the
  // payment expects; a test payment expects pending only.
  const sheet = await deps.flipSheetRows({
    rowNumbers: input.sheetRows,
    cohortId,
    email: input.contactEmail,
    from,
    to,
  });
  if (sheet && sheet.unresolved.length > 0) {
    deps.warn(
      `[stripe webhook] session ${sessionId}: ${sheet.unresolved.length} Sheet row(s) do not carry this payment's cohort and email, so they were not moved`
    );
  }
  const sheetMoved = sheet === null ? null : sheet.moved.length;
  // A checkout that saved no enrollment rows has only the Sheet to go by: a
  // delivery that moved nothing there is a retry of one already handled.
  if (
    statuses.length === 0 &&
    !isFirstDelivery({ dbRows: 0, dbMoved: 0, sheetRows: input.sheetRows.length, sheetMoved })
  ) {
    deps.log(`[stripe webhook] session ${sessionId} already settled: redelivery, nothing changed`);
    return { stage: "redelivery", spoke: false };
  }

  // 2. The $20 credits, live money only: a test payment spends none. One per
  // player, in the order the rows were appended, and written beside a Sheet
  // row only when step 1 found that row to be this payment's own.
  if (plan.applyCredits) {
    for (const [i, bookingId] of input.creditBookingIds.entries()) {
      await deps.applyCredit(bookingId);
      const target = input.sheetRows[i] ?? input.sheetRows[0];
      if (target && (sheet === null || sheet.own.includes(target))) {
        await deps.recordSheetCredit(target, (input.perCreditCents / 100).toFixed(2));
      }
    }
  }

  // 3. The invites, live money only: a test payment settles none, so it can
  // never meet a minimum. Backlog #38: the email fallback only serves a
  // legacy session that names neither an invite nor a participant, and never
  // a private cohort. Once the first player has settled onto an invite row
  // by id or token, later players on the same session may use it.
  const unmatched: { playerIndex: number; playerCount: number }[] = [];
  // Invites this payment found already paid by something else: a second
  // payment, which the coach is told about once, in the invite's note.
  const duplicates: string[] = [];
  if (plan.settleInvites && cohortId) {
    const requiresInvite = await deps.requiresInvite();
    const playerCount = Math.max(1, input.participantIds.length, input.sheetRows.length);
    let priorInviteProof = false;
    for (let i = 0; i < playerCount; i++) {
      const by = inviteSettlement({
        inviteId: input.inviteId,
        legacyInviteToken: input.legacyInviteToken,
        participantId: input.participantIds[i],
        contactEmail: input.contactEmail,
        requiresInvite,
        // The invite row belongs to the first player only.
        isFirstPlayer: i === 0,
        priorInviteProof,
      });
      const result = by ? await deps.settleInvite(by) : null;
      const matched = Boolean(result?.matched);
      if (settledByInvite(by, matched)) priorInviteProof = true;
      if (result?.duplicateInviteId && !duplicates.includes(result.duplicateInviteId)) {
        duplicates.push(result.duplicateInviteId);
      }
      // The money is banked and the Sheet row is paid; only the invite needs
      // the coach's hand. PII-light here, the address in the inbox, and only
      // for a cohort that runs on invites, never for an invite already paid.
      const signal = unmatchedSignal({
        matched,
        alreadyPaid: Boolean(result?.alreadyPaid),
        requiresInvite,
        byParticipant: Boolean(by?.participantId),
        playerCount,
      });
      if (signal.warn) {
        deps.warn(
          `Payment settled to no invite: session=${sessionId} cohort=${cohortId} player=${i + 1}/${playerCount}`
        );
      }
      if (signal.email) unmatched.push({ playerIndex: i + 1, playerCount });
    }
  }

  // 4. The claim: every player's enrollment row, in one guarded statement
  // (audit M25). It throws on a failed write, so the webhook answers 500 and
  // Stripe retries; nothing above is done twice by that retry.
  const dbMoved = await deps.moveEnrollments(input.enrollmentIds, from, to);
  const speaks = isFirstDelivery({
    dbRows: input.enrollmentIds.length,
    dbMoved: dbMoved.length,
    sheetRows: input.sheetRows.length,
    sheetMoved,
  });

  // 5. What must not repeat, from the delivery that made the claim only.
  if (speaks) {
    for (const inviteId of duplicates) await deps.flagDuplicate(inviteId);
    for (const player of unmatched) await deps.emailUnmatched(player);
    await deps.notifyAccount({ rowStatus: to, notify: plan.notifyAccount });
  } else {
    deps.log(
      `[stripe webhook] session ${sessionId} already settled: redelivery, every guarded step checked, nothing sent`
    );
  }

  // 6. The cohort's confirmation, after the rows read paid so its email
  // reaches every player on this payment. Guarded: one caller confirms.
  if (plan.settleInvites && cohortId) await deps.confirmCohort();

  return { stage: speaks ? "settled" : "redelivery", spoke: speaks };
}
