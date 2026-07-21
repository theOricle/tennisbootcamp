import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { subscribeToMailerLite } from "@/lib/mailerlite";
import { recommendPrograms } from "@/lib/recommend";
import { sendRecommendationEmail } from "@/lib/email";
import {
  availabilityToCompactString,
  availabilityToLegacySlots,
} from "@/lib/availability";
import { tentativeLevelLabel } from "@/lib/level";

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
    // Columns 1–14 are frozen (never reorder or remove).
    // Columns 15–17 were added 2026-05-23 (additive only).
    const HEADERS = [
      "timestamp", "name", "email", "phone", "who", "level",
      "goals", "programs", "area", "notes", "newsletter",
      "priority_score", "lead_type", "follow_up_status",
      "preferred_locations", "availability", "recommended_program",
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

    // col 9 (area): accept new preferredLocationIds array or legacy area string
    const areaValue = body.area
      ? String(body.area)
      : Array.isArray(body.preferredLocationIds)
      ? body.preferredLocationIds.join(", ")
      : "";

    // col 16 (availability): the frozen column stays "availability"; only the
    // cell format is upgraded. New clients send the structured grid object
    // ({days,v:1}) → compact self-identifying string ("v1:mon:eve;wed:mor,eve").
    // Legacy clients that sent a slot array still serialize the old way.
    const availabilityValue = Array.isArray(body.availability)
      ? body.availability.join(", ")
      : body.availability
      ? availabilityToCompactString(body.availability)
      : "";

    // Legacy slot list for the rule-based recommender (unchanged engine).
    const availabilitySlots = Array.isArray(body.availability)
      ? body.availability
      : availabilityToLegacySlots(body.availability);

    const row = [
      new Date().toISOString(),
      body.name ?? "",
      body.email ?? "",
      body.phone ?? "",
      body.who ?? "",
      body.level ?? "",
      Array.isArray(body.goals) ? body.goals.join(", ") : "",
      Array.isArray(body.programs) ? body.programs.join(", ") : "",
      areaValue,
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
      // cols 15–17 (additive 2026-05-23)
      Array.isArray(body.preferredLocationIds) ? body.preferredLocationIds.join(", ") : "",
      availabilityValue,
      body.recommendedProgram ?? "",
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${tabName}!A:Q`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [row] },
    });

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
