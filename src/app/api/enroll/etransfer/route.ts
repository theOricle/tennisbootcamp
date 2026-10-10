import { NextRequest, NextResponse } from "next/server";
import { recordEtransferIntent } from "@/lib/cohortActions";
import { getCohortById } from "@/lib/cohortsDb";
import {
  COHORT_FULL_ERROR,
  RECORDS_UNAVAILABLE_ERROR,
  contactEmailRefusal,
  gateRefusal,
  requestedParticipantIds,
  resolveEnrollGate,
  scrubParticipantIds,
  seatsRefuse,
} from "@/lib/enrollGate";
import { readEnrollmentSheet, seatsFromSnapshot } from "@/lib/seatCount";
import { currentUser } from "@/lib/household";
import { listParticipantsForAccount } from "@/lib/players";
import {
  saveEnrollmentToSupabase,
  notifyEnrollmentAccount,
  resolveEnrollmentUserId,
} from "@/lib/supabase/enrollmentActions";
import { setEnrollmentStatusByEmail } from "@/lib/enrollmentSheet";
import { programs } from "@/content/programs";

// "I've sent it" on an e-transfer cohort (backlog #12). Mirrors what the card
// path does at checkout — Supabase enrollment row + activation link — but no
// money moves here: the invite is flagged payment_method = 'etransfer' and
// stays awaiting the coach's mark-paid in /admin/cohorts/[id]. The Sheet row
// written by /api/enroll flips to "pending_etransfer" (seat counts only ever
// count "paid"). The row is resolved server-side by cohort + contact email —
// a client-supplied row number is never trusted to address the Sheet.
// /api/checkout is untouched; card stays available.

