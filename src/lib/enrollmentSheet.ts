import "server-only";
import { google, type sheets_v4 } from "googleapis";
import { enrollmentRowsToFlip } from "@/lib/enrollGate";

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
// A:U — the frozen columns plus the household block, whose `participant_id`
// (col 21) scopes a flip to one player when the invite names one (#38).
const READ_RANGE = "A:U";

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
  /**
   * This player's rows first (the `participant_id` column), so marking one
   * sibling's invite paid does not flip the whole household; when no row
   * carries that id the flip falls back to every row for the email
   * (enrollmentRowsToFlip, src/lib/enrollGate.ts).
   */
  participantId?: string | null;
}): Promise<number[]> {
  try {
    const sheets = getSheets();
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    if (!sheets || !spreadsheetId) return [];

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${TAB}!${READ_RANGE}`,
    });
    const all = (res.data.values ?? []) as string[][];
    if (all.length < 2) return [];
    const changed = enrollmentRowsToFlip(
      { header: all[0], rows: all.slice(1) },
      {
        cohortId: params.cohortId,
        email: params.email,
        from: params.from,
        participantId: params.participantId,
      }
    );
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
