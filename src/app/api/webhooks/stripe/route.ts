import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import {
  saveEnrollmentToSupabase,
  notifyEnrollmentAccount,
  enrollmentRowsOwner,
  enrollmentStatuses,
  participantNamesOf,
  setEnrollmentStatusByIds,
} from "@/lib/supabase/enrollmentActions";
import { inviteLinkFromMetadata } from "@/lib/checkoutInvite";
import { getCohortById } from "@/lib/cohortsDb";
import { programs } from "@/content/programs";
import { flipPaymentRows, setEnrollmentCredit } from "@/lib/enrollmentSheet";
import { settleEnrollmentPayment } from "@/lib/paymentSettlement";
import { reverseCheckoutSession } from "@/lib/paymentReversal";
import {
  bookingPaid,
  paymentOutcome,
  refundReversal,
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
// retries, which the same guards make safe: a delivery that stopped half-way
// is finished by the next one (src/lib/paymentSettlement.ts).

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
    const creditBookings =
      bookingIds.length > 0
        ? bookingIds
        : assessmentBookingId && assessmentCreditCents > 0
          ? [assessmentBookingId]
          : [];

    const { ASSESSMENT_CREDIT_CENTS, markCreditApplied } = await import("@/lib/assessmentCredit");
    const { markInvitePaidAndMaybeConfirm, maybeConfirmCohort } = await import("@/lib/cohortActions");
    const { cohortRequiresInvite } = await import("@/lib/enrollGate");
    const { sendPaymentUnmatchedAdminEmail } = await import("@/lib/email");

    // Read once, by the first step that needs it: a cohort that cannot be
    // read counts as private (fail closed).
    let cohortRead: ReturnType<typeof getCohortById> | null = null;
    const readCohort = () =>
      (cohortRead ??= cohortId
        ? getCohortById(cohortId).catch(() => undefined)
        : Promise.resolve(undefined));

    // The steps, their order and what a retry may repeat live in
    // settleEnrollmentPayment (src/lib/paymentSettlement.ts): every delivery
    // walks the guarded steps, so one that stopped half-way is finished by
    // the next, and only the delivery whose row move landed sends the emails.
    await settleEnrollmentPayment(
      {
        readEnrollmentStatuses: enrollmentStatuses,
        flipSheetRows: flipPaymentRows,
        applyCredit: markCreditApplied,
        recordSheetCredit: setEnrollmentCredit,
        requiresInvite: async () => cohortRequiresInvite(await readCohort()),
        // The invite only: the cohort's confirmation is the last step, once
        // the enrollment rows read paid.
        settleInvite: (by) =>
          markInvitePaidAndMaybeConfirm({ cohortId, ...by, confirm: false }).catch((err) => {
            console.error("Invite confirmation failed (non-blocking):", err);
            return null;
          }),
        moveEnrollments: setEnrollmentStatusByIds,
        emailUnmatched: async ({ playerIndex, playerCount }) => {
          const cohort = await readCohort();
          await sendPaymentUnmatchedAdminEmail({
            sessionId: session.id,
            cohortLabel: cohort?.label ?? cohortId,
            cohortId,
            playerIndex,
            playerCount,
            payerEmail: contactEmail,
          }).catch((err) =>
            console.error(
              "Unmatched payment email failed (non-blocking):",
              err instanceof Error ? err.name : typeof err
            )
          );
        },
        // What the account hears once the money is in (audit H5): a new email
        // gets the set-password link, an existing account gets "You're
        // enrolled". Non-blocking: the payment is already recorded, and a
        // Resend refusal must not 500 the webhook.
        notifyAccount: async ({ rowStatus, notify }) => {
          try {
            const cohort = await readCohort();
            // Audit H5, backlog #84: whoever owns the rows checkout saved — a
            // signed-in buyer's session — never the account that exists for
            // the payer's email. A signed-out payment's rows stay unowned and
            // link when the address owner signs in through their own emailed
            // link.
            const ownerId = await enrollmentRowsOwner(paidEnrollmentIds);
            const enrolled = {
              programTitle: programs.find((p) => p.id === cohort?.programId)?.title ?? "your program",
              cohortLabel: cohort?.label ?? cohortId,
              paid: true,
            };
            if (contactEmail && !supabaseEnrollmentId) {
              // The enrollment wasn't saved to Supabase during checkout
              // creation (e.g. Supabase wasn't configured then): save it now.
              const newId = await saveEnrollmentToSupabase({
                cohortId,
                contactEmail,
                status: rowStatus,
                userId: ownerId,
              });
              if (newId && notify) {
                await notifyEnrollmentAccount({
                  email: contactEmail,
                  enrollmentId: newId,
                  ownerId,
                  cohortId,
                  enrolled: { ...enrolled, participantName: null },
                });
              }
            } else if (supabaseEnrollmentId && contactEmail && notify) {
              // Every player's name is on the rows saved at checkout, so the
              // set-up email can name them all (owner, 2026-10-12).
              const playerNames = await participantNamesOf(paidEnrollmentIds).catch(() => []);
              await notifyEnrollmentAccount({
                email: contactEmail,
                enrollmentId: supabaseEnrollmentId,
                ownerId,
                cohortId,
                enrolled: { ...enrolled, playerNames },
              });
            }
          } catch (err) {
            console.error("Activation link failed (non-blocking):", err);
          }
        },
        confirmCohort: () => maybeConfirmCohort(cohortId),
        log: (line) => console.log(line),
        warn: (line) => console.warn(line),
      },
      {
        sessionId: session.id,
        outcome,
        cohortId,
        contactEmail,
        sheetRows: paidRows,
        enrollmentIds: paidEnrollmentIds,
        creditBookingIds: creditBookings,
        // One credit per player; a session from before households carries
        // the one amount it took off.
        perCreditCents: bookingIds.length > 0 ? ASSESSMENT_CREDIT_CENTS : assessmentCreditCents,
        inviteId,
        legacyInviteToken,
        participantIds,
      }
    );
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
    await reverseCheckoutSession(session, kind, { livemode: event.livemode === true });
  }

  return NextResponse.json({ received: true });
}
