// The intake Google Sheet row — the frozen contract behind /api/intake.
//
// Columns 1–14 are frozen (never reorder, rename, or remove).
// Columns 15–17 were added 2026-05-23 (additive only).
// Anything new goes AFTER column 17, and only by explicit owner decision.
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

/**
 * Build the 17-cell row. `timestamp` is injected so the shape can be tested
 * deterministically; the route passes `new Date().toISOString()`.
 */
export function buildIntakeRow(body: IntakeBody, timestamp: string): unknown[] {
  return [
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
}
