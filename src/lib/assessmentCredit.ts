import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { updateAssessmentRow } from "@/lib/assessmentSheet";
import { normTime, type BookingRow, type BlockRow } from "@/lib/assessments";
import { ilikePattern, rowsWithEmail } from "@/lib/enrollmentLink";
import { normalizeEmail } from "@/lib/supabase/adminUsers";

// The $20 assessment credit: a completed + paid assessment with an unused
// credit comes off the price of the player's first program checkout. Locked
// value per the pricing decisions — the discount is always the assessment fee.

export const ASSESSMENT_CREDIT_CENTS = 2000;

export type UnusedCredit = { bookingId: string; creditCents: number };

/**
 * One player's unused assessment credit, if any: their most recent completed
 * + paid booking with credit_status = 'unused'.
 *
 * The credit belongs to a participant (backlog #11), and it is found by that
 * participant's id and nothing else (backlog #84, owner 2026-11-14): never by
 * an email, which anyone can type. The caller decides whose id that may be —
 * a signed-in account's own player at checkout (checkoutCreditParticipants),
 * the player an invite names on the e-transfer rail. A player with no credit
 * of their own has none: there is no fallback to a sibling's, or to the
 * account's. A read that fails is no credit.
 */
export async function findUnusedCredit(
  participantId: string | null | undefined
): Promise<UnusedCredit | null> {
  const id = (participantId ?? "").trim();
  if (!id) return null;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("assessment_bookings")
      .select("id")
      .eq("participant_id", id)
      .eq("status", "completed")
      .eq("paid", true)
      .eq("credit_status", "unused")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error("findUnusedCredit failed:", error.message);
      return null;
    }
    if (!data) return null;
    return {
      bookingId: (data as { id: string }).id,
      creditCents: ASSESSMENT_CREDIT_CENTS,
    };
  } catch (err) {
    console.error("findUnusedCredit failed:", err);
    return null;
  }
}

/** One unused $20 on an account, and whose it is (audit M25). */
export type AccountCredit = {
  bookingId: string;
  participantId: string | null;
  /** The player's name on the booking. */
  playerName: string;
  creditCents: number;
};

/**
 * Every unused assessment credit on one account — by the account's email
 * (exact, case folded) and by its players' ids — so the dashboard can say
 * whose $20 comes off which price. Read only; an unreadable table reads as
 * none.
 */
export async function listUnusedCreditsForAccount(input: {
  email: string;
  participantIds: string[];
}): Promise<AccountCredit[]> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return [];
  }
  try {
    const supabase = createServiceClient();
    const base = () =>
      supabase
        .from("assessment_bookings")
        .select("*")
        .eq("status", "completed")
        .eq("paid", true)
        .eq("credit_status", "unused");
    // The account's own address (the caller passes the session's, never a
    // typed one), escaped and then re-checked exactly: PostgREST reads `*`
    // as `%` (backlog #84).
    const email = normalizeEmail(input.email);
    const reads = [
      email ? base().ilike("email", ilikePattern(email)) : null,
      input.participantIds.length > 0 ? base().in("participant_id", input.participantIds) : null,
    ];
    const results = await Promise.all(reads.map((q) => (q ? q.then((r) => r, () => null) : null)));
    const byId = new Map<string, BookingRow>();
    const [byEmail, byPlayer] = results.map((r) => (r?.data as BookingRow[] | null) ?? []);
    for (const row of rowsWithEmail(byEmail ?? [], email, (b) => b.email)) byId.set(row.id, row);
    for (const row of byPlayer ?? []) byId.set(row.id, row);
    return [...byId.values()].map((b) => ({
      bookingId: b.id,
      participantId: b.participant_id ?? null,
      playerName: b.name,
      creditCents: ASSESSMENT_CREDIT_CENTS,
    }));
  } catch (err) {
    console.error("listUnusedCreditsForAccount failed:", err);
    return [];
  }
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
