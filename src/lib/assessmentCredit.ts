import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { updateAssessmentRow } from "@/lib/assessmentSheet";
import { normTime, type BookingRow, type BlockRow } from "@/lib/assessments";
import { ilikePattern, rowsWithEmail } from "@/lib/enrollmentLink";
import { normalizeEmail } from "@/lib/supabase/adminUsers";
import {
  ASSESSMENT_CREDIT_CENTS,
  accountCredits,
  decideCredits,
  type AccountCredit,
  type CreditBooking,
  type SeatCredit,
} from "@/lib/creditRules";

// The $20 assessment credit: a completed + paid assessment with an unused
// credit comes off the price of the player's first program checkout. Locked
// value per the pricing decisions — the discount is always the assessment fee.
//
// Whose price it comes off is one rule, src/lib/creditRules.ts (backlog #84,
// safety review). This file only reads the bookings that rule is given and
// marks a credit used. Every read that can take money off a price is by an
// id — a player's, or an account somebody proved — never by an email.

export { ASSESSMENT_CREDIT_CENTS };
export type { AccountCredit, SeatCredit };

function configured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/** Every booking that still carries its $20: completed, paid, unused. */
function unusedCredits() {
  return createServiceClient()
    .from("assessment_bookings")
    .select("*")
    .eq("status", "completed")
    .eq("paid", true)
    .eq("credit_status", "unused");
}

/**
 * The bookings whose $20 could come off a price for these players or this
 * account: the players' own, by participant id, and the ones linked to the
 * account but to no player, by account id. Nothing here reads an email. A
 * read that fails finds no credit.
 */
export async function loadCreditBookings(input: {
  accountId: string | null;
  participantIds: readonly string[];
}): Promise<CreditBooking[]> {
  if (!configured()) return [];
  const ids = [...new Set(input.participantIds.map((id) => id.trim()).filter(Boolean))];
  try {
    const reads = [
      ids.length > 0 ? unusedCredits().in("participant_id", ids) : null,
      input.accountId ? unusedCredits().eq("user_id", input.accountId).is("participant_id", null) : null,
    ];
    const results = await Promise.all(reads.map((q) => (q ? q.then((r) => r, () => null) : null)));
    const byId = new Map<string, CreditBooking>();
    for (const result of results) {
      if (result?.error) console.error("Credit read failed:", result.error.code ?? "unknown");
      for (const row of ((result?.data as BookingRow[] | null) ?? [])) byId.set(row.id, row);
    }
    return [...byId.values()];
  } catch (err) {
    console.error("Credit read failed:", err instanceof Error ? err.name : typeof err);
    return [];
  }
}

/**
 * The $20 each seat of an enrollment takes off, in seat order (null: none):
 * decideCredits over the bookings this account and these players can reach.
 * Card checkout, the e-transfer amount, the coach's invite and the sign-up
 * page all ask here, so the amount shown, the amount charged and the credit
 * marked used are the same booking.
 */
export async function creditsForSeats(input: {
  /** An account somebody proved: the session's, or the one an invitation was made for. */
  accountId: string | null;
  /** The player in each seat; null for a typed player with no record. */
  seats: readonly (string | null | undefined)[];
  /** Bookings something else on this request already used. */
  claimed?: Iterable<string>;
}): Promise<(SeatCredit | null)[]> {
  const participantIds = input.seats.map((seat) => (seat ?? "").trim()).filter(Boolean);
  if (!input.accountId && participantIds.length === 0) return input.seats.map(() => null);
  const bookings = await loadCreditBookings({ accountId: input.accountId, participantIds });
  return decideCredits({ ...input, bookings });
}

/**
 * What a signed-in account's pages say about its credits (the dashboard, the
 * profile, the sign-up page): `ready` is what an enrollment by this account
 * would take off; `waiting` is a credit booked under the account's own address
 * while nobody was signed in, which is on the account only once its owner
 * signs in through an emailed link. `email` is the session's own address,
 * never a typed one; it is escaped and then re-checked exactly (PostgREST
 * reads `*` as `%`), and it only ever finds `waiting`.
 */
export async function accountCreditView(input: {
  accountId: string;
  email: string;
  participantIds: readonly string[];
}): Promise<{ ready: AccountCredit[]; waiting: AccountCredit[] }> {
  if (!configured()) return { ready: [], waiting: [] };
  const bookings = await loadCreditBookings(input);
  const own = normalizeEmail(input.email);
  if (own) {
    try {
      const { data, error } = await unusedCredits().is("user_id", null).ilike("email", ilikePattern(own));
      if (error) console.error("Waiting credit read failed:", error.code ?? "unknown");
      bookings.push(...rowsWithEmail((data as BookingRow[] | null) ?? [], own, (b) => b.email));
    } catch (err) {
      console.error("Waiting credit read failed:", err instanceof Error ? err.name : typeof err);
    }
  }
  return accountCredits({
    accountId: input.accountId,
    email: own,
    playerIds: input.participantIds,
    bookings,
  });
}

/**
 * Mark a booking's credit applied (payment for a program succeeded) and mirror
 * it to the assessments Sheet tab. Best-effort on the Sheet side.
 */
export async function markCreditApplied(bookingId: string): Promise<void> {
  try {
    const supabase = createServiceClient();
    const { data: booking } = await supabase
      .from("assessment_bookings")
      .update({ credit_status: "applied" })
      .eq("id", bookingId)
      .eq("credit_status", "unused")
      .select("*")
      .maybeSingle();
    if (!booking) return; // already applied (duplicate webhook) — done

    const row = booking as BookingRow;
    if (!row.block_id) return;
    const { data: block } = await supabase
      .from("assessment_blocks")
      .select("*")
      .eq("id", row.block_id)
      .single();
    if (!block) return;

    await updateAssessmentRow({
      email: row.email,
      participantId: row.participant_id ?? null,
      slotDate: (block as BlockRow).block_date,
      slotStart: normTime(row.slot_start ?? ""),
      status: row.status,
      creditStatus: "applied",
    });
  } catch (err) {
    console.error("markCreditApplied failed (non-blocking):", err);
  }
}
