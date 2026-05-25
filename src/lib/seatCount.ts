import { google } from "googleapis";

const TAB = "enrollments";
const PAID_STATUSES = new Set(["paid", "test_paid"]);

export async function getSeatsRemaining(
  cohortId: string,
  capacityMax: number
): Promise<number | null> {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!spreadsheetId || !clientEmail || !rawKey) return null;

  const privateKey = rawKey.replace(/\\n/g, "\n").replace(/\r/g, "").trim();
  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const sheets = google.sheets({ version: "v4", auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${TAB}!A:P`,
  });

  const rows = res.data.values ?? [];
  if (rows.length < 2) return capacityMax;

  const header = rows[0];
  const cohortIdCol = header.indexOf("cohort_id");
  const statusCol = header.indexOf("status");
  if (cohortIdCol === -1 || statusCol === -1) return null;

  const paid = rows
    .slice(1)
    .filter((row) => row[cohortIdCol] === cohortId && PAID_STATUSES.has(row[statusCol]))
    .length;

  return Math.max(0, capacityMax - paid);
}
