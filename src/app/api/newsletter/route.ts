import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { subscribeToMailerLite } from "@/lib/mailerlite";
import {
  bodyTooLarge,
  checkBot,
  cleanText,
  isValidEmail,
  logBotDrop,
  REQUEST_TOO_LARGE,
  TEXT_LIMITS,
} from "@/lib/botCheck";

const TAB = "newsletter";
const HEADERS = ["timestamp", "email", "source"];

export async function POST(req: NextRequest) {
  try {
    // Bot protection (backlog #25): size cap, then the bot check before
    // anything else. A tripped check gets the real success response.
    const raw = await req.text();
    if (bodyTooLarge(raw, req.headers.get("content-length"))) {
      return NextResponse.json({ error: REQUEST_TOO_LARGE }, { status: 400 });
    }
    const parsed = JSON.parse(raw);
    const verdict = checkBot(parsed);
    if (verdict.bot) {
      logBotDrop("newsletter", verdict.reason);
      return NextResponse.json({ ok: true });
    }
    const body = {
      email: cleanText(parsed?.email, TEXT_LIMITS.email),
      source: cleanText(parsed?.source, TEXT_LIMITS.short),
    };
    if (!isValidEmail(body.email)) {
      return NextResponse.json({ error: "Please provide a valid email." }, { status: 400 });
    }

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

    // Ensure header row exists
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

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${TAB}!A:C`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[
          new Date().toISOString(),
          body.email,
          body.source ?? "homepage_email_capture",
        ]],
      },
    });

    await subscribeToMailerLite(body.email);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Newsletter API error:", err);
    return NextResponse.json({ error: "Failed to save email." }, { status: 500 });
  }
}
