import "server-only";
import type Stripe from "stripe";
import { createServiceClient } from "@/lib/supabase/service";
import { flipPaymentRows } from "@/lib/enrollmentSheet";
import { updateAssessmentRow } from "@/lib/assessmentSheet";
import { normTime, type BlockRow, type BookingRow } from "@/lib/assessments";
import { planMarkUnpaid, type InviteStatus } from "@/lib/paymentTransitions";
import {
  bookingReversalPatch,
  duplicateReversedNote,
  noteNamesDuplicate,
  reversalNote,
  reversalReleasesInvite,
  reverseFrom,
  writeBookingState,
  type ReversalKind,
} from "@/lib/stripeOutcome";

// A card payment that went back (backlog #84, audit follow-up, owner
// 2026-11-14): a full refund or a dispute in Stripe frees the seat or the
// booking and marks it refunded or disputed, so the admin shows it and the
// seat count lets someone else in. The webhook finds the Checkout session the
// charge belongs to and hands it here.
//
// Every write is a guarded move out of the state it expects, so a redelivered
// event changes nothing twice. Nothing here sends an email. Two things are
// left alone on purpose, as on the coach's own "mark unpaid": a cohort that
// confirmed stays confirmed (its schedule emails went out), and a $20 credit
// the payment used is not handed back.

const csv = (v: string | undefined | null) =>
  (v ?? "").split(",").map((x) => x.trim()).filter(Boolean);

function supabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Reverse whatever this Checkout session paid for: a booking, or enrollment
 * seats. `livemode` is the event's own word: a test-mode refund or dispute
 * reverses a test payment's rows and never a paid one (safety review).
 */
export async function reverseCheckoutSession(
  session: Pick<Stripe.Checkout.Session, "id" | "metadata">,
  kind: ReversalKind,
  opts: { livemode: boolean }
): Promise<void> {
  const meta = session.metadata ?? {};
  if (meta.kind === "assessment") {
    await reverseBooking(meta.bookingId ?? "", kind, session.id);
    return;
  }
  await reverseEnrollment(meta, kind, session.id, opts.livemode);
}

async function reverseEnrollment(
  meta: Stripe.Metadata,
  kind: ReversalKind,
  sessionId: string,
  livemode: boolean
): Promise<void> {
  const cohortId = meta.cohortId ?? "";
  const rowNumbers = csv(meta.enrollmentRowNumbers)
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0);
  const firstRow = Number(meta.enrollmentRowNumber);
  const rows =
    rowNumbers.length > 0 ? rowNumbers : Number.isFinite(firstRow) && firstRow > 0 ? [firstRow] : [];
  const ids = csv(meta.supabaseEnrollmentIds);
  const enrollmentIds = ids.length > 0 ? ids : csv(meta.supabaseEnrollmentId);

  // The session's own rows, out of paid, test-paid or still pending; a
  // test-mode event never out of paid.
  const from = reverseFrom(livemode);
  let rowsMoved = 0;
  if (enrollmentIds.length > 0 && supabaseConfigured()) {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("enrollments")
      .update({ status: kind })
      .in("id", enrollmentIds)
      .in("status", [...from])
      .select("id");
    if (error) console.error("Enrollment reversal failed (non-blocking):", error.message);
    rowsMoved = (data ?? []).length;
  }
  // The Sheet carries the seat count. Errors propagate: Stripe retries, and
  // every move here is guarded. The row is found by the payment's own cohort
  // and contact email, never by its remembered position alone: a refund can
  // come weeks later, when another family's row sits at that number.
  const sheet = await flipPaymentRows({
    rowNumbers: rows,
    cohortId,
    email: meta.contactEmail ?? "",
    from,
    to: kind,
    relocate: true,
  });
  const sheetMoved = sheet?.moved ?? [];
  if (sheet && sheet.unresolved.length > 0) {
    console.error(
      `[stripe webhook] session ${sessionId} ${kind}: ${sheet.unresolved.length} Sheet row(s) no longer carry this payment's cohort and email and could not be found again. Mark the row ${kind} by hand.`
    );
  }
  const invitesReleased = await releaseCardInvites(
    cohortId,
    meta.inviteId ?? "",
    csv(meta.participantIds),
    kind,
    { sessionId, livemode }
  );

  console.log(
    `[stripe webhook] session ${sessionId} ${kind}: ${rowsMoved} enrollment row(s), ${sheetMoved.length} sheet row(s), ${invitesReleased} invite(s) released`
  );
}

type PaidInvite = {
  id: string;
  status: InviteStatus;
  expires_at: string;
  payment_note: string | null;
};

