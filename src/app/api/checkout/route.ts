import { NextRequest, NextResponse } from "next/server";
import { CARD_PAYMENT_UNAVAILABLE, createCheckoutSession, paymentRail } from "@/lib/payments";
import { saveEnrollmentToSupabase } from "@/lib/supabase/enrollmentActions";
import { getCohortById } from "@/lib/cohortsDb";
import { creditsForSeats } from "@/lib/assessmentCredit";
import { findInviteRefByToken } from "@/lib/cohortActions";
import {
  COHORT_FULL_ERROR,
  RECORDS_UNAVAILABLE_ERROR,
  ROW_MISMATCH_ERROR,
  approvalRefusal,
  checkoutCreditParticipants,
  contactEmailRefusal,
  gateRefusal,
  requestedParticipantIds,
  resolveEnrollGate,
  rowsNotPayable,
  scrubParticipantIds,
  seatsRefuse,
} from "@/lib/enrollGate";
import { readEnrollmentSheet, seatsFromSnapshot } from "@/lib/seatCount";
import { currentUser } from "@/lib/household";
import { listParticipantsForAccount } from "@/lib/players";
import {
  checkoutInviteLink,
  enrollReturnUrls,
  inviteResumeCookie,
} from "@/lib/checkoutInvite";
import {
  BOT_REFUSAL_ERROR,
  INVALID_EMAIL_ERROR,
  REQUEST_TOO_LARGE,
  bodyTooLarge,
  checkBot,
  isValidEmail,
  logBotDrop,
} from "@/lib/botCheck";
import { tooManyPlayers } from "@/lib/participantInput";
import { enrollmentOwner } from "@/lib/enrollmentLink";
import { SUBMISSION_LIMIT_ERROR } from "@/lib/submissionLimits";
import { checkSubmissionLimit } from "@/lib/submissionLimitsDb";
import { flipPaymentRows } from "@/lib/enrollmentSheet";
import { settleFrom } from "@/lib/stripeOutcome";

type CheckoutParticipant = {
  name?: string;
  participantId?: string | null;
  rowNumber?: number | null;
  isMinor?: boolean;
  dob?: string;
};

type EnrollmentMeta = {
  contactEmail: string;
  participantName?: string;
  participantDob?: string;
  isMinor?: boolean;
  contactPhone?: string;
  guardianName?: string;
  guardianEmail?: string;
  guardianPhone?: string;
  consentSignedName?: string;
  consentAgreedAt?: string;
  waiverVersion?: string;
  location?: string;
  /** Every player this payment covers (backlog #11). One payer, many seats. */
  participants?: CheckoutParticipant[];
};

