import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import {
  appendAssessmentRow,
  updateAssessmentRow,
} from "@/lib/assessmentSheet";
import {
  sendBookingConfirmationEmail,
  sendAssessmentCompleteEmail,
} from "@/lib/email";

// How far ahead the booking page shows open slots.
const LOOKAHEAD_DAYS = 21;
// Pending bookings hold a slot this long before the lazy sweep frees it.
export const PENDING_TTL_MS = 15 * 60 * 1000;

const HOLD_STATES = ["pending", "booked"] as const;

// ─── Row shapes ───────────────────────────────────────────────────────────────

export type BlockRow = {
  id: string;
  block_date: string;
  start_time: string;
  end_time: string;
  slot_minutes: number;
  location_label: string | null;
  notes: string | null;
  created_at: string;
};

export type BookingRow = {
  id: string;
  block_id: string;
  slot_start: string;
  name: string;
  email: string;
  phone: string | null;
  user_id: string | null;
  self_level: string | null;
  status: string;
  stripe_session_id: string | null;
  paid: boolean;
  level_result: number | null;
  coach_notes: string | null;
  credit_status: string;
  created_at: string;
  expires_at: string | null;
};

// ─── Time / date helpers ──────────────────────────────────────────────────────

/** "18:00:00" | "18:00" → "18:00" */
export function normTime(t: string): string {
  return t.slice(0, 5);
}

/** Split a block window into slot_minutes-sized start times ("18:00", "18:20"…). */
export function computeSlots(
  start: string,
  end: string,
  slotMinutes: number
): string[] {
  const toMin = (t: string) => {
    const [h, m] = normTime(t).split(":").map(Number);
    return h * 60 + m;
  };
  const startMin = toMin(start);
  const endMin = toMin(end);
  const step = slotMinutes > 0 ? slotMinutes : 20;
  const out: string[] = [];
  for (let m = startMin; m + step <= endMin; m += step) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    out.push(`${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`);
  }
  return out;
}

/** "18:00" → "6:00pm" */
export function formatSlotTime(t: string): string {
  const [h, m] = normTime(t).split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const hour = h % 12 || 12;
  return m === 0 ? `${hour}${suffix}` : `${hour}:${String(m).padStart(2, "0")}${suffix}`;
}

