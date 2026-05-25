import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";

const TAB = "enrollments";

const HEADERS = [
  "timestamp",
  "cohort_id",
  "program",
  "location",
  "participant_name",
  "participant_dob",
  "is_minor",
  "contact_email",
  "contact_phone",
  "guardian_name",
  "guardian_email",
  "guardian_phone",
  "consent_signed_name",
  "consent_agreed_at",
  "waiver_version",
  "status",
];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

    if (!spreadsheetId || !clientEmail || !rawKey) {
      return NextResponse.json(
        { error: "Google Sheets environment variables are not configured." },
        { status: 500 }
      );
    }

    const privateKey = rawKey
      .replace(/\\n/g, "\n")
      .replace(/\r/g, "")
      .trim();

    if (!privateKey.includes("-----BEGIN")) {
      throw new Error("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY does not appear to be a valid PEM key.");
    }

    const auth = new google.auth.JWT({
      email: clientEmail,
      key: privateKey,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    const sheets = google.sheets({ version: "v4", auth });

    // Ensure header row exists and is complete
    const headerRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${TAB}!1:1`,
    });
    const existing = headerRes.data.values?.[0] ?? [];
    const complete = HEADERS.every((h, i) => existing[i] === h);
    if (!complete) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${TAB}!A1`,
        valueInputOption: "RAW",
        requestBody: { values: [HEADERS] },
      });
    }

    const row = [
      new Date().toISOString(),
      body.cohortId ?? "",
      body.program ?? "",
      body.location ?? "",
      body.participantName ?? "",
      body.participantDob ?? "",
      body.isMinor ? "yes" : "no",
      body.contactEmail ?? "",
      body.contactPhone ?? "",
      body.guardianName ?? "",
      body.guardianEmail ?? "",
      body.guardianPhone ?? "",
      body.consentSignedName ?? "",
      body.consentAgreedAt ?? "",
      body.waiverVersion ?? "",
      "pending",
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${TAB}!A:P`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [row] },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Enroll API error:", err);
    return NextResponse.json({ error: "Failed to save enrollment." }, { status: 500 });
  }
}
