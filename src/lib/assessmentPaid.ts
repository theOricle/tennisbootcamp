// What unmarking a paid assessment changes (backlog #104): the one line the
// coach reads before "Mark unpaid", on /admin/assessments. It says only what
// is true of the $20, by the credit's own rule (carriesCredit,
// src/lib/creditRules.ts): the $20 comes off a program price while the
// assessment is completed, paid and its credit unused. Unmarking changes the
// paid flag and nothing else: the booking, its time and its level stay, and
// nobody is emailed.
//
// Pure: the admin view and the tests share it.

/** The slice of a booking the line reads. */
export type PaidBooking = { status: string; credit_status?: string | null };

const STAYS = "The booking and its time stay.";

export function unmarkPaidLine(booking: PaidBooking): string {
  // A request has no time yet: unmarking leaves it in the queue as it is.
  if (booking.status === "requested") {
    return "The request stays in the queue. The $20 comes off a program price only once the assessment is paid and completed.";
  }
  if (booking.status === "completed" && booking.credit_status === "unused") {
    return `${STAYS} While it is unpaid, the $20 does not come off a program price.`;
  }
  if (booking.status === "completed" && booking.credit_status === "applied") {
    return `${STAYS} The $20 already came off a program price, and that stays.`;
  }
  return `${STAYS} The $20 comes off a program price only once the assessment is paid and completed.`;
}

export const UNDO_PAID = "Undo";
export const MARK_UNPAID = "Mark unpaid";
export const KEEP_PAID = "Keep paid";
