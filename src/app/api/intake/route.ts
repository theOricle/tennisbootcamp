import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const tabName = process.env.GOOGLE_SHEETS_TAB_NAME ?? "Sheet1";

    const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
    if (!spreadsheetId || !clientEmail || !rawKey) {
      return NextResponse.json(
        { error: "Google Sheets environment variables are not configured." },
        { status: 500 }
      );
    }

    // Normalize the private key: handle \\n literals, \r characters, and surrounding whitespace
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

    // Ensure header row exists and is complete before appending data
    const HEADERS = [
      "timestamp", "name", "email", "phone", "who", "level",
      "goals", "programs", "area", "notes", "newsletter",
      "priority_score", "lead_type", "follow_up_status",
    ];

    const headerRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${tabName}!1:1`,
    });

    const existingHeaders = headerRes.data.values?.[0] ?? [];
    const headersComplete = HEADERS.every((h, i) => existingHeaders[i] === h);

    if (!headersComplete) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${tabName}!A1`,
        valueInputOption: "RAW",
        requestBody: { values: [HEADERS] },
      });
    }

    const row = [
      new Date().toISOString(),
      body.name ?? "",
      body.email ?? "",
      body.phone ?? "",
      body.who ?? "",
      body.level ?? "",
      Array.isArray(body.goals) ? body.goals.join(", ") : "",
      Array.isArray(body.programs) ? body.programs.join(", ") : "",
      body.area ?? "",
      body.notes ?? "",
      body.newsletter === true ? "yes" : body.newsletter === false ? "no" : "",
      // priority_score
      body.level === "elite" ? "3"
        : (Array.isArray(body.programs) && (body.programs.includes("private") || body.programs.length > 1)) ? "2"
        : "1",
      // lead_type
      body.level === "elite" ? "elite"
        : (Array.isArray(body.programs) && (body.programs.includes("private") || body.programs.length > 1)) ? "high-intent"
        : "standard",
      // follow_up_status
      "new",
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${tabName}!A:N`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [row] },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Intake API error:", err);
    return NextResponse.json({ error: "Failed to submit intake." }, { status: 500 });
  }
}
