// The intake Google Sheet row — the frozen contract behind /api/intake.
//
// Columns 1–14 are frozen (never reorder, rename, or remove).
// Columns 15–17 were added 2026-05-23 (additive only).
// Columns 18–22 were added 2026-09-08 for household accounts (backlog #11) —
// appended after 17, never touching a byte of what comes before.
// Anything new goes AFTER column 22, and only by explicit owner decision.
//
// Pure: no I/O, so src/scripts/test-intake-row.ts can pin the shape.

import {
  availabilityToCompactString,
  availabilityToLegacySlots,
} from "@/lib/availability";

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

/** All 22 columns: the frozen 17 plus the appended household block. */
export const INTAKE_ALL_HEADERS = [
  ...INTAKE_HEADERS,
  ...INTAKE_HOUSEHOLD_HEADERS,
] as const;

/** Append range covering all 22 columns (A–V). */
export const INTAKE_APPEND_RANGE_ALL = "A:V";

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

/**
 * Build the row. Cells 1–17 are the frozen contract and never change shape or
 * value; passing a `household` appends cells 18–22 after them. `timestamp` is
 * injected so the shape can be tested deterministically; the route passes
 * `new Date().toISOString()`.
 */
export function buildIntakeRow(
  body: IntakeBody,
  timestamp: string,
  household?: IntakeHousehold
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
  return household
    ? [...frozen, ...buildIntakeHouseholdCells(body, household)]
    : frozen;
}
