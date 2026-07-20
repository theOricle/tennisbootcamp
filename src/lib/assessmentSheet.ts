import "server-only";
import { google, type sheets_v4 } from "googleapis";

// Ops view for Sina — additive tab, never touches the frozen intake/enrollment tabs.
// The `assessments` tab must be created manually in the Sheet before the first
// production booking (same rule as the `newsletter` tab). We write the header row
// automatically on first use, but the tab itself must already exist.

const TAB = "assessments";

const HEADERS = [
  "timestamp",
  "name",
  "email",
  "phone",
  "slot_date",
  "slot_start",
  "status",
  "paid",
  "level_result",
  "coach_notes",
  "credit_status",
] as const;

function getSheets(): sheets_v4.Sheets | null {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!spreadsheetId || !clientEmail || !rawKey) return null;

  const privateKey = rawKey.replace(/\\n/g, "\n").replace(/\r/g, "").trim();
  if (!privateKey.includes("-----BEGIN")) return null;

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

async function ensureHeader(sheets: sheets_v4.Sheets, spreadsheetId: string) {
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
      requestBody: { values: [HEADERS as unknown as string[]] },
    });
  }
}

export type AssessmentSheetRow = {
  name: string;
  email: string;
  phone?: string | null;
  slotDate: string;
  slotStart: string;
  status: string;
  paid: boolean;
  levelResult?: string | number | null;
  coachNotes?: string | null;
  creditStatus?: string;
};

function toRow(r: AssessmentSheetRow): string[] {
  return [
    new Date().toISOString(),
    r.name ?? "",
    r.email ?? "",
    r.phone ?? "",
    r.slotDate ?? "",
    r.slotStart ?? "",
    r.status ?? "",
    r.paid ? "yes" : "no",
    r.levelResult != null ? String(r.levelResult) : "",
    r.coachNotes ?? "",
    r.creditStatus ?? "unused",
  ];
}

/** Append a booking row to the assessments tab. Best-effort — never throws. */
export async function appendAssessmentRow(r: AssessmentSheetRow): Promise<void> {
  try {
    const sheets = getSheets();
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    if (!sheets || !spreadsheetId) return;
    await ensureHeader(sheets, spreadsheetId);
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${TAB}!A:K`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [toRow(r)] },
    });
  } catch (err) {
    console.error("appendAssessmentRow failed (non-blocking):", err);
  }
}

/**
 * Update the latest matching assessment row in place (status / level / notes /
 * credit). Matches on email + slot_date + slot_start. Best-effort — never throws.
 */
export async function updateAssessmentRow(match: {
  email: string;
  slotDate: string;
  slotStart: string;
  status: string;
  levelResult?: string | number | null;
  coachNotes?: string | null;
  creditStatus?: string;
}): Promise<void> {
  try {
    const sheets = getSheets();
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    if (!sheets || !spreadsheetId) return;

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${TAB}!A:K`,
    });
    const rows = res.data.values ?? [];
    const email = match.email.trim().toLowerCase();

    // Scan bottom-up so we hit the most recent matching booking first.
    let target = -1;
    for (let i = rows.length - 1; i >= 1; i--) {
      const row = rows[i];
      if (
        (row[2] ?? "").trim().toLowerCase() === email &&
        (row[4] ?? "") === match.slotDate &&
        (row[5] ?? "") === match.slotStart
      ) {
        target = i;
        break;
      }
    }
    if (target === -1) return;

    const rowNumber = target + 1; // 1-based sheet row
    const existing = rows[target];
    const updated = [...existing];
    updated[6] = match.status;
    if (match.levelResult != null) updated[8] = String(match.levelResult);
    if (match.coachNotes != null) updated[9] = match.coachNotes;
    if (match.creditStatus != null) updated[10] = match.creditStatus;

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${TAB}!A${rowNumber}:K${rowNumber}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [updated] },
    });
  } catch (err) {
    console.error("updateAssessmentRow failed (non-blocking):", err);
  }
}
