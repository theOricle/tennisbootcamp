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
    const seatCents = cohort?.priceCents ?? priceCents ?? 0;

    // Every player this payment covers. A body without the household field is
    // a single-player enrollment — one seat, exactly as before.
    const players: CheckoutParticipant[] =
      enrollmentMeta?.participants && enrollmentMeta.participants.length > 0
        ? enrollmentMeta.participants
        : [
            {
              name: enrollmentMeta?.participantName,
              rowNumber: enrollmentRowNumber,
            },
          ];
    const rowNumbers = players
      .map((p) => p.rowNumber ?? null)
      .filter((n): n is number => typeof n === "number" && n > 0);
    const chargeCents = seatCents * players.length;

    // The $20 assessment credit is per player: two children assessed under one
    // parent's email bring $40 off between them.
    const credits: { rowNumber: number | null; bookingId: string; cents: number }[] = [];
    if (enrollmentMeta?.contactEmail) {
      for (const p of players) {
        const found = await findUnusedCredit(enrollmentMeta.contactEmail, {
          participantId: p.participantId ?? null,
        });
        if (found && !credits.some((c) => c.bookingId === found.bookingId)) {
          credits.push({
            rowNumber: p.rowNumber ?? null,
            bookingId: found.bookingId,
            cents: found.creditCents,
          });
        }
      }
    }
    const discountCents = Math.min(
      credits.reduce((sum, c) => sum + c.cents, 0),
      chargeCents
    );
    const credit = credits[0] ?? null;

    const origin =
      req.headers.get("origin") ??
      process.env.NEXT_PUBLIC_SITE_URL ??
      "http://localhost:3000";

    const successUrl =
      `${origin}/enroll/${cohortId}/confirmed?row=${enrollmentRowNumber}` +
      (players.length > 1 ? `&players=${players.length}` : "") +
      (inviteToken ? "&invite=1" : "");
    const cancelUrl = `${origin}/enroll/${cohortId}${inviteToken ? `?invite=${inviteToken}` : ""}`;

    // Save to Supabase — one enrollment row per player (fire-and-forget on
    // error so it never breaks checkout).
    let supabaseEnrollmentId: string | null = null;
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
          status: isMockMode ? "test_paid" : "pending",
        });
        if (!supabaseEnrollmentId) supabaseEnrollmentId = id;
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
      discountCents,
      assessmentBookingId: credit?.bookingId,
      assessmentBookingIds: credits.map((c) => c.bookingId),
      participantIds: players
        .map((p) => p.participantId ?? "")
        .filter((id): id is string => Boolean(id)),
      inviteToken,
    });

    if (isMockMode) {
      // No webhook in mock mode — mark paid immediately in Sheets + issue invite
      for (const rowNumber of rowNumbers.length > 0 ? rowNumbers : [enrollmentRowNumber]) {
        await markEnrollmentStatus(rowNumber, "test_paid");
      }
      if (enrollmentMeta?.contactEmail) {
        await issueActivationLink(
          enrollmentMeta.contactEmail,
          supabaseEnrollmentId
        );
      }
      // Mirror the webhook's Phase 3 tail: credit applied + invite paid +
      // minimum-to-run confirmation — once per player.
      for (const c of credits) {
        await markCreditApplied(c.bookingId);
        if (c.rowNumber) {
          await setEnrollmentCredit(c.rowNumber, (c.cents / 100).toFixed(2));
        }
      }
      if (inviteToken || enrollmentMeta?.contactEmail) {
        for (const p of players) {
          await markInvitePaidAndMaybeConfirm({
            cohortId,
            email: enrollmentMeta?.contactEmail,
            participantId: p.participantId ?? undefined,
            // The single-use token belongs to the first invite only.
            inviteToken: p === players[0] ? inviteToken : undefined,
          }).catch((err) =>
            console.error("Invite confirmation failed (non-blocking):", err)
          );
        }
      }
    }

    return NextResponse.json({ sessionUrl });
  } catch (err) {
    console.error("Checkout API error:", err);
    return NextResponse.json({ error: "Checkout failed." }, { status: 500 });
  }
}