/** "2026-07-25" → "Saturday, July 25" */
export function formatBlockDate(dateStr: string): string {
  const [y, mo, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.toLocaleDateString("en-CA", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** 3 → "3.0" */
export function levelLabel(n: number | string): string {
  const num = typeof n === "string" ? Number(n) : n;
  return Number.isFinite(num) ? num.toFixed(1) : String(n);
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysISO(iso: string, days: number): string {
  const [y, mo, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, mo - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// ─── Slot listing (public booking page) ───────────────────────────────────────

/** Flip any pending bookings past their expiry back to 'expired' (frees the slot). */
export async function sweepExpiredPendings(): Promise<void> {
  const supabase = createServiceClient();
  await supabase
    .from("assessment_bookings")
    .update({ status: "expired" })
    .eq("status", "pending")
    .lt("expires_at", new Date().toISOString());
}

export type PublicSlot = {
  slotStart: string;
  timeLabel: string;
  taken: boolean;
};

export type PublicBlock = {
  blockId: string;
  date: string;
  dateLabel: string;
  locationLabel: string | null;
  slots: PublicSlot[];
};

/**
 * Upcoming assessment blocks split into slots. Sweeps expired pendings first so
 * a stale hold never keeps a slot dark. Slots held by an active (pending/booked)
 * booking are marked taken.
 */
export async function getUpcomingSlots(): Promise<PublicBlock[]> {
  await sweepExpiredPendings();

  const supabase = createServiceClient();
  const today = todayISO();
  const until = addDaysISO(today, LOOKAHEAD_DAYS);

  const { data: blocks, error } = await supabase
    .from("assessment_blocks")
    .select("*")
    .gte("block_date", today)
    .lte("block_date", until)
    .order("block_date", { ascending: true })
    .order("start_time", { ascending: true });

  if (error || !blocks || blocks.length === 0) return [];

  const blockIds = (blocks as BlockRow[]).map((b) => b.id);
  const { data: held } = await supabase
    .from("assessment_bookings")
    .select("block_id, slot_start, status")
    .in("block_id", blockIds)
    .in("status", HOLD_STATES as unknown as string[]);

  const takenKeys = new Set(
    (held ?? []).map((h) => `${h.block_id}|${normTime(h.slot_start)}`)
  );

  const nowMinToday = (() => {
    const now = new Date();
    return now.getUTCHours() * 60 + now.getUTCMinutes();
  })();

  return (blocks as BlockRow[]).map((b) => {
    const isToday = b.block_date === today;
    const slots = computeSlots(b.start_time, b.end_time, b.slot_minutes)
      .filter((s) => {
        if (!isToday) return true;
        const [h, m] = s.split(":").map(Number);
        return h * 60 + m > nowMinToday;
      })
      .map((slotStart) => ({
        slotStart,
        timeLabel: formatSlotTime(slotStart),
        taken: takenKeys.has(`${b.id}|${slotStart}`),
      }));
    return {
      blockId: b.id,
      date: b.block_date,
      dateLabel: formatBlockDate(b.block_date),
      locationLabel: b.location_label,
      slots,
    };
  });
}

// ─── Booking creation ─────────────────────────────────────────────────────────

export class SlotTakenError extends Error {
  constructor() {
    super("That slot was just taken. Please pick another.");
    this.name = "SlotTakenError";
  }
}

export async function createPendingBooking(input: {
  blockId: string;
  slotStart: string;
  name: string;
  email: string;
  phone?: string | null;
  selfLevel?: string | null;
  availability?: unknown;
  userId?: string | null;
}): Promise<BookingRow> {
  const supabase = createServiceClient();

  const attemptInsert = async () => {
    const expiresAt = new Date(Date.now() + PENDING_TTL_MS).toISOString();
    return supabase
      .from("assessment_bookings")
      .insert({
        block_id: input.blockId,
        slot_start: normTime(input.slotStart),
        name: input.name,
        email: input.email,
        phone: input.phone ?? null,
        user_id: input.userId ?? null,
        self_level: input.selfLevel ?? null,
        availability: input.availability ?? null,
        status: "pending",
        expires_at: expiresAt,
      })
      .select("*")
      .single();
  };

  let { data, error } = await attemptInsert();

  // 23505 = unique_violation on the active-slot partial index → a pending/booked
  // hold exists. It may just be an expired pending that hasn't been swept yet:
  // sweep and retry once before declaring the slot taken.
  if (error?.code === "23505") {
    await sweepExpiredPendings();
    ({ data, error } = await attemptInsert());
    if (error?.code === "23505") throw new SlotTakenError();
  }

  if (error) throw new Error(`Failed to create booking: ${error.message}`);
  return data as BookingRow;
}

async function getBookingWithBlock(
  bookingId: string
): Promise<{ booking: BookingRow; block: BlockRow } | null> {
  const supabase = createServiceClient();
  const { data: booking } = await supabase
    .from("assessment_bookings")
    .select("*")
    .eq("id", bookingId)
    .single();
  if (!booking) return null;
  const { data: block } = await supabase
    .from("assessment_blocks")
    .select("*")
    .eq("id", (booking as BookingRow).block_id)
    .single();
  if (!block) return null;
  return { booking: booking as BookingRow, block: block as BlockRow };
}

/**
 * Mark a pending booking booked + paid, dual-write the Sheet, and send the
 * confirmation email. Idempotent-ish: re-confirming an already-booked row is a
 * no-op for the status but still safe. Used by free/mock mode and the webhook.
 */
export async function confirmBooking(
  bookingId: string,
  opts: { stripeSessionId?: string | null } = {}
): Promise<BookingRow | null> {
  const supabase = createServiceClient();

  // Only transition rows that are still pending → booked, so a duplicate webhook
  // doesn't re-send the email.
  const { data: updated } = await supabase
    .from("assessment_bookings")
    .update({
      status: "booked",
      paid: true,
      stripe_session_id: opts.stripeSessionId ?? undefined,
    })
    .eq("id", bookingId)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();

  if (!updated) {
    // Already confirmed (or gone) — nothing more to do.
    return null;
  }

  const withBlock = await getBookingWithBlock(bookingId);
  if (!withBlock) return updated as BookingRow;
  const { booking, block } = withBlock;

  await appendAssessmentRow({
    name: booking.name,
    email: booking.email,
    phone: booking.phone,
    slotDate: block.block_date,
    slotStart: normTime(booking.slot_start),
    status: "booked",
    paid: true,
    creditStatus: booking.credit_status,
  });

  await sendBookingConfirmationEmail({
    to: booking.email,
    name: booking.name,
    dateLabel: formatBlockDate(block.block_date),
    timeLabel: formatSlotTime(booking.slot_start),
    locationLabel: block.location_label,
  }).catch((err) =>
    console.error("Booking confirmation email failed (non-blocking):", err)
  );

  return booking;
}

// ─── Completion (admin) ───────────────────────────────────────────────────────

async function findUserIdByEmail(email: string): Promise<string | null> {
  const supabase = createServiceClient();
  const target = email.trim().toLowerCase();
  // Small project — a single page of users is plenty.
  const { data, error } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (error || !data) return null;
  const match = data.users.find(
    (u) => (u.email ?? "").trim().toLowerCase() === target
  );
  return match?.id ?? null;
}

/**
 * Complete a booking with a coach-assigned level + note. Writes the level to the
 * booking, the matching profile (if an account exists), and the Sheet row, then
 * sends the "your level + next step" email.
 */
export async function completeBooking(
  bookingId: string,
  input: { level: number; coachNotes: string }
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createServiceClient();
  const withBlock = await getBookingWithBlock(bookingId);
  if (!withBlock) return { ok: false, error: "Booking not found." };
  const { booking, block } = withBlock;

  const { error: updErr } = await supabase
    .from("assessment_bookings")
    .update({
      status: "completed",
      level_result: input.level,
      coach_notes: input.coachNotes,
    })
    .eq("id", bookingId);
  if (updErr) return { ok: false, error: updErr.message };

  // Update the matching profile, if one exists (by user_id, else by email).
  const profileId = booking.user_id ?? (await findUserIdByEmail(booking.email));
  if (profileId) {
    await supabase
      .from("profiles")
      .update({
        level: input.level,
        level_assessed_at: new Date().toISOString(),
        level_notes: input.coachNotes,
      })
      .eq("id", profileId);
  }

  await updateAssessmentRow({
    email: booking.email,
    slotDate: block.block_date,
    slotStart: normTime(booking.slot_start),
    status: "completed",
    levelResult: levelLabel(input.level),
    coachNotes: input.coachNotes,
    creditStatus: booking.credit_status,
  });

  await sendAssessmentCompleteEmail({
    to: booking.email,
    name: booking.name,
    levelLabel: levelLabel(input.level),
    coachNote: input.coachNotes,
  }).catch((err) =>
    console.error("Assessment complete email failed (non-blocking):", err)
  );

  return { ok: true };
}

export async function markNoShow(
  bookingId: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createServiceClient();
  const withBlock = await getBookingWithBlock(bookingId);
  if (!withBlock) return { ok: false, error: "Booking not found." };
  const { booking, block } = withBlock;

  const { error } = await supabase
    .from("assessment_bookings")
    .update({ status: "no_show" })
    .eq("id", bookingId);
  if (error) return { ok: false, error: error.message };

  await updateAssessmentRow({
    email: booking.email,
    slotDate: block.block_date,
    slotStart: normTime(booking.slot_start),
    status: "no_show",
    creditStatus: booking.credit_status,
  });

  return { ok: true };
}

// ─── Admin: blocks + bookings ─────────────────────────────────────────────────

export async function listBlocks(): Promise<BlockRow[]> {
  const supabase = createServiceClient();
  const today = todayISO();
  const { data } = await supabase
    .from("assessment_blocks")
    .select("*")
    .gte("block_date", addDaysISO(today, -1))
    .order("block_date", { ascending: true })
    .order("start_time", { ascending: true });
  return (data as BlockRow[]) ?? [];
}

export async function createBlock(input: {
  blockDate: string;
  startTime: string;
  endTime: string;
  slotMinutes?: number;
  locationLabel?: string | null;
  notes?: string | null;
  createdBy?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = createServiceClient();
  const { error } = await supabase.from("assessment_blocks").insert({
    block_date: input.blockDate,
    start_time: input.startTime,
    end_time: input.endTime,
    slot_minutes: input.slotMinutes ?? 20,
    location_label: input.locationLabel ?? null,
    notes: input.notes ?? null,
    created_by: input.createdBy ?? null,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function updateBlock(
  id: string,
  input: {
    blockDate?: string;
    startTime?: string;
    endTime?: string;
    slotMinutes?: number;
    locationLabel?: string | null;
    notes?: string | null;
  }
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createServiceClient();
  const patch: Record<string, unknown> = {};
  if (input.blockDate != null) patch.block_date = input.blockDate;
  if (input.startTime != null) patch.start_time = input.startTime;
  if (input.endTime != null) patch.end_time = input.endTime;
  if (input.slotMinutes != null) patch.slot_minutes = input.slotMinutes;
  if (input.locationLabel !== undefined) patch.location_label = input.locationLabel;
  if (input.notes !== undefined) patch.notes = input.notes;

  const { error } = await supabase
    .from("assessment_blocks")
    .update(patch)
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export type AdminBooking = BookingRow & {
  block_date: string;
  block_start: string;
  location_label: string | null;
};

/** Bookings joined with their block, newest slot first, grouped-ready. */
export async function listBookings(opts: { date?: string } = {}): Promise<
  AdminBooking[]
> {
  const supabase = createServiceClient();
  const blocks = await listBlocks();
  const byId = new Map(blocks.map((b) => [b.id, b]));
  const blockIds = blocks
    .filter((b) => (opts.date ? b.block_date === opts.date : true))
    .map((b) => b.id);
  if (blockIds.length === 0) return [];

  const { data } = await supabase
    .from("assessment_bookings")
    .select("*")
    .in("block_id", blockIds)
    .in("status", ["pending", "booked", "completed", "no_show"])
    .order("created_at", { ascending: false });

  return ((data as BookingRow[]) ?? []).map((b) => {
    const block = byId.get(b.block_id);
    return {
      ...b,
      block_date: block?.block_date ?? "",
      block_start: block ? normTime(block.start_time) : "",
      location_label: block?.location_label ?? null,
    };
  });
}
