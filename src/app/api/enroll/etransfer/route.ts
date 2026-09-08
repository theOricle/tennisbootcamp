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

    const result = await recordEtransferIntent({
      cohortId,
      contactEmail: enrollmentMeta.contactEmail,
      participantName: enrollmentMeta.participantName ?? "",
      inviteToken: inviteToken || null,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    if (!result.alreadyPaid) {
      const enrollmentId = await saveEnrollmentToSupabase({
        cohortId,
        program: programTitle,
        location: enrollmentMeta.location,
        participantName: enrollmentMeta.participantName,
        participantDob: enrollmentMeta.participantDob,
        isMinor: enrollmentMeta.isMinor,
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
      await issueActivationLink(enrollmentMeta.contactEmail, enrollmentId).catch((err) =>
        console.error("Activation link after e-transfer intent failed (non-blocking):", err)
      );
      await setEnrollmentStatusByEmail({
        cohortId,
        email: enrollmentMeta.contactEmail,
        from: ["pending"],
        to: "pending_etransfer",
      });

    }

    return NextResponse.json({
      ok: true,
      alreadyPaid: result.alreadyPaid,
      amountCents: result.amountCents,
      creditCents: result.creditCents,
      recipientEmail: result.recipientEmail,
      memo: result.memo,
    });
  } catch (err) {
    console.error("E-transfer enroll API error:", err);
    return NextResponse.json({ error: "Couldn't record your e-transfer." }, { status: 500 });
  }
}
