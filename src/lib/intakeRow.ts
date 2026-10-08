// The intake Google Sheet row — the frozen contract behind /api/intake.
//
// Columns 1–14 are frozen (never reorder, rename, or remove).
// Columns 15–17 were added 2026-05-23 (additive only).
// Columns 18–22 were added 2026-09-08 for household accounts (backlog #11) —
// appended after 17, never touching a byte of what comes before.
// Columns 23–29 were added 2026-10-03 for lead source (backlog #26, owner
// decision 2026-10-03): source, medium, campaign, content, click_id,
// landing_page, first_seen — appended after 22, nothing before them moves.
// Anything new goes AFTER column 29, and only by explicit owner decision.
//
// Pure: no I/O, so src/scripts/test-intake-row.ts can pin the shape.

import {
  availabilityToCompactString,
  availabilityToLegacySlots,
} from "@/lib/availability";
import {
  LEAD_SOURCE_HEADERS,
  buildLeadSourceCells,
  type FirstTouch,
} from "@/lib/leadSource";

export const INTAKE_HEADERS = [
  "timestamp", "name", "email", "phone", "who", "level",
  "goals", "programs", "area", "notes", "newsletter",
  "priority_score", "lead_type", "follow_up_status",
  "preferred_locations", "availability", "recommended_program",
] as const;

/** Append range for the 17 frozen columns (A–Q). */
export const INTAKE_APPEND_RANGE_COLUMNS = "A:Q";

/**
 * Columns 18–22: which player the row is about, and whose account they're on.
 * Two children under one parent are two rows sharing an account_email and
 * telling themselves apart by participant_id.
 */
export const INTAKE_HOUSEHOLD_HEADERS = [
  "account_email", "account_name", "participant_name",
  "participant_relationship", "participant_id",
] as const;

/** The first 22 columns: the frozen 17 plus the appended household block (A–V). */
export const INTAKE_HOUSEHOLD_ALL_HEADERS = [
  ...INTAKE_HEADERS,
  ...INTAKE_HOUSEHOLD_HEADERS,
] as const;

/**
 * Columns 23–29 (backlog #26): where the quiz-taker came from. Defined in
 * src/lib/leadSource.ts next to the capture rules; the names live here too
 * so the contract reads top to bottom.
 */
export const INTAKE_LEAD_SOURCE_HEADERS = LEAD_SOURCE_HEADERS;

/** All 29 columns: frozen 17, household 18–22, lead source 23–29. */
export const INTAKE_ALL_HEADERS = [
  ...INTAKE_HOUSEHOLD_ALL_HEADERS,
  ...INTAKE_LEAD_SOURCE_HEADERS,
] as const;

/** Append range covering all 29 columns (A–AC). */
export const INTAKE_APPEND_RANGE_ALL = "A:AC";

