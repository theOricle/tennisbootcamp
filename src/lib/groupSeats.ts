import type { Cohort } from "@/types/cohort";
import type { ProgramGroup } from "@/types/program";
import type { EnrollmentSheetSnapshot } from "@/lib/enrollGate";
import { nextCohortForGroup } from "@/lib/programCatalog";
import { readEnrollmentSheet, seatsFromSnapshot } from "@/lib/seatCount";

// Seats on a group card (owner-approved design, 2026-11-17): "Full" and
// "{n} spots left" come from the seat count the enroll page already uses
// (src/lib/seatCount.ts: capacity minus the cohort's paid rows), read once
// per page render for the groups' next public cohorts. Display only: nothing
// here writes, holds a spot or changes who can enroll, and the enroll page
// and the payment routes still make the real call. Server-side: it reads the
// enrollment sheet, so a client component imports the types only.

/**
 * One read of the enrollment sheet for a page render, or null when there is
 * nothing to count against: Sheets unconfigured (local dev, CI), or a read
 * that failed. Never throws: a card with no count reads "Open to join".
 */
export async function readSeatSnapshot(): Promise<EnrollmentSheetSnapshot | null> {
  try {
    const read = await readEnrollmentSheet();
    return read.status === "ok" ? read.snapshot : null;
  } catch (err) {
    console.error("readSeatSnapshot failed:", err);
    return null;
  }
}

/**
 * Seats left in each group's next public cohort, by group id. A group with
 * no public cohort, or whose count cannot be read from the snapshot, has no
 * entry, so its card reads "Open to join" (groupStatus, src/lib/programCatalog.ts).
 */
export function groupSeatsFromSnapshot(
  groups: readonly ProgramGroup[],
  publicCohorts: readonly Cohort[],
  snapshot: EnrollmentSheetSnapshot | null
): Record<string, number> {
  const seats: Record<string, number> = {};
  if (!snapshot) return seats;
  for (const g of groups) {
    const next = nextCohortForGroup(publicCohorts, g);
    if (!next) continue;
    const left = seatsFromSnapshot(snapshot, next.id, next.capacityMax);
    if (left !== null) seats[g.id] = left;
  }
  return seats;
}

/**
 * The seats for a page's groups: one sheet read, and none at all when no
 * group has a public cohort (today, while the cohorts are private).
 */
export async function readGroupSeats(
  groups: readonly ProgramGroup[],
  publicCohorts: readonly Cohort[]
): Promise<Record<string, number>> {
  if (!groups.some((g) => nextCohortForGroup(publicCohorts, g))) return {};
  return groupSeatsFromSnapshot(groups, publicCohorts, await readSeatSnapshot());
}