export async function POST(req: NextRequest) {
  try {
    // The size cap the other public forms have (safety review).
    const raw = await req.text();
    if (bodyTooLarge(raw, req.headers.get("content-length"))) {
      return NextResponse.json({ error: REQUEST_TOO_LARGE }, { status: 400 });
    }
    const body = JSON.parse(raw);
    // Bot protection (backlog #84, the same check as the other public forms).
    // A tripped check creates nothing and answers a plain refusal the wizard
    // shows (safety review), never a success-shaped answer.
    const verdict = checkBot(body);
    if (verdict.bot) {
      logBotDrop("checkout", verdict.reason);
      return NextResponse.json({ error: BOT_REFUSAL_ERROR }, { status: 400 });
    }
    const {
      cohortId,
      programTitle,
      priceCents,
      inviteToken,
      enrollmentRowNumber,
      enrollmentMeta,
    }: {
      cohortId: string;
      programTitle?: string;
      priceCents?: number;
      inviteToken?: string;
      enrollmentRowNumber: number;
      enrollmentMeta?: EnrollmentMeta;
    } = body;

    if (!cohortId || enrollmentRowNumber == null) {
      return NextResponse.json(
        { error: "Missing required fields." },
        { status: 400 }
      );
    }
    // No more players than one household holds, the most the wizard can send.
    if (tooManyPlayers(enrollmentMeta?.participants)) {
      return NextResponse.json({ error: REQUEST_TOO_LARGE }, { status: 400 });
    }
    // The same format check as every other form (backlog #84), before any
    // row, credit or Stripe session. A body with no contact email saves
    // nothing and passes, as before.
    const typedEmail = String(enrollmentMeta?.contactEmail ?? "").trim();
    if (typedEmail && !isValidEmail(typedEmail)) {
      return NextResponse.json({ error: INVALID_EMAIL_ERROR }, { status: 400 });
    }

    // Backlog #84: in production, no Stripe key means no checkout — a plain
    // line and a 503 before any row, credit or session exists. Mock mode
    // (no key) runs only outside production, and its rows are test rows.
    const rail = paymentRail();
    if (rail === "refuse") {
      return NextResponse.json({ error: CARD_PAYMENT_UNAVAILABLE }, { status: 503 });
    }

    // The server's price wins over whatever the client sent.
    const cohort = await getCohortById(cohortId);
    const seatCents = cohort?.priceCents ?? priceCents ?? 0;

    // Backlog #38: the enroll page's gate, run again here before anything is
    // created. A cohort the page would not render is a 404; a private cohort
    // needs an invite in this cohort that can still be paid (or, tier-gated,
    // a signed-in player inside its level band) — else 403, no Stripe session.
    // Audit M27: a tier-gated private cohort admits by the level of each
    // player this payment covers, not the holder's own.
    const gate = await resolveEnrollGate(cohort, inviteToken, {
      payable: true,
      participantIds: requestedParticipantIds(enrollmentMeta?.participants),
    });
    const refused = gateRefusal(gate);
    if (refused) {
      return NextResponse.json({ error: refused.error }, { status: refused.status });
    }
    // A public cohort in a by-approval group (High Performance) takes no
    // walk-in: the page shows ApprovalGate, and this route refuses the same
    // request before a Stripe session exists. An invitee holding the link
    // walks through, exactly as on the page.
    const byApproval = approvalRefusal(cohort, gate);
    if (byApproval) {
      return NextResponse.json({ error: byApproval.error }, { status: byApproval.status });
    }

    // Every player this payment covers. A body without the household field is
    // a single-player enrollment — one seat, exactly as before.
    const sent: CheckoutParticipant[] =
      enrollmentMeta?.participants && enrollmentMeta.participants.length > 0
        ? enrollmentMeta.participants
        : [
            {
              name: enrollmentMeta?.participantName,
              rowNumber: enrollmentRowNumber,
            },
          ];
    // Backlog #38: a participant id is only kept when it belongs to the
    // signed-in account (the household rule); a signed-out caller names
    // nobody. Runs before the credit lookup and before Stripe metadata.
    const signedIn = await currentUser();
    // Audit H5: a signed-in caller enrolls under the account's own address.
    // The rows save with the session as owner, so a body naming another
    // address would hand that address's history to this account — 400,
    // before any row, credit or Stripe session. A body with no contact
    // email saves nothing and passes.
    const mismatch = contactEmailRefusal(signedIn, enrollmentMeta?.contactEmail);
    if (mismatch) {
      return NextResponse.json({ error: mismatch.error }, { status: mismatch.status });
    }
    // Repeated submissions (backlog #84): counted once the fields, the gate
    // and the contact check pass, before the records are read or any row,
    // credit, coupon or Stripe session exists. A refusal of the route's own
    // below (records unreachable, a full cohort, a foreign row, a declined
    // invite) gives the try back.
    const ticket = await checkSubmissionLimit(req, "checkout", typedEmail);
    if (!ticket.allowed) {
      return NextResponse.json({ error: SUBMISSION_LIMIT_ERROR }, { status: 429 });
    }
    const owned = signedIn
      ? new Set(
          (
            await listParticipantsForAccount(signedIn.id).catch((err) => {
              console.error(
                "Participant ownership lookup failed; participant ids dropped (non-blocking):",
                err instanceof Error ? err.message : err
              );
              return [];
            })
          ).map((p) => p.id)
        )
      : null;
    const players = scrubParticipantIds(sent, owned);
    // Audit H5, backlog #84: the account every row this request saves belongs
    // to — the signed-in user, else nobody. A typed email never makes a row
    // the property of the account that exists for it; the row links when the
    // address owner signs in through their own emailed link.
    const ownerId = enrollmentOwner(signedIn?.id);
    const rowNumbers = players
      .map((p) => p.rowNumber ?? null)
      .filter((n): n is number => typeof n === "number" && n > 0);
    const chargeCents = seatCents * players.length;

    // Backlog #38: one read of the enrollments tab answers two questions
    // before any money moves — is there a seat for every player (the page's
    // own seat rule), and are the row numbers the browser sent the payer's
    // own (they are what the webhook marks paid): under this cohort, under
    // this checkout's contact email, and still pending (safety review: the
    // cohort alone let a stranger name another family's row). Sheets
    // unconfigured (local dev) skips both, exactly as the page skips its
    // seat check.
    const sheet = await readEnrollmentSheet();
    if (sheet.status === "error") {
      await ticket.release();
      return NextResponse.json({ error: RECORDS_UNAVAILABLE_ERROR }, { status: 503 });
    }
    if (sheet.status === "ok" && cohort) {
      const seatsRemaining = seatsFromSnapshot(sheet.snapshot, cohort.id, cohort.capacityMax);
      if (seatsRefuse(seatsRemaining, players.length)) {
        await ticket.release();
        return NextResponse.json({ error: COHORT_FULL_ERROR }, { status: 409 });
      }
      const toVerify = Array.from(new Set([enrollmentRowNumber, ...rowNumbers]));
      const notOwn = rowsNotPayable(sheet.snapshot, {
        cohortId: cohort.id,
        email: typedEmail,
        rowNumbers: toVerify,
      });
      if (notOwn.length > 0) {
        await ticket.release();
        return NextResponse.json({ error: ROW_MISMATCH_ERROR }, { status: 400 });
      }
    }

    // The $20 assessment credit is per player: two children assessed under one
    // parent's account bring $40 off between them. Only a signed-in account's
    // own players, by participant id (backlog #84): signed out, no credit is
    // looked up — a typed email never finds one — and the sign-up page says
    // it applies once they sign in. Which booking each seat takes is the one
    // rule every price reads (creditsForSeats, src/lib/creditRules.ts): a
    // player's own, then one linked to this account but to no player, once.
    const creditFor = checkoutCreditParticipants(Boolean(signedIn), players);
    const decided = signedIn
      ? await creditsForSeats({ accountId: signedIn.id, seats: creditFor })
      : creditFor.map(() => null);
    const credits = decided.flatMap((seat, i) =>
      seat
        ? [{ rowNumber: players[i].rowNumber ?? null, bookingId: seat.bookingId, cents: seat.creditCents }]
        : []
    );
    const discountCents = Math.min(
      credits.reduce((sum, c) => sum + c.cents, 0),
      chargeCents
    );
    const credit = credits[0] ?? null;

    const origin =
      req.headers.get("origin") ??
      process.env.NEXT_PUBLIC_SITE_URL ??
      "https://tennisbootcamp-seven.vercel.app";

    // Backlog #30: Stripe gets the invite's row id, never the token, so a
    // hold that lapsed since the page loaded still settles onto its own row;
    // the cancel-return cookie only when the gate would still admit the
    // token. A declined invite is refused here (#34), before the enrollment
    // rows, the Stripe session and the mock-mode tail: no money is taken and
    // nothing can settle onto a sibling's invite through the email fallback.
    let inviteId: string | undefined;
    let setResumeCookie = false;
    if (inviteToken && gate.lookup) {
      const lookup = gate.lookup;
      const rowByToken =
        lookup.state === "valid"
          ? null
          : await findInviteRefByToken(cohortId, inviteToken);
      const decision = checkoutInviteLink({ lookup, rowByToken });
      if (decision.kind === "refuse") {
        await ticket.release();
        return NextResponse.json(
          { error: decision.error },
          { status: decision.status }
        );
      }
      ({ inviteId, setResumeCookie } = decision);
    }

    const { successUrl, cancelUrl } = enrollReturnUrls({
      origin,
      cohortId,
      enrollmentRowNumber,
      playerCount: players.length,
      // The success flag means "this payment settles onto an invite row", so
      // it follows the id Stripe is given, not the token the body sent (#34):
      // a token that matched nothing, or a declined invite, no longer reports
      // itself as an invited enrollment.
      hasInvite: Boolean(inviteId),
    });

    // Save to Supabase — one enrollment row per player (fire-and-forget on
    // error so it never breaks checkout).
    let supabaseEnrollmentId: string | null = null;
    const supabaseEnrollmentIds: string[] = [];
    if (enrollmentMeta?.contactEmail) {
      for (const p of players) {
        const id = await saveEnrollmentToSupabase({
          cohortId,
          program: programTitle,
          location: enrollmentMeta.location,
          participantName: p.name ?? enrollmentMeta.participantName,
          participantDob: p.dob ?? enrollmentMeta.participantDob,
          isMinor: p.isMinor ?? enrollmentMeta.isMinor,
          contactEmail: enrollmentMeta.contactEmail,
          contactPhone: enrollmentMeta.contactPhone,
          guardianName: enrollmentMeta.guardianName,
          guardianEmail: enrollmentMeta.guardianEmail,
          guardianPhone: enrollmentMeta.guardianPhone,
          consentSignedName: enrollmentMeta.consentSignedName,
          consentAgreedAt: enrollmentMeta.consentAgreedAt,
          waiverVersion: enrollmentMeta.waiverVersion,
          status: rail === "mock" ? "test_paid" : "pending",
          userId: ownerId,
        });
        if (!supabaseEnrollmentId) supabaseEnrollmentId = id;
        if (id) supabaseEnrollmentIds.push(id);
      }
    }

    const { sessionUrl } = await createCheckoutSession({
      cohortId,
      programTitle: programTitle ?? "Tennis Bootcamp",
      priceCents: seatCents,
      quantity: players.length,
      enrollmentRowNumber,
      enrollmentRowNumbers: rowNumbers,
      successUrl,
      cancelUrl,
      contactEmail: enrollmentMeta?.contactEmail,
      supabaseEnrollmentId: supabaseEnrollmentId ?? undefined,
      // Every player's row, so the webhook marks each one paid (audit M25).
      supabaseEnrollmentIds,
      discountCents,
      assessmentBookingId: credit?.bookingId,
      assessmentBookingIds: credits.map((c) => c.bookingId),
      participantIds: players
        .map((p) => p.participantId ?? "")
        .filter((id): id is string => Boolean(id)),
      inviteId,
    });

    if (rail === "mock") {
      // Mock mode (no Stripe key, never in production; backlog #84): no money
      // moved, so every row it writes is a test row. A test payment never
      // counts toward the seats (they count "paid" rows only), the minimum or
      // the confirmation, spends no credit (nothing is settled onto an
      // invite) and sends no account email. The rows move through the same
      // guarded flip a test payment's webhook uses (safety review): only this
      // checkout's own rows, under its cohort and contact email, and only out
      // of pending — never a row that is paid or waits on an e-transfer.
      await flipPaymentRows({
        rowNumbers: rowNumbers.length > 0 ? rowNumbers : [enrollmentRowNumber],
        cohortId,
        email: typedEmail,
        from: settleFrom("test"),
        to: "test_paid",
      });
    }

    const res = NextResponse.json({ sessionUrl });
    // A cancelled Stripe checkout returns to /enroll/<cohort> with no token in
    // the URL; this httpOnly cookie lets that page re-admit the invited player.
    if (inviteToken && setResumeCookie) {
      res.cookies.set(
        inviteResumeCookie(cohortId, inviteToken, {
          secure: process.env.NODE_ENV === "production",
        })
      );
    }
    return res;
  } catch (err) {
    console.error("Checkout API error:", err);
    return NextResponse.json({ error: "Checkout failed." }, { status: 500 });
  }
}
