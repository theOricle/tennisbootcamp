// Text a visitor typed, written so a Google Sheet never runs it (backlog #33,
// built in #84; audit follow-up, owner 2026-11-14).
//
// Every Sheet append here uses valueInputOption USER_ENTERED, which reads a
// cell that starts with = + - @ (or a tab or a carriage return) as a formula.
// A formula can send other rows to an outside address (IMPORTXML, IMAGE,
// HYPERLINK), so a name typed as "=IMPORTXML(…)" would run when the owner
// opens the Sheet. A leading apostrophe makes Sheets store the cell as text
// and show it without the apostrophe; an ordinary value is written exactly as
// it was. Columns 23–29 of the intake row already carry the apostrophe on
// every non-empty cell (src/lib/leadSource.ts); this is the same protection
// for every other value a visitor typed. Values the app writes itself
// (timestamps, statuses, numbers, ids) stay as they are.
//
// Pure, so src/scripts/test-sheet-formulas.ts and test-intake-row.ts pin it.

/** The leading characters a USER_ENTERED cell reads as the start of a formula. */
export const FORMULA_LEADS = ["=", "+", "-", "@", "\t", "\r"] as const;

/**
 * A value a visitor typed, safe for a USER_ENTERED write: a string that
 * starts with one of FORMULA_LEADS gets a leading apostrophe ("+1 416…"
 * reads "+1 416…" in the Sheet, as text). Anything else — an ordinary
 * string, a number, null — comes back unchanged.
 */
export function formulaSafe<T>(value: T): T | string {
  if (typeof value !== "string" || value.length === 0) return value;
  return (FORMULA_LEADS as readonly string[]).includes(value[0]) ? `'${value}` : value;
}

/** A typed value for a cell: formula-safe, and blank when missing. */
function typed(value: unknown): unknown {
  return formulaSafe(value ?? "");
}

// ─── /api/enroll: the enrollments tab (A–U) ───────────────────────────────────

/**
 * One enrollments-tab row, in the frozen order (A–P), then the credit column
 * (Q) and the household block (R–U). The status ("pending"), the empty credit
 * cell, is_minor and the participant id are the app's; everything else came
 * from the request and is written formula-safe.
 */
export function enrollmentSheetRow(input: {
  timestamp: string;
  cohortId: unknown;
  program: unknown;
  location: unknown;
  playerName: unknown;
  dob: unknown;
  isMinor: boolean;
  contactEmail: unknown;
  contactPhone: unknown;
  guardianName: unknown;
  guardianEmail: unknown;
  guardianPhone: unknown;
  consentSignedName: unknown;
  consentAgreedAt: unknown;
  waiverVersion: unknown;
  accountEmail: unknown;
  accountName: unknown;
  relationship: unknown;
  participantId: string | null | undefined;
}): unknown[] {
  return [
    input.timestamp,
    typed(input.cohortId),
    typed(input.program),
    typed(input.location),
    typed(input.playerName),
    typed(input.dob),
    input.isMinor ? "yes" : "no",
    typed(input.contactEmail),
    typed(input.contactPhone),
    typed(input.guardianName),
    typed(input.guardianEmail),
    typed(input.guardianPhone),
    typed(input.consentSignedName),
    typed(input.consentAgreedAt),
    typed(input.waiverVersion),
    "pending",
    // col 17 — set later by the payment path when a credit applies
    "",
    // ── household block ──
    typed(input.accountEmail),
    typed(input.accountName),
    typed(input.relationship),
    input.participantId ?? "",
  ];
}

// ─── Newsletter and program interest (A–C) ───────────────────────────────────

/** The newsletter tab: timestamp, email, source. */
export function newsletterSheetRow(timestamp: string, email: unknown, source: unknown): unknown[] {
  return [timestamp, typed(email), typed(source)];
}

/** The program_interest tab: timestamp, email, program. */
export function programInterestSheetRow(timestamp: string, email: unknown, program: unknown): unknown[] {
  return [timestamp, typed(email), typed(program)];
}

// ─── The assessments tab (A–P) ────────────────────────────────────────────────

export type AssessmentSheetRow = {
  /** The player's name (col 2) — the participant, not the account holder. */
  name: string;
  /** The account holder's email (col 3) — where every email goes. */
  email: string;
  phone?: string | null;
  slotDate: string;
  slotStart: string;
  status: string;
  /** "test" for a test-key or mock payment (backlog #84): booked, no money. */
  paid: boolean | "test";
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

/**
 * One assessments-tab row: the 11 frozen columns, then the 5 household
 * columns. Names, emails, the phone, the coach's note and the household
 * names are written formula-safe; the slot, status, paid flag, level,
 * credit and participant id are the app's.
 */
export function assessmentSheetRow(r: AssessmentSheetRow, timestamp: string): unknown[] {
  return [
    timestamp,
    typed(r.name),
    typed(r.email),
    typed(r.phone),
    r.slotDate ?? "",
    r.slotStart ?? "",
    r.status ?? "",
    r.paid === "test" ? "test" : r.paid ? "yes" : "no",
    r.levelResult != null ? String(r.levelResult) : "",
    typed(r.coachNotes),
    r.creditStatus ?? "unused",
    // ── appended (household accounts) ──
    typed(r.accountEmail ?? r.email),
    typed(r.accountName),
    typed(r.participantName ?? r.name),
    typed(r.participantRelationship),
    r.participantId ?? "",
  ];
}

/**
 * The frozen block (A–K) of an assessments row, rewritten in place. The row
 * was read back as Sheets shows it — a cell stored as '=1+1 reads =1+1 — so
 * the visitor's cells (name, email, phone) and the coach's note are made
 * formula-safe again on the way back; the update writes USER_ENTERED, and a
 * value read back raw would otherwise come alive as a formula.
 */
export function assessmentFrozenRewrite(
  existing: readonly unknown[],
  match: {
    status: string;
    paid?: boolean;
    levelResult?: string | number | null;
    coachNotes?: string | null;
    creditStatus?: string;
  }
): unknown[] {
  const updated = [...existing];
  while (updated.length < 11) updated.push("");
  updated[1] = typed(updated[1]);
  updated[2] = typed(updated[2]);
  updated[3] = typed(updated[3]);
  updated[9] = typed(updated[9]);
  updated[6] = match.status;
  if (match.paid != null) updated[7] = match.paid ? "yes" : "no";
  if (match.levelResult != null) updated[8] = String(match.levelResult);
  if (match.coachNotes != null) updated[9] = typed(match.coachNotes);
  if (match.creditStatus != null) updated[10] = match.creditStatus;
  return updated.slice(0, 11);
}
