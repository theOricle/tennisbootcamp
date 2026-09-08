import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import {
  currentUser,
  resolveSubmissionParticipant,
  type ParticipantInput,
} from "@/lib/household";

const TAB = "enrollments";

// Columns 1–16 are frozen (never reorder, rename, or remove).
// Column 17 (assessment_credit) was appended in Phase 3.
// Columns 18–21 were appended 2026-09-08 for household accounts (backlog #11).
// `participant_name` is NOT repeated in that block — it is already column 5 on
// this tab, and a duplicate column in a sheet Sina reads by eye helps nobody.
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
  // ── appended (Phase 3) ──
  "assessment_credit",
  // ── appended (household accounts) ──
  "account_email",
  "account_name",
  "participant_relationship",
  "participant_id",
];

/** A–U: the 16 frozen columns, the credit column, and the household block. */
const APPEND_RANGE = "A:U";

type EnrollParticipant = {
  name?: unknown;
  dob?: unknown;
  isMinor?: unknown;
  participantId?: unknown;
  relationship?: unknown;
};

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

    // One row per player (backlog #11). A legacy body with a single
    // participantName still produces exactly one row, unchanged.
    const incoming: EnrollParticipant[] = Array.isArray(body.participants)
      ? (body.participants as EnrollParticipant[])
      : [
          {
            name: body.participantName,
            dob: body.participantDob,
            isMinor: body.isMinor,
            participantId: body.participantId,
          },
        ];

    const signedIn = await currentUser();
    const holderEmail = signedIn?.email || String(body.contactEmail ?? "").trim();
    const holderName = String(
      body.guardianName || body.accountName || body.participantName || ""
    ).trim();

    const timestamp = new Date().toISOString();
    const rows: unknown[][] = [];
    const resolved: {
      name: string;
      participantId: string | null;
      isMinor: boolean;
    }[] = [];

    for (const p of incoming) {
      const who = await resolveSubmissionParticipant({
        signedInUserId: signedIn?.id ?? null,
        participantId: p.participantId,
        participant: {
          name: p.name,
          relationship: p.relationship,
          isMinor: p.isMinor,
        } as ParticipantInput,
        holderName,
        holderEmail,
        holderPhone: body.contactPhone ? String(body.contactPhone) : null,
        defaultName: String(p.name ?? body.participantName ?? "").trim(),
      }).catch(() => null);

      const playerName =
        who?.participantName || String(p.name ?? body.participantName ?? "");
      const isMinor = p.isMinor === true;

      rows.push([
        timestamp,
        body.cohortId ?? "",
        body.program ?? "",
        body.location ?? "",
        playerName,
        p.dob ?? body.participantDob ?? "",
        isMinor ? "yes" : "no",
        body.contactEmail ?? "",
        body.contactPhone ?? "",
        body.guardianName ?? "",
        body.guardianEmail ?? "",
        body.guardianPhone ?? "",
        body.consentSignedName ?? "",
        body.consentAgreedAt ?? "",
        body.waiverVersion ?? "",
        "pending",
        // col 17 — set later by the payment path when a credit applies
        "",
        // ── household block ──
        who?.accountEmail ?? body.contactEmail ?? "",
        who?.accountName ?? holderName,
        who?.relationship ?? "",
        who?.participantId ?? "",
      ]);
      resolved.push({
        name: playerName,
        participantId: who?.participantId ?? null,
        isMinor,
      });
    }

    const appendRes = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${TAB}!${APPEND_RANGE}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: rows },
    });

    // Parse the appended row numbers from the updated range
    // (e.g. "enrollments!A5:U6" → [5, 6]).
    const updatedRange = appendRes.data.updates?.updatedRange ?? "";
    const bounds = updatedRange.match(/!\D+(\d+):\D+(\d+)$/);
    const first = bounds ? parseInt(bounds[1], 10) : null;
    const last = bounds ? parseInt(bounds[2], 10) : first;
    const rowNumbers: number[] = [];
    if (first != null && last != null) {
      for (let n = first; n <= last; n++) rowNumbers.push(n);
    }

    return NextResponse.json({
      ok: true,
      // Kept for callers that only ever enrolled one person.
      rowNumber: rowNumbers[0] ?? null,
      rowNumbers,
      participants: resolved.map((r, i) => ({
        ...r,
        rowNumber: rowNumbers[i] ?? null,
      })),
    });
  } catch (err) {
    console.error("Enroll API error:", err);
    return NextResponse.json({ error: "Failed to save enrollment." }, { status: 500 });
  }
}
