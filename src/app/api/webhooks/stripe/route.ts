import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { google } from "googleapis";
import {
  saveEnrollmentToSupabase,
  issueActivationLink,
} from "@/lib/supabase/enrollmentActions";
import { inviteLinkFromMetadata } from "@/lib/checkoutInvite";

const TAB = "enrollments";
const STATUS_COL = "P";

async function markEnrollmentPaid(rowNumber: number) {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!spreadsheetId || !clientEmail || !rawKey) return;

  const privateKey = rawKey.replace(/\\n/g, "\n").replace(/\r/g, "").trim();
  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const sheets = google.sheets({ version: "v4", auth });

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${TAB}!${STATUS_COL}${rowNumber}`,
    valueInputOption: "RAW",
    requestBody: { values: [["paid"]] },
  });
}

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
  try {
    const rawBody = await req.text();
    const stripe = new Stripe(stripeKey);
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error("Stripe webhook signature error:", err);
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    // ── Assessment bookings (Phase 1) — additive branch ──────────────────────
    // Distinguished by metadata.kind; enrollment logic below is untouched.
    if (session.metadata?.kind === "assessment") {
      const bookingId = session.metadata?.bookingId ?? "";
      if (bookingId) {
        const { confirmBooking } = await import("@/lib/assessments");
        // Marks booked + paid, dual-writes the assessments Sheet tab, sends the
        // booking confirmation email.
        await confirmBooking(bookingId, { stripeSessionId: session.id });
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

    const paidRows = rowNumbers.length > 0 ? rowNumbers : rowNumber ? [rowNumber] : [];
    for (const n of paidRows) {
      await markEnrollmentPaid(n);
    }

    // ── Phase 3: assessment credit + invite confirmation ─────────────────────
    const creditBookings =
      bookingIds.length > 0
        ? bookingIds
        : assessmentBookingId && assessmentCreditCents > 0
          ? [assessmentBookingId]
          : [];
    if (creditBookings.length > 0) {
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
    if (cohortId) {
      const { markInvitePaidAndMaybeConfirm } = await import("@/lib/cohortActions");
      const { cohortRequiresInvite, inviteSettlement, settledByInvite } = await import(
        "@/lib/enrollGate"
      );
      const { getCohortById } = await import("@/lib/cohortsDb");
      const { sendPaymentUnmatchedAdminEmail } = await import("@/lib/email");
      // Backlog #38: the email fallback only serves a legacy session that
      // names neither an invite nor a participant, and never a private
      // cohort — a cohort that cannot be read counts as private (fail
      // closed). Once the first player has settled onto an invite row here
      // by id or token, later players on the same session may use it.
      const cohort = await getCohortById(cohortId).catch(() => undefined);
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
        if (!matched) {
          // The money is banked and the Sheet row is paid; only the invite
          // needs the coach's hand. PII-light here, the address in the inbox.
          console.warn(
            `Payment settled to no invite: session=${session.id} cohort=${cohortId} player=${i + 1}/${targets.length}`
          );
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

    // If the enrollment wasn't saved to Supabase during checkout creation
    // (e.g. Supabase wasn't configured at checkout time), save it now.
    if (contactEmail && !supabaseEnrollmentId) {
      const cohortId = session.metadata?.cohortId ?? "";
      const newId = await saveEnrollmentToSupabase({
        cohortId,
        contactEmail,
        status: "paid",
      });
      if (newId) {
        // Non-blocking: the payment is already recorded. Letting a Resend
        // refusal throw here would 500 the webhook and make Stripe retry a
        // payment we have already banked.
        await issueActivationLink(contactEmail, newId).catch((err) =>
          console.error("Activation link failed (non-blocking):", err)
        );
      }
    } else if (supabaseEnrollmentId && contactEmail) {
      // Update existing Supabase row to paid
      const { createServiceClient } = await import("@/lib/supabase/service");
      const supabase = createServiceClient();
      await supabase
        .from("enrollments")
        .update({ status: "paid" })
        .eq("id", supabaseEnrollmentId);
      await issueActivationLink(contactEmail, supabaseEnrollmentId).catch((err) =>
        console.error("Activation link failed (non-blocking):", err)
      );
    }
  }

  return NextResponse.json({ received: true });
}
