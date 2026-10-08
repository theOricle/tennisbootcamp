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
import {
  findInviteRefByToken,
  markInvitePaidAndMaybeConfirm,
} from "@/lib/cohortActions";
import {
  cohortRequiresInvite,
  inviteSettlement,
  resolveEnrollGate,
} from "@/lib/enrollGate";
import {
  checkoutInviteLink,
  enrollReturnUrls,
  inviteResumeCookie,
} from "@/lib/checkoutInvite";

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

    // Backlog #38: the enroll page's gate, run again here before anything is
    // created. A cohort the page would not render is a 404; a private cohort
    // needs an invite in this cohort that can still be paid (or, tier-gated,
    // a signed-in player inside its level band) — else 403, no Stripe session.
    const gate = await resolveEnrollGate(cohort, inviteToken, { payable: true });
    if (!gate.decision.allowed) {
      return NextResponse.json(
        gate.decision.status === 404
          ? { error: "Cohort not found." }
          : { error: "This group is invite-only." },
        { status: gate.decision.status }
      );
    }

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
      inviteId,
    });

    if (isMockMode) {
      // No webhook in mock mode — mark paid immediately in Sheets + issue invite
      for (const rowNumber of rowNumbers.length > 0 ? rowNumbers : [enrollmentRowNumber]) {
        await markEnrollmentStatus(rowNumber, "test_paid");
      }
      if (enrollmentMeta?.contactEmail) {
        // Non-blocking: an uncaught refusal here would skip the credit and
        // invite-confirmation tail below and turn a completed mock checkout
        // into a 500 via this route's outer catch.
        await issueActivationLink(
          enrollmentMeta.contactEmail,
          supabaseEnrollmentId
        ).catch((err) =>
          console.error("Activation link failed (non-blocking):", err)
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
      // Same settlement rule as the webhook (backlog #38): invite id, else
      // the named participant, else email only on a cohort anyone may join.
      for (const p of players) {
        const by = inviteSettlement({
          inviteId,
          participantId: p.participantId ?? undefined,
          contactEmail: enrollmentMeta?.contactEmail,
          requiresInvite: cohortRequiresInvite(cohort),
          isFirstPlayer: p === players[0],
        });
        if (!by) continue;
        await markInvitePaidAndMaybeConfirm({ cohortId, ...by }).catch((err) =>
          console.error("Invite confirmation failed (non-blocking):", err)
        );
      }
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
