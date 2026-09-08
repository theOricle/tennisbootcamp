import { NextRequest, NextResponse } from "next/server";
import { recordEtransferIntent } from "@/lib/cohortActions";
import {
  saveEnrollmentToSupabase,
  issueActivationLink,
} from "@/lib/supabase/enrollmentActions";
import { setEnrollmentStatusByEmail } from "@/lib/enrollmentSheet";

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

    // One player per invite: a parent sending one transfer for two children
    // still ends up with two invites the coach marks paid, and the amounts
    // add up across them (each carries its own $20 credit or none).
    const players: EnrollParticipant[] =
      enrollmentMeta.participants && enrollmentMeta.participants.length > 0
        ? enrollmentMeta.participants
        : [
            {
              name: enrollmentMeta.participantName,
              dob: enrollmentMeta.participantDob,
              isMinor: enrollmentMeta.isMinor,
            },
          ];

    let first: Awaited<ReturnType<typeof recordEtransferIntent>> | null = null;
    let amountCents = 0;
    let creditCents = 0;
    let alreadyPaid = true;

    for (const [i, player] of players.entries()) {
      const result = await recordEtransferIntent({
        cohortId,
        contactEmail: enrollmentMeta.contactEmail,
        participantName: player.name ?? enrollmentMeta.participantName ?? "",
        participantId: player.participantId ?? null,
        // The single-use token belongs to the first invite only.
        inviteToken: i === 0 ? inviteToken || null : null,
      });
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }
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
        });
        if (i === 0) {
          await issueActivationLink(enrollmentMeta.contactEmail, enrollmentId).catch(
            (err) =>
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