type EnrollParticipant = {
  name?: string;
  participantId?: string | null;
  dob?: string;
  isMinor?: boolean;
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
  /** Every player this transfer covers (backlog #11) — one invite each. */
  participants?: EnrollParticipant[];
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      cohortId,
      programTitle,
      inviteToken,
      enrollmentMeta,
    }: {
      cohortId: string;
      programTitle?: string;
      inviteToken?: string;
      enrollmentMeta?: EnrollmentMeta;
    } = body;

    if (!cohortId || !enrollmentMeta?.contactEmail) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    // Backlog #38: the enroll page's gate, run again here before any invite
    // row or Sheet write. Same rule as /api/checkout.
    const cohort = await getCohortById(cohortId);
    // Audit M27: the level of each player on the transfer, not the holder's.
    const gate = await resolveEnrollGate(cohort, inviteToken, {
      payable: true,
      participantIds: requestedParticipantIds(enrollmentMeta?.participants),
    });
    const refused = gateRefusal(gate);
    if (refused) {
      return NextResponse.json({ error: refused.error }, { status: refused.status });
    }

    // One player per invite: a parent sending one transfer for two children
    // still ends up with two invites the coach marks paid, and the amounts
    // add up across them. A $20 assessment credit applies to at most one
    // player — the same dedupe by booking id as /api/checkout.
    const sent: EnrollParticipant[] =
      enrollmentMeta.participants && enrollmentMeta.participants.length > 0
        ? enrollmentMeta.participants
        : [
            {
              name: enrollmentMeta.participantName,
              dob: enrollmentMeta.participantDob,
              isMinor: enrollmentMeta.isMinor,
            },
          ];
    // Backlog #38: participant ids only for the signed-in account's own
    // people; a signed-out caller names nobody. Same as /api/checkout.
    const signedIn = await currentUser();
    // Audit H5: a signed-in caller enrolls under the account's own address.
    // The rows save with the session as owner, so a body naming another
    // address would hand that address's history to this account — 400,
    // before any row or Sheet write. Same as /api/checkout.
    const mismatch = contactEmailRefusal(signedIn, enrollmentMeta.contactEmail);
    if (mismatch) {
      return NextResponse.json({ error: mismatch.error }, { status: mismatch.status });
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
    // Audit H5: the account every row this request saves belongs to — the
    // signed-in user, else the account that already exists for the email.
    const ownerId = await resolveEnrollmentUserId(enrollmentMeta.contactEmail, signedIn?.id);

    // Backlog #38: the page's seat rule, for every player on this transfer.
    const sheet = await readEnrollmentSheet();
    if (sheet.status === "error") {
      return NextResponse.json({ error: RECORDS_UNAVAILABLE_ERROR }, { status: 503 });
    }
    if (sheet.status === "ok" && cohort) {
      const seatsRemaining = seatsFromSnapshot(sheet.snapshot, cohort.id, cohort.capacityMax);
      if (seatsRefuse(seatsRemaining, players.length)) {
        return NextResponse.json({ error: COHORT_FULL_ERROR }, { status: 409 });
      }
    }

    let first: Awaited<ReturnType<typeof recordEtransferIntent>> | null = null;
    let amountCents = 0;
    let creditCents = 0;
    let alreadyPaid = true;
    const claimedInviteIds: string[] = [];
    const claimedCreditBookingIds: string[] = [];

    for (const [i, player] of players.entries()) {
      const result = await recordEtransferIntent({
        cohortId,
        contactEmail: enrollmentMeta.contactEmail,
        participantName: player.name ?? enrollmentMeta.participantName ?? "",
        participantId: player.participantId ?? null,
        // The single-use token belongs to the first invite only.
        inviteToken: i === 0 ? inviteToken || null : null,
        // A later player with no token and no participant reuses a free
        // e-transfer row for this email, else gets one of their own — never
        // player one's (backlog #38).
        playerIndex: i,
        claimedInviteIds,
        claimedCreditBookingIds,
      });
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }
      claimedInviteIds.push(result.inviteId);
      if (result.creditBookingId) claimedCreditBookingIds.push(result.creditBookingId);
      if (!first) first = result;
      amountCents += result.amountCents;
      creditCents += result.creditCents;
      if (!result.alreadyPaid) alreadyPaid = false;

      if (!result.alreadyPaid) {
        const enrollmentId = await saveEnrollmentToSupabase({
          cohortId,
          program: programTitle,
          location: enrollmentMeta.location,
          participantName: player.name ?? enrollmentMeta.participantName,
          participantDob: player.dob ?? enrollmentMeta.participantDob,
          isMinor: player.isMinor ?? enrollmentMeta.isMinor,
          contactEmail: enrollmentMeta.contactEmail,
          contactPhone: enrollmentMeta.contactPhone,
          guardianName: enrollmentMeta.guardianName,
          guardianEmail: enrollmentMeta.guardianEmail,
          guardianPhone: enrollmentMeta.guardianPhone,
          consentSignedName: enrollmentMeta.consentSignedName,
          consentAgreedAt: enrollmentMeta.consentAgreedAt,
          waiverVersion: enrollmentMeta.waiverVersion,
          status: "pending",
          userId: ownerId,
        });
        if (i === 0) {
          // A new email gets the set-password link; an existing account gets
          // "Your spot is on your account" with the dashboard link (H5). The
          // e-transfer instructions themselves went out in recordEtransferIntent.
          await notifyEnrollmentAccount({
            email: enrollmentMeta.contactEmail,
            enrollmentId,
            userId: ownerId,
            enrolled: {
              programTitle:
                programs.find((p) => p.id === cohort?.programId)?.title ??
                programTitle ??
                "your program",
              cohortLabel: cohort?.label ?? cohortId,
              participantName: player.name ?? enrollmentMeta.participantName ?? null,
              paid: false,
            },
          }).catch((err) =>
            console.error(
              "Activation link after e-transfer intent failed (non-blocking):",
              err
            )
          );
        }
      }
    }

    if (!alreadyPaid) {
      // Flips every pending row for this cohort + email, so all the players
      // on one transfer move together.
      await setEnrollmentStatusByEmail({
        cohortId,
        email: enrollmentMeta.contactEmail,
        from: ["pending"],
        to: "pending_etransfer",
      });
    }

    return NextResponse.json({
      ok: true,
      alreadyPaid,
      amountCents,
      creditCents,
      recipientEmail: first?.ok ? first.recipientEmail : "",
      memo: first?.ok ? first.memo : "",
    });
  } catch (err) {
    console.error("E-transfer enroll API error:", err);
    return NextResponse.json({ error: "Couldn't record your e-transfer." }, { status: 500 });
  }
}
