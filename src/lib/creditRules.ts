// The $20 assessment credit: whose price it comes off (backlog #84, safety
// review). One rule, read by everything that names or charges a price: the
// dashboard's line, card checkout, the e-transfer amount, the coach's invite
// and the sign-up page. The dashboard can never promise what a charge will
// not apply, because both ask `creditReach`.
//
// A credit is a completed, paid assessment whose $20 is still unused. It
// reaches a price in one of two ways, and never through a typed email:
//   player    the booking names a player (made signed in, or linked to one
//             when its owner signed in through their emailed link): it comes
//             off that player's price;
//   account   the booking is linked to an account but to no player (the name
//             on it matched nobody): it comes off once, for one player, on
//             that account's next enrollment.
// A booking under the account's own address that is linked to nothing yet is
// `waiting`: it comes off nothing until its owner signs in through an emailed
// link, and the pages say so.
//
// Pure: the reads live in src/lib/assessmentCredit.ts, and
// src/scripts/test-safety-round.ts drives every story with bookings in memory.

import { normalizeEmail } from "@/lib/supabase/adminUsers";
import { throwOnFailedWrite } from "@/lib/stripeOutcome";

/** Locked value per the pricing decisions: the discount is the assessment fee. */
export const ASSESSMENT_CREDIT_CENTS = 2000;

/** The slice of an assessment booking the credit rule reads. */
export type CreditBooking = {
  id: string;
  /** The account the booking is linked to, or null while nobody owns it. */
  user_id: string | null;
  /** The player it is for (migration 0007), when it names one. */
  participant_id?: string | null;
  /** The address it was booked under. */
  email: string;
  /** The player's name as it was typed on the booking. */
  name: string;
  status: string;
  paid: boolean;
  credit_status: string;
  created_at: string;
};

/** A booking whose $20 is still to come off a price: completed, paid, unused. */
export function carriesCredit(
  booking: Pick<CreditBooking, "status" | "paid" | "credit_status">
): boolean {
  return booking.status === "completed" && booking.paid === true && booking.credit_status === "unused";
}

export type CreditReach = "player" | "account" | "waiting";

/**
 * How a booking's $20 reaches an account, or null when it does not. The one
 * decision every credit read goes through.
 *
 * `email` is only ever the signed-in account's own address, and only decides
 * `waiting`, which takes nothing off a price.
 */
export function creditReach(
  booking: CreditBooking,
  who: { accountId: string | null; playerIds: readonly string[]; email?: string | null }
): CreditReach | null {
  if (!carriesCredit(booking)) return null;
  const player = (booking.participant_id ?? "").trim();
  if (player) return who.playerIds.includes(player) ? "player" : null;
  if (who.accountId && booking.user_id === who.accountId) return "account";
  const own = normalizeEmail(who.email ?? "");
  if (!booking.user_id && own && normalizeEmail(booking.email) === own) return "waiting";
  return null;
}

/** The credit one seat of an enrollment takes. */
export type SeatCredit = { bookingId: string; creditCents: number };

/**
 * Which booking's $20 comes off each seat of an enrollment, in seat order
 * (null: none). A player's own booking first, the newest; then each booking
 * linked to the account but to no player goes to the next seat that has no
 * credit yet, so it is applied once and to one player. A booking is never
 * given twice, and one in `claimed` (already used by something else on this
 * request) is not given at all. Nothing is found by an email: a booking that
 * is only `waiting` takes nothing off.
 *
 * `accountId` is an account somebody proved: the signed-in session's, or the
 * one the coach's invitation was made for. Null means nobody did, and then
 * only a named player's own booking counts.
 */
export function decideCredits(input: {
  accountId: string | null;
  /** The player in each seat; null for a typed player with no record. */
  seats: readonly (string | null | undefined)[];
  bookings: readonly CreditBooking[];
  claimed?: Iterable<string>;
}): (SeatCredit | null)[] {
  const taken = new Set<string>(input.claimed ?? []);
  const newestFirst = [...input.bookings].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const seats = input.seats.map((seat) => (seat ?? "").trim() || null);
  const out: (SeatCredit | null)[] = seats.map(() => null);
  const give = (seat: number, booking: CreditBooking) => {
    out[seat] = { bookingId: booking.id, creditCents: ASSESSMENT_CREDIT_CENTS };
    taken.add(booking.id);
  };

  seats.forEach((player, i) => {
    if (!player) return;
    const own = newestFirst.find(
      (b) =>
        !taken.has(b.id) &&
        creditReach(b, { accountId: input.accountId, playerIds: [player] }) === "player"
    );
    if (own) give(i, own);
  });

  if (input.accountId) {
    for (const booking of newestFirst) {
      if (taken.has(booking.id)) continue;
      if (creditReach(booking, { accountId: input.accountId, playerIds: [] }) !== "account") continue;
      const seat = out.findIndex((credit) => credit === null);
      if (seat === -1) break;
      give(seat, booking);
    }
  }
  return out;
}

/** One unused $20 on an account, and whose it is (audit M25). */
export type AccountCredit = {
  bookingId: string;
  /** The player it is for; null when it is the account's, for whoever enrolls next. */
  participantId: string | null;
  /** The player's name on the booking. */
  playerName: string;
  creditCents: number;
};

/**
 * What an account's pages may say about its credits. `ready` is exactly what
 * decideCredits would take off for this account: the dashboard's line reads
 * nothing else. `waiting` is under the account's own address but linked to
 * nothing yet: it is never promised, only named, with the way to link it.
 */
export function accountCredits(input: {
  accountId: string;
  email: string;
  playerIds: readonly string[];
  bookings: readonly CreditBooking[];
}): { ready: AccountCredit[]; waiting: AccountCredit[] } {
  const ready: AccountCredit[] = [];
  const waiting: AccountCredit[] = [];
  const seen = new Set<string>();
  for (const booking of input.bookings) {
    if (seen.has(booking.id)) continue;
    seen.add(booking.id);
    const reach = creditReach(booking, input);
    if (!reach) continue;
    const credit: AccountCredit = {
      bookingId: booking.id,
      participantId: reach === "player" ? (booking.participant_id ?? "").trim() : null,
      playerName: booking.name,
      creditCents: ASSESSMENT_CREDIT_CENTS,
    };
    (reach === "waiting" ? waiting : ready).push(credit);
  }
  return { ready, waiting };
}

/** What the guarded update that marks a credit used answers. */
export type CreditWriteAnswer<T> = {
  data: T | null;
  error: { code?: string | null } | null;
};

/**
 * Mark one credit used through the guarded update it is handed (only out of
 * `unused`), and say what happened:
 *   the booking  the update moved it: the credit is now applied;
 *   null         it moved nothing and reported no error: the credit was
 *                applied already (a second delivery, a second click). Done,
 *                and quiet;
 *   a throw      the update reported an error (fix round 2). That is not
 *                "already applied": the $20 still reads unused and could be
 *                spent again, so the caller must hear it. The webhook answers
 *                Stripe with a failure and is delivered again, and its
 *                guarded steps change nothing twice.
 */
export async function writeCreditApplied<T>(
  update: () => PromiseLike<CreditWriteAnswer<T>>
): Promise<T | null> {
  const { data, error } = await update();
  throwOnFailedWrite(error, "Credit write");
  return data ?? null;
}
