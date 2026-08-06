import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { isMockMode, createCheckoutSession } from "@/lib/payments";
import {
  saveEnrollmentToSupabase,
  issueActivationLink,
} from "@/lib/supabase/enrollmentActions";
import { getCohortById } from "@/lib/cohortsDb";
import { findUnusedCredit, markCreditApplied } from "@/lib/assessmentCredit";
import { setEnrollmentCredit } from "@/lib/enrollmentSheet";
import { markInvitePaidAndMaybeConfirm } from "@/lib/cohortActions";

const TAB = "enrollments";
// "status" is column P (index 15, 1-based col 16)
const STATUS_COL = "P";

async function markEnrollmentStatus(rowNumber: number, status: string) {
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
    requestBody: { values: [[status]] },
  });
}

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

    // The server's price wins over whatever the client sent.
    const cohort = await getCohortById(cohortId);
    const chargeCents = cohort?.priceCents ?? priceCents ?? 0;

    // $20 assessment credit: completed + paid + unused, looked up by enrollee
    // email. Applied as a Stripe Checkout discount (subtracted in mock mode).
    const credit = enrollmentMeta?.contactEmail
      ? await findUnusedCredit(enrollmentMeta.contactEmail)
      : null;
    const discountCents = credit ? Math.min(credit.creditCents, chargeCents) : 0;

    const origin =
      req.headers.get("origin") ??
      process.env.NEXT_PUBLIC_SITE_URL ??
      "http://localhost:3000";

    const successUrl =
      `${origin}/enroll/${cohortId}/confirmed?row=${enrollmentRowNumber}` +
      (inviteToken ? "&invite=1" : "");
    const cancelUrl = `${origin}/enroll/${cohortId}${inviteToken ? `?invite=${inviteToken}` : ""}`;

    // Save to Supabase (fire-and-forget on error so it never breaks checkout)
    let supabaseEnrollmentId: string | null = null;
    if (enrollmentMeta?.contactEmail) {
      supabaseEnrollmentId = await saveEnrollmentToSupabase({
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
        status: isMockMode ? "test_paid" : "pending",
      });
    }

    const { sessionUrl } = await createCheckoutSession({
      cohortId,
      programTitle: programTitle ?? "Tennis Bootcamp",
      priceCents: chargeCents,
      enrollmentRowNumber,
      successUrl,
      cancelUrl,
      contactEmail: enrollmentMeta?.contactEmail,
      supabaseEnrollmentId: supabaseEnrollmentId ?? undefined,
      discountCents,
      assessmentBookingId: credit?.bookingId,
      inviteToken,
    });

    if (isMockMode) {
      // No webhook in mock mode — mark paid immediately in Sheets + issue invite
      await markEnrollmentStatus(enrollmentRowNumber, "test_paid");
      if (enrollmentMeta?.contactEmail) {
        await issueActivationLink(
          enrollmentMeta.contactEmail,
          supabaseEnrollmentId
        );
      }
      // Mirror the webhook's Phase 3 tail: credit applied + invite paid +
      // minimum-to-run confirmation.
      if (credit && discountCents > 0) {
        await markCreditApplied(credit.bookingId);
        await setEnrollmentCredit(
          enrollmentRowNumber,
          (discountCents / 100).toFixed(2)
        );
      }
      if (inviteToken || enrollmentMeta?.contactEmail) {
        await markInvitePaidAndMaybeConfirm({
          cohortId,
          email: enrollmentMeta?.contactEmail,
          inviteToken,
        }).catch((err) =>
          console.error("Invite confirmation failed (non-blocking):", err)
        );
      }
    }

    return NextResponse.json({ sessionUrl });
  } catch (err) {
    console.error("Checkout API error:", err);
    return NextResponse.json({ error: "Checkout failed." }, { status: 500 });
  }
}
