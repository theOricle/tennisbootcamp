import "server-only";
import { google, type sheets_v4 } from "googleapis";

// Ops view for Sina — additive tab, never touches the frozen intake/enrollment tabs.
// The `assessments` tab must be created manually in the Sheet before the first
// production booking (same rule as the `newsletter` tab). We write the header row
// automatically on first use, but the tab itself must already exist.

const TAB = "assessments";

// Columns 1–11 are frozen (never reorder, rename, or remove).
// Columns 12–16 were appended 2026-09-08 for household accounts (backlog #11)
// — additive only, after the last existing column, same rule as every other
// Sheets extension here.
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
  // ── appended (household accounts) ──
  "account_email",
  "account_name",
  "participant_name",
  "participant_relationship",
  "participant_id",
] as const;

/** A–P: the 11 frozen columns plus the 5 appended household columns. */
const RANGE = "A:P";
/** The last frozen column — the in-place status update never writes past it. */
const FROZEN_END_COL = "K";

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
  /** The player's name (col 2) — the participant, not the account holder. */
  name: string;
  /** The account holder's email (col 3) — where every email goes. */
  email: string;
  phone?: string | null;
  slotDate: string;
  slotStart: string;
  status: string;
  paid: boolean;
  levelResult?: string | number | null;
  coachNotes?: string | null;
  creditStatus?: string;
  // ── household columns (appended) ──
  accountEmail?: string | null;
  accountName?: string | null;
  participantName?: string | null;
  participantRelationship?: string | null;
  participantId?: string | null;
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
    // ── appended (household accounts) ──
    r.accountEmail ?? r.email ?? "",
    r.accountName ?? "",
    r.participantName ?? r.name ?? "",
    r.participantRelationship ?? "",
    r.participantId ?? "",
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
      range: `${TAB}!${RANGE}`,
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
  /** Narrows the match when two people on one account both have bookings. */
  participantId?: string | null;
  slotDate: string;
  slotStart: string;
  status: string;
  paid?: boolean;
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
      range: `${TAB}!${RANGE}`,
    });
    const rows = res.data.values ?? [];
    const email = match.email.trim().toLowerCase();

    // Scan bottom-up so we hit the most recent matching booking first. The
    // participant id (col 16) is the tie-break when one account has several
    // players; rows written before that column existed match on email alone.
    const participantId = (match.participantId ?? "").trim();
    let target = -1;
    for (let i = rows.length - 1; i >= 1; i--) {
      const row = rows[i];
      const rowParticipant = (row[15] ?? "").trim();
      const sameSlot =
        (row[4] ?? "") === match.slotDate && (row[5] ?? "") === match.slotStart;
      if (!sameSlot) continue;
      if (participantId && rowParticipant) {
        if (rowParticipant !== participantId) continue;
      } else if ((row[2] ?? "").trim().toLowerCase() !== email) {
        continue;
      }
      target = i;
      break;
    }
    if (target === -1) return;

    const rowNumber = target + 1; // 1-based sheet row
    const existing = rows[target];
    const updated = [...existing];
    updated[6] = match.status;
    if (match.paid != null) updated[7] = match.paid ? "yes" : "no";
    if (match.levelResult != null) updated[8] = String(match.levelResult);
    if (match.coachNotes != null) updated[9] = match.coachNotes;
    if (match.creditStatus != null) updated[10] = match.creditStatus;

    // Only the frozen block is rewritten in place; the appended household
    // columns were set at append time and are left exactly as they are.
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${TAB}!A${rowNumber}:${FROZEN_END_COL}${rowNumber}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [updated.slice(0, 11)] },
    });
  } catch (err) {
    console.error("updateAssessmentRow failed (non-blocking):", err);
  }
}
