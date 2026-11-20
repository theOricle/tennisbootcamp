import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import {
  saveEnrollmentToSupabase,
  notifyEnrollmentAccount,
  enrollmentRowsOwner,
  participantNamesOf,
  setEnrollmentStatusByIds,
} from "@/lib/supabase/enrollmentActions";
import { inviteLinkFromMetadata } from "@/lib/checkoutInvite";
import { getCohortById } from "@/lib/cohortsDb";
import { programs } from "@/content/programs";
import { flipEnrollmentRows } from "@/lib/enrollmentSheet";
import { reverseCheckoutSession } from "@/lib/paymentReversal";
import {
  SETTLE_FROM,
  bookingPaid,
  isFirstDelivery,
  paymentOutcome,
  refundReversal,
  settlementPlan,
  type ReversalKind,
} from "@/lib/stripeOutcome";

// The Stripe webhook. The endpoint must receive three events (backlog #84):
//   checkout.session.completed  a payment settles its seats or its booking
//                               (a test-key payment as a test, below);
//   charge.refunded             a full refund releases them (a partial
//                               refund changes nothing);
//   charge.dispute.created      a dispute releases them.
// Every write is a guarded move out of the state it expects, so a redelivered
// event changes nothing twice, and the account email goes only from the
// delivery that made the move. A write that throws answers 500 and Stripe
// retries, which the same guards make safe.