/**
 * The invites this session's payment settled, given back: the invite it named
 * by id, and each named player's card-paid invite in this cohort. Only out of
 * paid, and never one paid by e-transfer (a card refund is not the coach's
 * mark). The hold comes back as invited while it still runs, else expired
 * (planMarkUnpaid), and the note says why.
 *
 * Only what its own payment settled (safety review; reversalReleasesInvite):
 * the invite's note names the session that paid for it, so the refund of a
 * second payment through the same invite leaves it paid, because the first
 * payment stands, and only rewrites that payment's line for the coach. A
 * test-mode event releases nothing: a test payment settles no invite.
 */
async function releaseCardInvites(
  cohortId: string,
  inviteId: string,
  participantIds: string[],
  kind: ReversalKind,
  payment: { sessionId: string; livemode: boolean }
): Promise<number> {
  if (!cohortId || !supabaseConfigured() || !payment.livemode) return 0;
  const supabase = createServiceClient();
  const paidByCard = () =>
    supabase
      .from("cohort_invites")
      .select("id, status, expires_at, payment_note")
      .eq("cohort_id", cohortId)
      .eq("status", "paid")
      .or("payment_method.is.null,payment_method.eq.card");

  const targets: PaidInvite[] = [];
  if (inviteId) {
    const { data } = await paidByCard().eq("id", inviteId).maybeSingle();
    if (data) targets.push(data as PaidInvite);
  }
  for (const participantId of participantIds) {
    const { data } = await paidByCard()
      .eq("participant_id", participantId)
      .order("paid_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const row = data as PaidInvite | null;
    if (row && !targets.some((t) => t.id === row.id)) targets.push(row);
  }

  let released = 0;
  for (const invite of targets) {
    if (noteNamesDuplicate(invite.payment_note, payment.sessionId)) {
      // The second payment went back; the invite stays paid by the first.
      await supabase
        .from("cohort_invites")
        .update({ payment_note: duplicateReversedNote(kind, payment.sessionId, invite.payment_note) })
        .eq("id", invite.id)
        .eq("status", "paid");
      continue;
    }
    if (!reversalReleasesInvite(invite.payment_note, payment.sessionId, payment.livemode)) continue;
    const plan = planMarkUnpaid(invite, new Date());
    if (!plan.ok) continue;
    const { data } = await supabase
      .from("cohort_invites")
      .update({ ...plan.patch, payment_note: reversalNote(kind, invite.payment_note) })
      .eq("id", invite.id)
      .eq("status", "paid")
      .select("id")
      .maybeSingle();
    if (data) released++;
  }
  return released;
}

/**
 * A reversed assessment payment: a booking that still holds a slot (or kept
 * the money with none) becomes refunded or disputed, which frees the slot
 * and is how the admin list names it; a completed one keeps its result. It
 * loses `paid` either way, so no $20 credit stands on money that went back.
 * The assessments tab says refunded or disputed. Guarded on the state read.
 */
async function reverseBooking(bookingId: string, kind: ReversalKind, sessionId: string): Promise<void> {
  if (!bookingId || !supabaseConfigured()) {
    console.warn(`[stripe webhook] session ${sessionId} ${kind}: no booking to release`);
    return;
  }
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("assessment_bookings")
    .select("*")
    .eq("id", bookingId)
    .maybeSingle();
  const booking = data as BookingRow | null;
  if (!booking) {
    console.warn(`[stripe webhook] session ${sessionId} ${kind}: booking ${bookingId} not found`);
    return;
  }
  const patch = bookingReversalPatch(booking, kind);
  if (!patch) return; // already released: a redelivery, or a test booking
  const move = (p: Record<string, unknown>) =>
    supabase
      .from("assessment_bookings")
      .update(p)
      .eq("id", bookingId)
      .eq("status", booking.status)
      .eq("paid", booking.paid)
      .select("id")
      .maybeSingle();
  // Before migration 0012 the table refuses "refunded" and "disputed";
  // writeBookingState writes "cancelled", which also frees the slot, in their
  // place, so a refund never leaves the booking booked and paid.
  const { data: moved, error } = await writeBookingState(move, patch);
  if (error) console.error(`[stripe webhook] booking ${bookingId} ${kind}: not released (${error.code ?? "unknown"})`);
  if (!moved) return; // changed underneath us; the next delivery decides

  if (booking.block_id && booking.slot_start) {
    const { data: block } = await supabase
      .from("assessment_blocks")
      .select("*")
      .eq("id", booking.block_id)
      .maybeSingle();
    if (block) {
      await updateAssessmentRow({
        email: booking.email,
        participantId: booking.participant_id ?? null,
        slotDate: (block as BlockRow).block_date,
        slotStart: normTime(booking.slot_start),
        status: kind,
        paid: false,
      });
    }
  }
  console.log(`[stripe webhook] session ${sessionId} ${kind}: booking ${bookingId} released`);
}
