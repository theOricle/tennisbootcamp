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
 * The enrollee's unused assessment credit, if any: their most recent
 * completed + paid booking with credit_status = 'unused'.
 */
export async function findUnusedCredit(
  email: string
): Promise<UnusedCredit | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }
  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from("assessment_bookings")
      .select("id")
      .ilike("email", email.trim())
      .eq("status", "completed")
      .eq("paid", true)
      .eq("credit_status", "unused")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
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
      slotDate: (block as BlockRow).block_date,
      slotStart: normTime(row.slot_start ?? ""),
      status: row.status,
      creditStatus: "applied",
    });
  } catch (err) {
    console.error("markCreditApplied failed (non-blocking):", err);
  }
}