export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripeKey = process.env.STRIPE_SECRET_KEY;

  if (!webhookSecret || !stripeKey || !sig) {
    return NextResponse.json(
      { error: "Webhook not configured." },
      { status: 400 }
    );
  }

  let event: Stripe.Event;
  let stripe: Stripe;
  try {
    const rawBody = await req.text();
    stripe = new Stripe(stripeKey);
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error("Stripe webhook signature error:", err);
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    // Backlog #84: Stripe's word on the money decides everything below. Only
    // a session whose payment_status is "paid" counts (checkout is card only,
    // so nothing arrives later); with test keys (livemode false) it is a test
    // payment that never counts toward seats, the minimum or confirmation.
    const outcome = paymentOutcome({ livemode: event.livemode, paymentStatus: session.payment_status });
    if (outcome === "unpaid") {
      console.warn(
        `[stripe webhook] session ${session.id} completed without payment (${session.payment_status}): nothing marked paid`
      );
      return NextResponse.json({ received: true });
    }
    const plan = settlementPlan(outcome);

    // ── Assessment bookings (Phase 1) — additive branch ──────────────────────
    // Distinguished by metadata.kind. confirmBooking moves pending → booked
    // (guarded, so a redelivery sends nothing twice) and books a hold that
    // expired before the money landed again, or tells the coach (#84).
    if (session.metadata?.kind === "assessment") {
      const bookingId = session.metadata?.bookingId ?? "";
      const paid = bookingPaid(outcome);
      if (bookingId && paid !== null) {
        const { confirmBooking } = await import("@/lib/assessments");
        // Marks booked (paid only on live money), dual-writes the assessments
        // Sheet tab, sends the booking confirmation email.
        await confirmBooking(bookingId, { stripeSessionId: session.id, paid });
      }
      return NextResponse.json({ received: true });
    }
    // A test payment's rows read test_paid; a live one's read paid.
    const rowStatus = plan.rowStatus ?? "paid";

    const rowNumber = Number(session.metadata?.enrollmentRowNumber);
    const contactEmail = session.metadata?.contactEmail ?? "";
    const supabaseEnrollmentId = session.metadata?.supabaseEnrollmentId ?? null;
    const cohortId = session.metadata?.cohortId ?? "";
    // Backlog #30: payment → invite by row id. The token fallback only serves
    // a session created before this deploy.
    const { inviteId, legacyInviteToken } = inviteLinkFromMetadata(session.metadata);
    const assessmentBookingId = session.metadata?.assessmentBookingId ?? "";
    const assessmentCreditCents = Number(session.metadata?.assessmentCreditCents ?? 0);

    // Household accounts (backlog #11): one payment can cover several players.
    // The plural metadata is authoritative when present; a session created
    // before this deploy only has the singular fields, and still settles.
    const csv = (v: string | undefined) =>
      (v ?? "").split(",").map((x) => x.trim()).filter(Boolean);
    const rowNumbers = csv(session.metadata?.enrollmentRowNumbers)
      .map(Number)
      .filter((n) => Number.isFinite(n) && n > 0);
    const bookingIds = csv(session.metadata?.assessmentBookingIds);
    const participantIds = csv(session.metadata?.participantIds);
    // Every player's Supabase row (audit M25); a session created before this
    // deploy carries only the first one, in the singular field.
    const supabaseEnrollmentIds = csv(session.metadata?.supabaseEnrollmentIds);
    const paidEnrollmentIds =
      supabaseEnrollmentIds.length > 0
        ? supabaseEnrollmentIds
        : supabaseEnrollmentId
          ? [supabaseEnrollmentId]
          : [];

    const paidRows = rowNumbers.length > 0 ? rowNumbers : rowNumber ? [rowNumber] : [];

    // The session's rows move out of pending into paid (or test_paid), never
    // out of refunded or disputed (#84): the Sheet first — it carries the seat
    // count — then every player's Supabase row, not just the first (audit
    // M25). Either write that fails answers 500 and Stripe retries; every
    // move is guarded, so a retry finishes the job without doing it twice.
    const sheetMoved = await flipEnrollmentRows(paidRows, SETTLE_FROM, rowStatus);
    const dbMoved = await setEnrollmentStatusByIds(paidEnrollmentIds, SETTLE_FROM, rowStatus);
    // Whether this delivery is the one that settles the payment: the
    // database's guarded move decides whenever the session has rows there,
    // so two deliveries at the same moment never both send the account
    // email. A redelivered event changes and sends nothing more.
    const firstDelivery = isFirstDelivery({
      dbRows: paidEnrollmentIds.length,
      dbMoved: dbMoved.length,
      sheetRows: paidRows.length,
      sheetMoved: sheetMoved === null ? null : sheetMoved.length,
    });
    if (!firstDelivery) {
      console.log(`[stripe webhook] session ${session.id} already settled: redelivery, nothing changed`);
      return NextResponse.json({ received: true });
    }

    // Read once for the invite settlement below and the enrolled email: a
    // cohort that cannot be read counts as private (fail closed).
    const cohort = cohortId ? await getCohortById(cohortId).catch(() => undefined) : undefined;
    // Audit H5, backlog #84: whoever owns the rows checkout saved — a
    // signed-in buyer's session — never the account that exists for the
    // payer's email. A signed-out payment's rows stay unowned and link when
    // the address owner signs in through their own emailed link.
    const ownerId = await enrollmentRowsOwner(paidEnrollmentIds);

    // ── Phase 3: assessment credit + invite confirmation ─────────────────────
    // Live money only (backlog #84): a test payment spends no credit, settles
    // no invite and so can never meet a minimum or send "confirmed".
    const creditBookings =
      bookingIds.length > 0
        ? bookingIds
        : assessmentBookingId && assessmentCreditCents > 0
          ? [assessmentBookingId]
          : [];
    if (plan.applyCredits && creditBookings.length > 0) {
      const { markCreditApplied } = await import("@/lib/assessmentCredit");
      const { setEnrollmentCredit } = await import("@/lib/enrollmentSheet");
      const { ASSESSMENT_CREDIT_CENTS } = await import("@/lib/assessmentCredit");
      // One credit per player, in the same order the rows were appended.
      const perCredit =
        bookingIds.length > 0 ? ASSESSMENT_CREDIT_CENTS : assessmentCreditCents;
      for (let i = 0; i < creditBookings.length; i++) {
        await markCreditApplied(creditBookings[i]);
        const target = paidRows[i] ?? paidRows[0];
        if (target) {
          await setEnrollmentCredit(target, (perCredit / 100).toFixed(2));
        }
      }
    }
    if (plan.settleInvites && cohortId) {
      const { markInvitePaidAndMaybeConfirm } = await import("@/lib/cohortActions");
      const { cohortRequiresInvite, inviteSettlement, settledByInvite, unmatchedSignal } =
        await import("@/lib/enrollGate");
      const { sendPaymentUnmatchedAdminEmail } = await import("@/lib/email");
      // Backlog #38: the email fallback only serves a legacy session that
      // names neither an invite nor a participant, and never a private
      // cohort — a cohort that cannot be read counts as private (fail
      // closed). Once the first player has settled onto an invite row here
      // by id or token, later players on the same session may use it.
      const requiresInvite = cohortRequiresInvite(cohort);
      const playerCount = Math.max(1, participantIds.length, paidRows.length);
      const targets: (string | undefined)[] = Array.from(
        { length: playerCount },
        (_, i) => participantIds[i]
      );
      let priorInviteProof = false;
      for (let i = 0; i < targets.length; i++) {
        const by = inviteSettlement({
          inviteId,
          legacyInviteToken,
          participantId: targets[i],
          contactEmail,
          requiresInvite,
          // The invite row belongs to the first player only.
          isFirstPlayer: i === 0,
          priorInviteProof,
        });
        const result = by
          ? await markInvitePaidAndMaybeConfirm({ cohortId, ...by }).catch((err) => {
              console.error("Invite confirmation failed (non-blocking):", err);
              return null;
            })
          : null;
        const matched = Boolean(result?.matched);
        if (settledByInvite(by, matched)) priorInviteProof = true;
        // The money is banked and the Sheet row is paid; only the invite
        // needs the coach's hand. PII-light here, the address in the inbox —
        // and only for a cohort that runs on invites, never for a retry of a
        // session whose invite is already paid.
        const signal = unmatchedSignal({
          matched,
          alreadyPaid: Boolean(result?.alreadyPaid),
          requiresInvite,
          byParticipant: Boolean(by?.participantId),
          playerCount: targets.length,
        });
        if (signal.warn) {
          console.warn(
            `Payment settled to no invite: session=${session.id} cohort=${cohortId} player=${i + 1}/${targets.length}`
          );
        }
        if (signal.email) {
          await sendPaymentUnmatchedAdminEmail({
            sessionId: session.id,
            cohortLabel: cohort?.label ?? cohortId,
            cohortId,
            playerIndex: i + 1,
            playerCount: targets.length,
            payerEmail: contactEmail,
          });
        }
      }
    }

    // What the account hears once the money is in (audit H5): a new email
    // gets the set-password link, an existing account gets "You're enrolled".
    // Only the delivery that moved the rows gets this far (#84): never twice.
    const enrolled = {
      programTitle: programs.find((p) => p.id === cohort?.programId)?.title ?? "your program",
      cohortLabel: cohort?.label ?? cohortId,
      paid: true,
    };

    // If the enrollment wasn't saved to Supabase during checkout creation
    // (e.g. Supabase wasn't configured at checkout time), save it now.
    if (contactEmail && !supabaseEnrollmentId) {
      const newId = await saveEnrollmentToSupabase({
        cohortId,
        contactEmail,
        status: rowStatus,
        userId: ownerId,
      });
      if (newId && plan.notifyAccount) {
        // Non-blocking: the payment is already recorded. Letting a Resend
        // refusal throw here would 500 the webhook and make Stripe retry a
        // payment we have already banked.
        await notifyEnrollmentAccount({
          email: contactEmail,
          enrollmentId: newId,
          ownerId,
          cohortId,
          enrolled: { ...enrolled, participantName: null },
        }).catch((err) => console.error("Activation link failed (non-blocking):", err));
      }
    } else if (supabaseEnrollmentId && contactEmail && plan.notifyAccount) {
      // Every player's name is on the rows saved at checkout, so the set-up
      // email can name them all (owner, 2026-10-12).
      const playerNames = await participantNamesOf(paidEnrollmentIds).catch(() => []);
      await notifyEnrollmentAccount({
        email: contactEmail,
        enrollmentId: supabaseEnrollmentId,
        ownerId,
        cohortId,
        // The player's name is on the row saved at checkout.
        enrolled: { ...enrolled, playerNames },
      }).catch((err) => console.error("Activation link failed (non-blocking):", err));
    }
  }

  // ── A card payment that went back (#84) ──────────────────────────────────
  // A full refund or a dispute releases what the payment bought: the session
  // is found by the charge's payment, then reverseCheckoutSession moves its
  // rows to refunded or disputed (the seat count lets someone else in), gives
  // the invite back and frees a booking's slot. No email. A partial refund
  // changes nothing.
  if (event.type === "charge.refunded" || event.type === "charge.dispute.created") {
    let kind: ReversalKind | null;
    let paymentIntent: string | Stripe.PaymentIntent | null;
    if (event.type === "charge.refunded") {
      const charge = event.data.object as Stripe.Charge;
      kind = refundReversal(charge);
      paymentIntent = charge.payment_intent;
    } else {
      const dispute = event.data.object as Stripe.Dispute;
      kind = "disputed";
      paymentIntent = dispute.payment_intent;
    }
    if (!kind) {
      console.log(`[stripe webhook] ${event.id}: partial refund, nothing released`);
      return NextResponse.json({ received: true });
    }
    const paymentIntentId = typeof paymentIntent === "string" ? paymentIntent : paymentIntent?.id ?? null;
    if (!paymentIntentId) {
      console.warn(`[stripe webhook] ${event.id}: ${kind} charge has no payment to trace`);
      return NextResponse.json({ received: true });
    }
    const sessions = await stripe.checkout.sessions.list({ payment_intent: paymentIntentId, limit: 1 });
    const session = sessions.data[0];
    if (!session) {
      console.warn(`[stripe webhook] ${event.id}: ${kind} payment has no Checkout session here`);
      return NextResponse.json({ received: true });
    }
    await reverseCheckoutSession(session, kind);
  }

  return NextResponse.json({ received: true });
}
