import type { Cohort } from "@/types/cohort";
import type { EnrollmentSheetSnapshot } from "@/lib/enrollGate";
import { readEnrollmentSheet, seatsFromSnapshot } from "@/lib/seatCount";

// Seats on a group card (owner-approved design, 2026-11-17; one card per open
// block, owner 2026-11-19): "Full" and "{n} spots left" come from the seat
// count the enroll page already uses (src/lib/seatCount.ts: capacity minus
// the block's paid rows), read once per page render for the open blocks.
// Display only: nothing here writes, holds a spot or changes who can enroll,
// and the enroll page and the payment routes still make the real call.
// Server-side: it reads the enrollment sheet, so a client component imports
// the types only.

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
 * Seats left in each open block, by the block's id. A block whose count
 * cannot be read from the snapshot has no entry, so its card reads "Open to
 * join" (groupStatus, src/lib/programCatalog.ts).
 */
export function blockSeatsFromSnapshot(
  blocks: readonly Pick<Cohort, "id" | "capacityMax">[],
  snapshot: EnrollmentSheetSnapshot | null
): Record<string, number> {
  const seats: Record<string, number> = {};
  if (!snapshot) return seats;
  for (const block of blocks) {
    const left = seatsFromSnapshot(snapshot, block.id, block.capacityMax);
    if (left !== null) seats[block.id] = left;
  }
  return seats;
}

/**
 * The seats for a page's open blocks: one sheet read, and none at all while
 * no block is open (today, while the blocks are private).
 */
export async function readBlockSeats(
  blocks: readonly Pick<Cohort, "id" | "capacityMax">[]
): Promise<Record<string, number>> {
  if (blocks.length === 0) return {};
  return blockSeatsFromSnapshot(blocks, await readSeatSnapshot());
}
