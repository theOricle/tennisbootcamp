import "server-only";
import { google, type sheets_v4 } from "googleapis";

// Additive write to the enrollments tab: the `assessment_credit` column (Q,
// col 17) appended after the frozen 16-column layout that ends at `status` (P).
// Never reorders or renames — same additive rule as every Sheets extension.

const TAB = "enrollments";
const CREDIT_COL = "Q";
const CREDIT_HEADER = "assessment_credit";

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

/**
 * Record the applied assessment credit ("20.00") on an enrollment row.
 * Writes the Q-column header once if missing. Best-effort — never throws.
 */
export async function setEnrollmentCredit(
  rowNumber: number,
  amount: string
): Promise<void> {
  try {
    const sheets = getSheets();
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    if (!sheets || !spreadsheetId || !rowNumber) return;

    const headerRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${TAB}!${CREDIT_COL}1`,
    });
    if (headerRes.data.values?.[0]?.[0] !== CREDIT_HEADER) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${TAB}!${CREDIT_COL}1`,
        valueInputOption: "RAW",
        requestBody: { values: [[CREDIT_HEADER]] },
      });
    }

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${TAB}!${CREDIT_COL}${rowNumber}`,
      valueInputOption: "RAW",
      requestBody: { values: [[amount]] },
    });
  } catch (err) {
    console.error("setEnrollmentCredit failed (non-blocking):", err);
  }
}

// ─── Status column helpers (e-transfer rail, backlog #12) ─────────────────────
// The `status` column is P (col 16) in the frozen layout. Card payments write
// it from the checkout/webhook routes by row number (carried in Stripe
// metadata); the e-transfer path resolves rows by cohort + contact email
// instead — never by a client-supplied row number. Best-effort.

const STATUS_COL = "P";
const READ_RANGE = "A:P";

/**
 * Flip every enrollment row for (cohort_id, contact_email) whose status is in
 * `from` to `to`. Returns the row numbers changed so the caller can also
 * record the assessment credit on them. Best-effort — never throws.
 */
export async function setEnrollmentStatusByEmail(params: {
  cohortId: string;
  email: string;
  from: string[];
  to: string;
}): Promise<number[]> {
  try {
    const sheets = getSheets();
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    if (!sheets || !spreadsheetId) return [];

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${TAB}!${READ_RANGE}`,
    });
    const rows = res.data.values ?? [];
    if (rows.length < 2) return [];
    const header = rows[0];
    const cohortCol = header.indexOf("cohort_id");
    const emailCol = header.indexOf("contact_email");
    const statusCol = header.indexOf("status");
    if (cohortCol === -1 || emailCol === -1 || statusCol === -1) return [];

    const target = params.email.trim().toLowerCase();
    const fromSet = new Set(params.from);
    const changed: number[] = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (
        row[cohortCol] === params.cohortId &&
        String(row[emailCol] ?? "").trim().toLowerCase() === target &&
        fromSet.has(String(row[statusCol] ?? ""))
      ) {
        changed.push(i + 1); // 1-based sheet row
      }
    }
    if (changed.length === 0) return [];

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: "RAW",
        data: changed.map((rowNumber) => ({
          range: `${TAB}!${STATUS_COL}${rowNumber}`,
          values: [[params.to]],
        })),
      },
    });
    return changed;
  } catch (err) {
    console.error("setEnrollmentStatusByEmail failed (non-blocking):", err);
    return [];
  }
}
