import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { updateAssessmentRow } from "@/lib/assessmentSheet";
import { normTime, type BookingRow, type BlockRow } from "@/lib/assessments";

// The $20 assessment credit: a completed + paid assessment with an unused
// credit comes off the price of the player's first program checkout. Locked
// value per the pricing decisions — the discount is always the assessment fee.

export const ASSESSMENT_CREDIT_CENTS = 2000;

export type UnusedCredit = { bookingId: string; creditCents: number };

/**
 * An unused assessment credit, if any: the most recent completed + paid
 * booking with credit_status = 'unused'.
 *
 * The credit is per participant (backlog #11): two children assessed under one
 * parent's email each carry their own $20, so a participant id narrows the
 * lookup. Without one — or before migration 0007 adds the column — it falls
 * back to the account email exactly as before.
 */
export async function findUnusedCredit(
  email: string,
  opts: { participantId?: string | null } = {}
): Promise<UnusedCredit | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }
  try {
    const supabase = createServiceClient();
    const base = () =>
      supabase
        .from("assessment_bookings")
        .select("id")
        .eq("status", "completed")
        .eq("paid", true)
        .eq("credit_status", "unused")
        .order("created_at", { ascending: false })
        .limit(1);

    let data: unknown = null;
    if (opts.participantId) {
      const res = await base().eq("participant_id", opts.participantId).maybeSingle();
      if (res.error && !/participant_id/i.test(res.error.message ?? "")) {
        console.error("findUnusedCredit failed:", res.error.message);
        return null;
      }
      // A participant with no credit of their own has no credit — don't fall
      // back to a sibling's. Only a missing column falls through to email.
      if (!res.error) {
        data = res.data;
        if (!data) return null;
      }
    }
    if (!data) {
      const res = await base().ilike("email", email.trim()).maybeSingle();
      data = res.data;
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
