import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { subscribeToMailerLite } from "@/lib/mailerlite";
import { recommendPrograms } from "@/lib/recommend";
import { sendRecommendationEmail } from "@/lib/email";
import { tentativeLevelLabel } from "@/lib/level";
import {
  INTAKE_HEADERS,
  INTAKE_APPEND_RANGE_COLUMNS,
  buildIntakeRow,
  intakeAvailabilitySlots,
} from "@/lib/intakeRow";
import { provisionIntakeAccount } from "@/lib/intakeAccount";

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

    // Ensure header row exists and is complete before appending data.
    // The 17-column shape is frozen — see src/lib/intakeRow.ts.
    const HEADERS = [...INTAKE_HEADERS];

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

    // Legacy slot list for the rule-based recommender (unchanged engine).
    const availabilitySlots = intakeAvailabilitySlots(body);

    const row = buildIntakeRow(body, new Date().toISOString());

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${tabName}!${INTAKE_APPEND_RANGE_COLUMNS}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [row] },
    });

    // Account + availability (backlog #13). Runs only after the Sheet append
    // succeeded, only when Supabase is configured, and can never fail the
    // intake response — provisionIntakeAccount logs and swallows everything.
    if (typeof body.email === "string" && body.email.trim()) {
      await provisionIntakeAccount({
        email: body.email,
        name: typeof body.name === "string" ? body.name : null,
        phone: typeof body.phone === "string" ? body.phone : null,
        availability: body.availability,
      });
    }

    if (body.newsletter === true) {
      await subscribeToMailerLite(body.email ?? "", body.name);
    }

    // Fire-and-forget recommendation email — never block the response.
    if (process.env.RESEND_API_KEY && body.email) {
      const recs = recommendPrograms({
        who: body.who,
        level: body.level,
        goals: Array.isArray(body.goals) ? body.goals : [],
        programs: Array.isArray(body.programs) ? body.programs : [],
        preferredLocationIds: Array.isArray(body.preferredLocationIds) ? body.preferredLocationIds : [],
        availability: availabilitySlots,
      });
      if (recs.length > 0) {
        const tentativeLevel = tentativeLevelLabel(body.level);
        sendRecommendationEmail(body.email, body.name ?? "", recs, tentativeLevel).catch(
          (err) => {
            console.error("Recommendation email failed (non-blocking):", err);
          }
        );
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Intake API error:", err);
    return NextResponse.json({ error: "Failed to submit intake." }, { status: 500 });
  }
}