/** 0-based column index → Sheet letter(s): 0 → A, 22 → W, 28 → AC. */
export function sheetColumnLetter(index: number): string {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    out = String.fromCharCode(65 + r) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/**
 * How the route brings an existing header row up to the contract without
 * touching a cell that is already right: the first column whose header
 * differs (or is missing), and the cells to write from there. A1 for an empty
 * tab, W1 for a tab that has the 22 pre-#26 columns, null when nothing is
 * missing. Columns 1–22 are never rewritten on a sheet that already has them.
 */
export function intakeHeaderPatch(
  existing: readonly unknown[]
): { range: string; values: string[] } | null {
  const headers = INTAKE_ALL_HEADERS as readonly string[];
  const first = headers.findIndex((h, i) => existing[i] !== h);
  if (first === -1) return null;
  return { range: `${sheetColumnLetter(first)}1`, values: headers.slice(first) };
}

export type IntakeHousehold = {
  accountEmail?: string | null;
  accountName?: string | null;
  participantName?: string | null;
  participantRelationship?: string | null;
  participantId?: string | null;
};

/** Loose request body — every field optional, exactly as the route treats it. */
export type IntakeBody = {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  who?: unknown;
  level?: unknown;
  goals?: unknown;
  programs?: unknown;
  area?: unknown;
  notes?: unknown;
  newsletter?: unknown;
  preferredLocationIds?: unknown;
  availability?: unknown;
  recommendedProgram?: unknown;
};

/** Exactly the route's `body.x ?? ""` — the value passes through untouched. */
function orEmpty(v: unknown): unknown {
  return v ?? "";
}

/** col 9 (area): accept new preferredLocationIds array or legacy area string. */
export function intakeAreaValue(body: IntakeBody): string {
  return body.area
    ? String(body.area)
    : Array.isArray(body.preferredLocationIds)
    ? body.preferredLocationIds.join(", ")
    : "";
}

/**
 * col 16 (availability): the frozen column stays "availability"; only the
 * cell format is upgraded. New clients send the structured grid object
 * ({days,v:1}) → compact self-identifying string ("v1:mon:eve;wed:mor,eve").
 * Legacy clients that sent a slot array still serialize the old way.
 */
export function intakeAvailabilityValue(body: IntakeBody): string {
  return Array.isArray(body.availability)
    ? body.availability.join(", ")
    : body.availability
    ? availabilityToCompactString(body.availability)
    : "";
}

/** Legacy slot list for the rule-based recommender (unchanged engine). */
export function intakeAvailabilitySlots(body: IntakeBody): string[] {
  return Array.isArray(body.availability)
    ? body.availability
    : availabilityToLegacySlots(body.availability);
}

function isHighIntent(body: IntakeBody): boolean {
  return (
    Array.isArray(body.programs) &&
    (body.programs.includes("private") || body.programs.length > 1)
  );
}

/** The 5 appended household cells (18–22). */
export function buildIntakeHouseholdCells(
  body: IntakeBody,
  household: IntakeHousehold
): unknown[] {
  return [
    household.accountEmail ?? body.email ?? "",
    household.accountName ?? body.name ?? "",
    household.participantName ?? body.name ?? "",
    household.participantRelationship ?? "",
    household.participantId ?? "",
  ];
}

/** The 7 appended lead-source cells (23–29). */
export function buildIntakeLeadSourceCells(lead: FirstTouch | null): string[] {
  return buildLeadSourceCells(lead);
}

/**
 * Build the row. Cells 1–17 are the frozen contract and never change shape or
 * value; passing a `household` appends cells 18–22 after them, and passing
 * `lead` (the validated first-touch record, or null for a direct visit)
 * appends cells 23–29 after those. Leaving `lead` undefined yields exactly
 * the pre-#26 row. `timestamp` is injected so the shape can be tested
 * deterministically; the route passes `new Date().toISOString()`.
 */
export function buildIntakeRow(
  body: IntakeBody,
  timestamp: string,
  household?: IntakeHousehold,
  lead?: FirstTouch | null
): unknown[] {
  const frozen: unknown[] = [
    timestamp,
    orEmpty(body.name),
    orEmpty(body.email),
    orEmpty(body.phone),
    orEmpty(body.who),
    orEmpty(body.level),
    Array.isArray(body.goals) ? body.goals.join(", ") : "",
    Array.isArray(body.programs) ? body.programs.join(", ") : "",
    intakeAreaValue(body),
    orEmpty(body.notes),
    body.newsletter === true ? "yes" : body.newsletter === false ? "no" : "",
    // priority_score
    body.level === "elite" ? "3" : isHighIntent(body) ? "2" : "1",
    // lead_type
    body.level === "elite" ? "elite" : isHighIntent(body) ? "high-intent" : "standard",
    // follow_up_status
    "new",
    // cols 15–17 (additive 2026-05-23)
    Array.isArray(body.preferredLocationIds) ? body.preferredLocationIds.join(", ") : "",
    intakeAvailabilityValue(body),
    orEmpty(body.recommendedProgram),
  ];
  const withHousehold = household
    ? [...frozen, ...buildIntakeHouseholdCells(body, household)]
    : frozen;
  return lead === undefined
    ? withHousehold
    : [...withHousehold, ...buildIntakeLeadSourceCells(lead)];
}
