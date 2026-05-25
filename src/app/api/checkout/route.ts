import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { isMockMode, createCheckoutSession } from "@/lib/payments";

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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { cohortId, programTitle, priceCents, enrollmentRowNumber } = body;

    if (!cohortId || enrollmentRowNumber == null) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    const origin =
      req.headers.get("origin") ??
      process.env.NEXT_PUBLIC_SITE_URL ??
      "http://localhost:3000";

    const successUrl = `${origin}/enroll/${cohortId}/confirmed?row=${enrollmentRowNumber}`;
    const cancelUrl = `${origin}/enroll/${cohortId}`;

    const { sessionUrl } = await createCheckoutSession({
      cohortId,
      programTitle: programTitle ?? "Tennis Bootcamp",
      priceCents: priceCents ?? 0,
      enrollmentRowNumber,
      successUrl,
      cancelUrl,
    });

    if (isMockMode) {
      // No webhook in mock mode — mark paid immediately
      await markEnrollmentStatus(enrollmentRowNumber, "test_paid");
    }

    return NextResponse.json({ sessionUrl });
  } catch (err) {
    console.error("Checkout API error:", err);
    return NextResponse.json({ error: "Checkout failed." }, { status: 500 });
  }
}
