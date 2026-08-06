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
