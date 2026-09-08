import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import {
  appendAssessmentRow,
  updateAssessmentRow,
} from "@/lib/assessmentSheet";
import {
  sendBookingConfirmationEmail,
  sendAssessmentCompleteEmail,
  sendAssessmentRequestReceivedEmail,
  sendAssessmentRequestAdminEmail,
} from "@/lib/email";
import { availabilityChips } from "@/lib/availability";
import { issueActivationLink } from "@/lib/supabase/enrollmentActions";
import {
  findUserIdByEmail,
  setPlayerLevel,
  setPlayerAvailabilityByEmail,
  resolveParticipantId,
  getParticipant,
  getAccount,
  listPlayers,
  listAccounts,
  type PlayerRecord,
} from "@/lib/players";

// Re-exported so existing importers keep working; the lookup itself now lives
// with the other player reads/writes.
export { findUserIdByEmail };

// How far ahead the booking page shows open slots.
const LOOKAHEAD_DAYS = 21;
// Pending bookings hold a slot this long before the lazy sweep frees it.
export const PENDING_TTL_MS = 15 * 60 * 1000;

const HOLD_STATES = ["pending", "booked"] as const;

// Marker on internal one-slot blocks created when a requested booking is
// manually coordinated — these never appear on the public slot grid.
export const COORDINATED_NOTE = "coordinated-direct";

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
  block_id: string | null;   // null only while status = 'requested'
  slot_start: string | null; // null only while status = 'requested'
  /** The player's name — the participant, not necessarily the account holder. */
  name: string;
  /** The account holder's email: one payer, one inbox, many players. */
  email: string;
  phone: string | null;
  user_id: string | null;
  self_level: string | null;
  availability: unknown;
  status: string;
  stripe_session_id: string | null;
  paid: boolean;
  level_result: number | null;
  coach_notes: string | null;
  credit_status: string;
  request_note: string | null;
  /** Who this booking is for (migration 0007). Undefined before it runs. */
  participant_id?: string | null;
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

  // Internal coordinated-direct blocks (manually scheduled requests) are not
  // public inventory.
  const visibleBlocks = (blocks as BlockRow[]).filter(
    (b) => b.notes !== COORDINATED_NOTE
  );
  if (visibleBlocks.length === 0) return [];

  const blockIds = visibleBlocks.map((b) => b.id);
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

  return visibleBlocks.map((b) => {
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

// ─── Household context (backlog #11) ──────────────────────────────────────────
// A booking is for one participant, on one account. The account holder's email
// is where confirmations go; the participant's name is who the email is about
// and what the Sheet and the admin list show.

export type BookingHousehold = {
  participantId: string | null;
  participantName: string;
  participantRelationship: string;
  accountId: string | null;
  accountEmail: string;
  accountName: string;
};

/** 42703 on participant_id — migration 0007 hasn't been pasted yet. */
function isMissingParticipantColumn(
  error: { code?: string; message?: string } | null
): boolean {
  return (
    !!error &&
    (error.code === "42703" || /participant_id/i.test(error.message ?? ""))
  );
}

/** Best-effort: stamp a resolved participant onto a row that predates 0007. */
async function attachParticipant(bookingId: string, participantId: string) {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("assessment_bookings")
    .update({ participant_id: participantId })
    .eq("id", bookingId);
  if (error) {
    console.warn("Booking participant not stamped (run migration 0007?):", error.message);
  }
}

/**
 * Who a booking is for, and whose account it sits on. A row without a
 * participant_id (written before 0007, or by a guest whose account came later)
 * is resolved to the holder's 'self' participant and stamped, so the Sheet and
 * the emails always carry the household columns.
 */
export async function bookingHousehold(
  booking: BookingRow
): Promise<BookingHousehold> {
  let participant: PlayerRecord | null = null;
  if (booking.participant_id) {
    participant = await getParticipant(booking.participant_id).catch(() => null);
  }
  if (!participant) {
    const resolved = await resolveParticipantId({
      accountId: booking.user_id,
      email: booking.email,
      fullName: booking.name,
    }).catch(() => null);
    if (resolved) {
      participant = await getParticipant(resolved).catch(() => null);
      if (participant && !booking.participant_id) {
        await attachParticipant(booking.id, participant.id).catch(() => undefined);
      }
    }
  }

  const accountId = participant?.account_id ?? booking.user_id ?? null;
  const account = accountId ? await getAccount(accountId).catch(() => null) : null;

  return {
    participantId: participant?.id ?? null,
    participantName: participant?.full_name?.trim() || booking.name,
    participantRelationship: participant?.relationship ?? "",
    accountId,
    accountEmail: account?.email || booking.email,
    accountName: account?.name?.trim() || booking.name,
  };
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
  /** The player's name. */
  name: string;
  /** The account holder's email. */
  email: string;
  phone?: string | null;
  selfLevel?: string | null;
  availability?: unknown;
  userId?: string | null;
  /** Who the slot is for (backlog #11). */
  participantId?: string | null;
}): Promise<BookingRow> {
  const supabase = createServiceClient();

  // `participant_id` only exists after migration 0007; drop it and retry once
  // when the column isn't there, so a deploy ahead of the SQL still books.
  let withParticipant = Boolean(input.participantId);

  const attemptInsert = async () => {
    const expiresAt = new Date(Date.now() + PENDING_TTL_MS).toISOString();
    const row: Record<string, unknown> = {
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
    };
    if (withParticipant) row.participant_id = input.participantId;
    return supabase.from("assessment_bookings").insert(row).select("*").single();
  };

  let { data, error } = await attemptInsert();

  if (withParticipant && isMissingParticipantColumn(error)) {
    withParticipant = false;
    ({ data, error } = await attemptInsert());
  }

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
  if (!booking || !(booking as BookingRow).block_id) return null;
  const { data: block } = await supabase
    .from("assessment_blocks")
    .select("*")
    .eq("id", (booking as BookingRow).block_id as string)
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
  const household = await bookingHousehold(booking);

  await appendAssessmentRow({
    name: household.participantName,
    email: booking.email,
    phone: booking.phone,
    slotDate: block.block_date,
    slotStart: normTime(booking.slot_start ?? ""),
    status: "booked",
    paid: true,
    creditStatus: booking.credit_status,
    accountEmail: household.accountEmail,
    accountName: household.accountName,
    participantName: household.participantName,
    participantRelationship: household.participantRelationship,
    participantId: household.participantId,
  });

  await sendBookingConfirmationEmail({
    to: booking.email,
    name: household.accountName,
    participantName: household.participantName,
    dateLabel: formatBlockDate(block.block_date),
    timeLabel: formatSlotTime(booking.slot_start ?? ""),
    locationLabel: block.location_label,
  }).catch((err) =>
    console.error("Booking confirmation email failed (non-blocking):", err)
  );

  // Same set-password account email enrollees get. Fires only on the
  // pending → booked transition above, so a duplicate webhook can't re-send it.
  await issueActivationLink(booking.email, null).catch((err) =>
    console.error("Activation link failed (non-blocking):", err)
  );

  return booking;
}

// ─── Completion (admin) ───────────────────────────────────────────────────────

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

  // The level lands on the participant this booking was for — two children on
  // one account get two separate levels — mirrored to the profile when the
  // participant is the account holder themselves.
  const household = await bookingHousehold(booking);
  if (household.participantId) {
    await setPlayerLevel(household.participantId, {
      level: input.level,
      notes: input.coachNotes,
    });
  }

  // Carry the booking's availability snapshot onto the participant as the
  // assessment-time standard — unless they confirmed a newer grid since
  // booking (a dashboard confirmation is never overwritten by an older
  // snapshot).
  await setPlayerAvailabilityByEmail(booking.email, {
    availability: booking.availability,
    source: "assessment",
    participantId: household.participantId,
    phone: booking.phone,
    onlyIfOlderThan: booking.created_at,
  }).catch((err) =>
    console.error("Player availability (assessment) failed (non-blocking):", err)
  );

  await updateAssessmentRow({
    email: booking.email,
    participantId: household.participantId,
    slotDate: block.block_date,
    slotStart: normTime(booking.slot_start ?? ""),
    status: "completed",
    levelResult: levelLabel(input.level),
    coachNotes: input.coachNotes,
    creditStatus: booking.credit_status,
  });

  await sendAssessmentCompleteEmail({
    to: booking.email,
    name: household.accountName,
    participantName: household.participantName,
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
    participantId: booking.participant_id ?? null,
    slotDate: block.block_date,
    slotStart: normTime(booking.slot_start ?? ""),
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

/** Household columns the admin lists show next to every row. */
export type HouseholdFields = {
  participant_name: string;
  participant_relationship: string;
  account_name: string;
  account_email: string;
};

export type AdminBooking = BookingRow & HouseholdFields & {
  block_date: string;
  block_start: string;
  location_label: string | null;
};

/**
 * Decorate a batch of bookings with participant + account, in two queries
 * rather than two per row. Rows without a participant_id (pre-0007, or a guest
 * booking whose account came later) fall back to the holder's 'self'
 * participant, matched on email.
 */
export async function decorateHousehold<T extends BookingRow>(
  rows: T[]
): Promise<(T & HouseholdFields)[]> {
  if (rows.length === 0) return [];
  const [participants, accounts] = await Promise.all([
    listPlayers().catch(() => [] as PlayerRecord[]),
    listAccounts().catch(() => new Map<string, { id: string; name: string | null; email: string }>()),
  ]);
  const byId = new Map(participants.map((p) => [p.id, p]));
  const selfByAccount = new Map<string, PlayerRecord>();
  for (const p of participants) {
    if (p.relationship === "self" && !selfByAccount.has(p.account_id)) {
      selfByAccount.set(p.account_id, p);
    }
  }
  const accountByEmail = new Map<string, string>();
  for (const [id, a] of accounts) {
    if (a.email) accountByEmail.set(a.email.trim().toLowerCase(), id);
  }

  return rows.map((row) => {
    const accountId =
      row.user_id ??
      (byId.get(row.participant_id ?? "")?.account_id ??
        accountByEmail.get(row.email.trim().toLowerCase()) ??
        null);
    const participant =
      byId.get(row.participant_id ?? "") ??
      (accountId ? selfByAccount.get(accountId) : undefined);
    const account = accountId ? accounts.get(accountId) : undefined;
    return {
      ...row,
      participant_name: participant?.full_name?.trim() || row.name,
      participant_relationship: participant?.relationship ?? "",
      account_name: account?.name?.trim() || row.name,
      account_email: account?.email || row.email,
    };
  });
}

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

  const decorated = await decorateHousehold((data as BookingRow[]) ?? []);
  return decorated.map((b) => {
    const block = byId.get(b.block_id ?? "");
    return {
      ...b,
      block_date: block?.block_date ?? "",
      block_start: block ? normTime(block.start_time) : "",
      location_label: block?.location_label ?? null,
    };
  });
}

// ─── Request-a-time path (Phase 2.6) ──────────────────────────────────────────

/** "18:00" + 20 → "18:20" (capped at 23:59 so a late block can't wrap midnight). */
function addMinutesToTime(t: string, minutes: number): string {
  const [h, m] = normTime(t).split(":").map(Number);
  const total = Math.min(h * 60 + m + minutes, 23 * 60 + 59);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(
    total % 60
  ).padStart(2, "0")}`;
}

/**
 * Create a slotless `requested` booking — the coordinate-directly path when no
 * open slots suit (or exist). No payment is taken; the admin sets the time and
 * collects the $20 at court or by e-transfer. Sends the request-received email
 * to the prospect and a notification to the inbox, both non-blocking.
 */
export async function createRequestedBooking(input: {
  /** The player's name. */
  name: string;
  /** The account holder's email. */
  email: string;
  phone?: string | null;
  selfLevel?: string | null;
  availability?: unknown;
  requestNote?: string | null;
  userId?: string | null;
  /** Who the request is for (backlog #11). */
  participantId?: string | null;
  /** The holder's own name, when they're requesting for someone else. */
  accountName?: string | null;
}): Promise<BookingRow> {
  const supabase = createServiceClient();

  let withParticipant = Boolean(input.participantId);
  const attemptInsert = async () => {
    const row: Record<string, unknown> = {
      block_id: null,
      slot_start: null,
      name: input.name,
      email: input.email,
      phone: input.phone ?? null,
      user_id: input.userId ?? null,
      self_level: input.selfLevel ?? null,
      availability: input.availability ?? null,
      request_note: input.requestNote ?? null,
      status: "requested",
    };
    if (withParticipant) row.participant_id = input.participantId;
    return supabase.from("assessment_bookings").insert(row).select("*").single();
  };

  let { data, error } = await attemptInsert();
  if (withParticipant && isMissingParticipantColumn(error)) {
    withParticipant = false;
    ({ data, error } = await attemptInsert());
  }
  if (error) throw new Error(`Failed to create request: ${error.message}`);
  const booking = data as BookingRow;

  const holderName = input.accountName?.trim() || booking.name;

  await sendAssessmentRequestReceivedEmail({
    to: booking.email,
    name: holderName,
    participantName: booking.name,
  }).catch((err) =>
    console.error("Request-received email failed (non-blocking):", err)
  );
  await sendAssessmentRequestAdminEmail({
    name: holderName,
    participantName: booking.name,
    email: booking.email,
    phone: booking.phone,
    selfLevel: booking.self_level,
    preferredTimes: availabilityChips(booking.availability),
    note: booking.request_note,
  }).catch((err) =>
    console.error("Request admin notification failed (non-blocking):", err)
  );

  // Set-password account email, sent once here at request time. The admin
  // assign/schedule path (finalizeScheduledRequest) deliberately does not send
  // it again, and confirmBooking only fires it on pending rows — never these.
  await issueActivationLink(booking.email, null).catch((err) =>
    console.error("Activation link failed (non-blocking):", err)
  );

  // The account now exists (invite creates it), so the request's grid becomes
  // the profile's availability, stamped source = 'request'.
  await setPlayerAvailabilityByEmail(booking.email, {
    availability: booking.availability,
    source: "request",
    participantId: booking.participant_id ?? null,
    fullName: input.accountName?.trim() ? null : booking.name,
    phone: booking.phone,
  }).catch((err) =>
    console.error("Profile availability (request) failed (non-blocking):", err)
  );

  return booking;
}

/** Open requests, oldest first — the admin works the queue top-down. */
export async function listRequestedBookings(): Promise<
  (BookingRow & HouseholdFields)[]
> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("assessment_bookings")
    .select("*")
    .eq("status", "requested")
    .order("created_at", { ascending: true });
  return decorateHousehold((data as BookingRow[]) ?? []);
}

/**
 * Shared tail of both request-resolution paths: the row just flipped
 * requested → booked with a concrete block + slot, so it joins the normal
 * rails — Sheet row appended and the confirmation email sent. Payment is NOT
 * touched: the mark-paid toggle records at-court / e-transfer money.
 */
async function finalizeScheduledRequest(bookingId: string): Promise<void> {
  const withBlock = await getBookingWithBlock(bookingId);
  if (!withBlock) return;
  const { booking, block } = withBlock;

  const household = await bookingHousehold(booking);

  await appendAssessmentRow({
    name: household.participantName,
    email: booking.email,
    phone: booking.phone,
    slotDate: block.block_date,
    slotStart: normTime(booking.slot_start ?? ""),
    status: "booked",
    paid: booking.paid,
    creditStatus: booking.credit_status,
    accountEmail: household.accountEmail,
    accountName: household.accountName,
    participantName: household.participantName,
    participantRelationship: household.participantRelationship,
    participantId: household.participantId,
  });

  await sendBookingConfirmationEmail({
    to: booking.email,
    name: household.accountName,
    participantName: household.participantName,
    dateLabel: formatBlockDate(block.block_date),
    timeLabel: formatSlotTime(booking.slot_start ?? ""),
    locationLabel: block.location_label,
  }).catch((err) =>
    console.error("Booking confirmation email failed (non-blocking):", err)
  );
}

/**
 * Assign an open slot to a requested booking — flips it into the normal
 * confirmed path. The active-slot unique index still guards the slot: a
 * conflicting hold makes the update fail with 23505.
 */
export async function assignRequestedBooking(
  bookingId: string,
  input: { blockId: string; slotStart: string }
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createServiceClient();
  const { data: updated, error } = await supabase
    .from("assessment_bookings")
    .update({
      block_id: input.blockId,
      slot_start: normTime(input.slotStart),
      status: "booked",
    })
    .eq("id", bookingId)
    .eq("status", "requested")
    .select("id")
    .maybeSingle();

  if (error?.code === "23505") {
    return { ok: false, error: "That slot was just taken. Pick another." };
  }
  if (error) return { ok: false, error: error.message };
  if (!updated) return { ok: false, error: "Request not found (or already handled)." };

  await finalizeScheduledRequest(bookingId);
  return { ok: true };
}

/**
 * Record a manually coordinated date + time for a requested booking. Creates an
 * internal one-slot block (marked COORDINATED_NOTE, hidden from the public
 * grid) so the booking stays on the normal rails — the existing
 * complete-with-level flow applies from here.
 */
export async function scheduleRequestedBooking(
  bookingId: string,
  input: { date: string; time: string }
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createServiceClient();
  const start = normTime(input.time);

  const { data: block, error: blockErr } = await supabase
    .from("assessment_blocks")
    .insert({
      block_date: input.date,
      start_time: start,
      end_time: addMinutesToTime(start, 20),
      slot_minutes: 20,
      notes: COORDINATED_NOTE,
    })
    .select("id")
    .single();
  if (blockErr || !block) {
    return { ok: false, error: blockErr?.message ?? "Could not record the time." };
  }

  const { data: updated, error } = await supabase
    .from("assessment_bookings")
    .update({
      block_id: (block as { id: string }).id,
      slot_start: start,
      status: "booked",
    })
    .eq("id", bookingId)
    .eq("status", "requested")
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!updated) return { ok: false, error: "Request not found (or already handled)." };

  await finalizeScheduledRequest(bookingId);
  return { ok: true };
}

/**
 * Mark a booking paid (or unpaid) — at-court cash or e-transfer collected
 * outside Stripe. Mirrors to the Sheet row when the booking has a slot.
 */
export async function setBookingPaid(
  bookingId: string,
  paid: boolean
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createServiceClient();
  const { data: booking, error } = await supabase
    .from("assessment_bookings")
    .update({ paid })
    .eq("id", bookingId)
    .select("*")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!booking) return { ok: false, error: "Booking not found." };

  const row = booking as BookingRow;
  if (row.block_id) {
    const withBlock = await getBookingWithBlock(bookingId);
    if (withBlock) {
      await updateAssessmentRow({
        email: row.email,
        participantId: row.participant_id ?? null,
        slotDate: withBlock.block.block_date,
        slotStart: normTime(row.slot_start ?? ""),
        status: row.status,
        paid,
        creditStatus: row.credit_status,
      });
    }
  }
  return { ok: true };
}
