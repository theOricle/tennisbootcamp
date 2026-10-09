import { google } from "googleapis";
import type { EnrollmentSheetSnapshot } from "@/lib/enrollGate";

const TAB = "enrollments";
const PAID_STATUSES = new Set(["paid"]);

export type EnrollmentSheetRead =
  | { status: "ok"; snapshot: EnrollmentSheetSnapshot }
  /** Sheets env vars unset (local dev): nothing to count or verify against. */
  | { status: "unconfigured" }
  | { status: "error" };

/**
 * One read of the enrollments tab (A:P — the frozen columns). The seat count
 * and the payment routes' row-ownership check (backlog #38) both come from
 * this so a checkout costs one Sheets read, not two.
 */
export async function readEnrollmentSheet(): Promise<EnrollmentSheetRead> {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!spreadsheetId || !clientEmail || !rawKey) return { status: "unconfigured" };

  try {
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
    const all = (res.data.values ?? []) as string[][];
    return {
      status: "ok",
      snapshot: { header: all[0] ?? [], rows: all.slice(1) },
    };
  } catch (err) {
    console.error("readEnrollmentSheet error:", err);
    return { status: "error" };
  }
}

/** Seats left from a snapshot: capacity minus this cohort's paid rows. */
export function seatsFromSnapshot(
  snapshot: EnrollmentSheetSnapshot,
  cohortId: string,
  capacityMax: number
): number | null {
  if (snapshot.rows.length === 0) return capacityMax;
  const cohortIdCol = snapshot.header.indexOf("cohort_id");
  const statusCol = snapshot.header.indexOf("status");
  if (cohortIdCol === -1 || statusCol === -1) return null;
  const paid = snapshot.rows.filter(
    (row) => row[cohortIdCol] === cohortId && PAID_STATUSES.has(row[statusCol])
  ).length;
  return Math.max(0, capacityMax - paid);
}

/**
 * The cohorts a player may still be pitched (audit M33): every one with a
 * seat left in the snapshot. A count that cannot be read (missing columns)
 * keeps the cohort — the enroll page makes the final call.
 */
export function cohortsWithSeats<T extends { id: string; capacityMax: number }>(
  cohorts: T[],
  snapshot: EnrollmentSheetSnapshot
): T[] {
  return cohorts.filter((c) => {
    const left = seatsFromSnapshot(snapshot, c.id, c.capacityMax);
    return left === null || left > 0;
  });
}

export async function getSeatsRemaining(
  cohortId: string,
  capacityMax: number
): Promise<number | null> {
  const read = await readEnrollmentSheet();
  if (read.status !== "ok") return null;
  return seatsFromSnapshot(read.snapshot, cohortId, capacityMax);
}
