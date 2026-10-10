"use client";

import { useCallback, useEffect, useState } from "react";
import { trackAssessmentCompletedAdmin } from "@/lib/analytics";
import { TierChip } from "@/components/tiers";
import { LEVEL_OPTIONS, formatTierLevel } from "@/lib/tiers";
import { BOOKING_STATUS_LABELS, selfEstimateLine, statusLabel } from "@/lib/adminLabels";

// ─── Types (mirror the admin API payloads) ────────────────────────────────────

type Block = {
  id: string;
  block_date: string;
  start_time: string;
  end_time: string;
  slot_minutes: number;
  location_label: string | null;
  notes: string | null;
};

type Booking = {
  id: string;
  slot_start: string;
  name: string;
  email: string;
  /** Who the booking is for, and whose account it sits on (backlog #11). */
  participant_name?: string;
  participant_relationship?: string;
  account_name?: string;
  account_email?: string;
  phone: string | null;
  self_level: string | null;
  status: string;
  paid: boolean;
  level_result: number | null;
  coach_notes: string | null;
  block_date: string;
  block_start: string;
  location_label: string | null;
};

type RequestRow = {
  id: string;
  name: string;
  email: string;
  /** Who the booking is for, and whose account it sits on (backlog #11). */
  participant_name?: string;
  participant_relationship?: string;
  account_name?: string;
  account_email?: string;
  phone: string | null;
  self_level: string | null;
  availability_chips: string[];
  request_note: string | null;
  paid: boolean;
  created_at: string;
};

// Open (untaken) slots for the assign action, flattened from the public API.
type OpenSlot = {
  blockId: string;
  slotStart: string;
  label: string;
};

// Internal blocks created when a request is coordinated manually — hidden from
// the blocks list (they're bookkeeping, not inventory).
const COORDINATED_NOTE = "coordinated-direct";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(t: string): string {
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const hour = h % 12 || 12;
  return m === 0 ? `${hour}${suffix}` : `${hour}:${String(m).padStart(2, "0")}${suffix}`;
}

function fmtDate(dateStr: string): string {
  if (!dateStr) return "";
  const [y, mo, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d)).toLocaleDateString("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

const inputClass =
  "w-full rounded-lg border border-white/35 bg-white/5 px-3 py-2.5 text-base text-white " +
  "placeholder:text-white/45 focus:border-[#B4E655]/60 focus:outline-none focus:ring-2 focus:ring-[#B4E655]/30";

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-400/15 text-amber-200",
  booked: "bg-[#B4E655]/15 text-[#B4E655]",
  completed: "bg-sky-400/15 text-sky-200",
  no_show: "bg-red-400/15 text-red-200",
};

// ─── Create-block form ────────────────────────────────────────────────────────

function CreateBlock({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [start, setStart] = useState("18:00");
  const [end, setEnd] = useState("19:00");
  const [slotMinutes, setSlotMinutes] = useState(20);
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/assessment/admin/blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blockDate: date,
          startTime: start,
          endTime: end,
          slotMinutes,
          locationLabel: location || undefined,
          notes: notes || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create block.");
        setBusy(false);
        return;
      }
      setDate("");
      setLocation("");
      setNotes("");
      setOpen(false);
      onCreated();
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-[44px] w-full rounded-xl border border-dashed border-white/20 px-4 py-3 text-sm font-semibold text-white/70 transition hover:border-[#B4E655]/50 hover:text-white"
      >
        + New assessment block
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4"
    >
      <div>
        <label htmlFor="block-date" className="mb-1 block text-xs text-white/60">Date</label>
        <input
          id="block-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
          className={inputClass}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="block-start" className="mb-1 block text-xs text-white/60">Start</label>
          <input
            id="block-start"
            type="time"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            required
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="block-end" className="mb-1 block text-xs text-white/60">End</label>
          <input
            id="block-end"
            type="time"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            required
            className={inputClass}
          />
        </div>
      </div>
      <div>
        <label htmlFor="block-slot" className="mb-1 block text-xs text-white/60">
          Slot length (minutes)
        </label>
        <input
          id="block-slot"
          type="number"
          min={5}
          step={5}
          value={slotMinutes}
          onChange={(e) => setSlotMinutes(Number(e.target.value))}
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="block-location" className="mb-1 block text-xs text-white/60">
          Location note (optional)
        </label>
        <input
          id="block-location"
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="Court / meeting details"
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="block-notes" className="mb-1 block text-xs text-white/60">Notes (optional)</label>
        <input
          id="block-notes"
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className={inputClass}
        />
      </div>
      {error && <p className="text-sm text-red-300">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="min-h-[44px] flex-1 rounded-full bg-[#B4E655] px-4 py-2 text-sm font-semibold text-[#061427] transition hover:brightness-110 disabled:opacity-40"
        >
          {busy ? "Saving…" : "Create block"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="min-h-[44px] rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white/70 hover:text-white"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ─── Complete-booking form ────────────────────────────────────────────────────

function BookingCard({
  booking,
  onChanged,
}: {
  booking: Booking;
  onChanged: () => void;
}) {
  // The picker starts empty (audit M29): the coach chooses the level, and a
  // one-line confirmation sits between the choice and the email.
  const [level, setLevel] = useState("");
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState<"complete" | "no_show" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const done = booking.status === "completed" || booking.status === "no_show";
  const playerName = booking.participant_name || booking.name;
  const firstName = playerName.trim().split(/\s+/)[0] || "them";

  async function togglePaid() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/assessment/admin/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId: booking.id,
          action: "set_paid",
          paid: !booking.paid,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed.");
        setBusy(false);
        return;
      }
      onChanged();
    } catch {
      setError("Network error.");
      setBusy(false);
    }
  }

  async function act(action: "complete" | "no_show") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/assessment/admin/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId: booking.id,
          action,
          level: action === "complete" ? Number(level) : undefined,
          coachNotes: action === "complete" ? note.trim() : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed.");
        setBusy(false);
        return;
      }
      if (action === "complete") trackAssessmentCompletedAdmin();
      onChanged();
    } catch {
      setError("Network error.");
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-white">
            {booking.participant_name || booking.name}
          </p>
          <p className="truncate text-xs text-white/60">
            <span className="text-white/60">Account: </span>
            {booking.account_name || booking.email}
            {booking.account_email ? ` · ${booking.account_email}` : ` · ${booking.email}`}
          </p>
          {booking.phone && (
            <p className="text-xs text-white/60">{booking.phone}</p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-semibold text-white">
            {fmtTime(booking.slot_start)}
          </p>
          <span
            className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
              STATUS_STYLE[booking.status] ?? "bg-white/10 text-white/60"
            }`}
          >
            {statusLabel(BOOKING_STATUS_LABELS, booking.status)}
          </span>
          {(booking.status === "booked" || booking.status === "completed") && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void togglePaid()}
              title={booking.paid ? "Undo: mark as unpaid" : "Paid at court or by e-transfer"}
              className={`mt-1.5 block min-h-[44px] w-full rounded-full px-3 text-xs font-semibold transition disabled:opacity-40 ${
                booking.paid
                  ? "bg-[#B4E655]/15 text-[#B4E655]"
                  : "bg-white/10 text-white/80 hover:text-white"
              }`}
            >
              {booking.paid ? "Paid ✓" : "Mark paid"}
            </button>
          )}

        </div>
      </div>

      {booking.self_level && (
        <p className="mt-2 text-xs text-white/75">
          {selfEstimateLine(booking.self_level, {
            self: (booking.participant_relationship ?? "self") === "self",
            source: "Self-estimate",
          })}
        </p>
      )}

      {booking.status === "completed" && (
        <div className="mt-3 rounded-lg bg-white/[0.03] p-3">
          <div className="flex flex-wrap items-center gap-2">
            <TierChip level={booking.level_result} showLevel />
          </div>
          {booking.coach_notes && (
            <p className="mt-1 text-sm text-white/70">{booking.coach_notes}</p>
          )}
        </div>
      )}

      {!done && (
        <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
          <div className="grid grid-cols-[auto_1fr] items-center gap-3">
            <label htmlFor={`level-${booking.id}`} className="text-sm text-white/70">
              Level
            </label>
            <select
              id={`level-${booking.id}`}
              value={level}
              onChange={(e) => {
                setLevel(e.target.value);
                setConfirming(null);
              }}
              className={inputClass}
            >
              <option value="" className="bg-[#061427]">
                Pick a level
              </option>
              {LEVEL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value} className="bg-[#061427]">
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          {level && (
            <div className="flex items-center gap-2">
              <TierChip level={level} showLevel />
            </div>
          )}
          <label htmlFor={`note-${booking.id}`} className="sr-only">
            Coach note
          </label>
          <textarea
            id={`note-${booking.id}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="A 2–3 sentence read on their game…"
            className={inputClass}
          />
          {error && <p className="text-sm text-red-300">{error}</p>}
          {confirming === "complete" && level ? (
            <div className="rounded-lg border border-[#B4E655]/30 bg-[#B4E655]/5 p-3">
              <p className="text-sm text-white">
                Send {firstName}: {formatTierLevel(level)}
                {note.trim() ? " + your note" : ""}?
              </p>
              <p className="mt-1 text-xs text-white/60">
                This sets their level and emails them.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => act("complete")}
                  className="min-h-[44px] flex-1 rounded-full bg-[#B4E655] px-4 py-2 text-sm font-semibold text-[#061427] transition hover:brightness-110 disabled:opacity-40"
                >
                  {busy ? "Sending…" : "Send"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirming(null)}
                  className="min-h-[44px] rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white/70 hover:text-white"
                >
                  Back
                </button>
              </div>
            </div>
          ) : confirming === "no_show" ? (
            <div className="rounded-lg border border-red-400/30 bg-red-400/5 p-3">
              <p className="text-sm text-white">Mark {firstName} as a no-show?</p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => act("no_show")}
                  className="min-h-[44px] flex-1 rounded-full border border-red-400/50 px-4 py-2 text-sm font-semibold text-red-200 transition hover:bg-red-400/10 disabled:opacity-40"
                >
                  {busy ? "Saving…" : "Confirm no-show"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirming(null)}
                  className="min-h-[44px] rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white/70 hover:text-white"
                >
                  Back
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy || !level}
                onClick={() => setConfirming("complete")}
                className="min-h-[44px] flex-1 rounded-full bg-[#B4E655] px-4 py-2 text-sm font-semibold text-[#061427] transition hover:brightness-110 disabled:opacity-40"
              >
                Complete + send level
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirming("no_show")}
                className="min-h-[44px] rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white/60 transition hover:border-red-400/50 hover:text-red-200 disabled:opacity-40"
              >
                No-show
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Request card (coordinate-directly queue) ─────────────────────────────────

function RequestCard({
  request,
  openSlots,
  onChanged,
}: {
  request: RequestRow;
  openSlots: OpenSlot[];
  onChanged: () => void;
}) {
  const [mode, setMode] = useState<"idle" | "assign" | "schedule">("idle");
  const [slotKey, setSlotKey] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("18:00");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/assessment/admin/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: request.id, ...body }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed.");
        setBusy(false);
        return false;
      }
      onChanged();
      return true;
    } catch {
      setError("Network error.");
      setBusy(false);
      return false;
    }
  }

  function assign() {
    const [blockId, slotStart] = slotKey.split("|");
    if (!blockId || !slotStart) {
      setError("Pick an open slot.");
      return;
    }
    void post({ action: "assign", blockId, slotStart });
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-white">
            {request.participant_name || request.name}
          </p>
          <p className="truncate text-xs text-white/60">
            <span className="text-white/60">Account: </span>
            {request.account_name || request.email}
            {request.account_email ? ` · ${request.account_email}` : ` · ${request.email}`}
          </p>
          {request.phone && (
            <p className="text-xs text-white/60">{request.phone}</p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <span className="inline-block rounded-full bg-violet-400/15 px-2 py-0.5 text-xs font-semibold text-violet-200">
            {statusLabel(BOOKING_STATUS_LABELS, "requested")}
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={() => void post({ action: "set_paid", paid: !request.paid })}
            className={`mt-1.5 block min-h-[44px] w-full rounded-full px-3 text-xs font-semibold transition disabled:opacity-40 ${
              request.paid
                ? "bg-[#B4E655]/15 text-[#B4E655]"
                : "bg-white/10 text-white/80 hover:text-white"
            }`}
          >
            {request.paid ? "Paid ✓" : "Mark paid"}
          </button>
        </div>
      </div>

      {request.self_level && (
        <p className="mt-2 text-xs text-white/75">
          {selfEstimateLine(request.self_level, {
            self: (request.participant_relationship ?? "self") === "self",
            source: "Self-estimate",
          })}
        </p>
      )}

      {request.availability_chips.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {request.availability_chips.map((chip) => (
            <span
              key={chip}
              className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-medium text-white/70"
            >
              {chip}
            </span>
          ))}
        </div>
      )}

      {request.request_note && (
        <p className="mt-3 border-l-2 border-[#B4E655]/50 pl-3 text-sm italic text-white/70">
          {request.request_note}
        </p>
      )}

      {error && <p className="mt-3 text-sm text-red-300">{error}</p>}

      {mode === "idle" && (
        <div className="mt-4 flex gap-2 border-t border-white/10 pt-4">
          <button
            type="button"
            disabled={busy}
            onClick={() => setMode("assign")}
            className="min-h-[44px] flex-1 rounded-full bg-[#B4E655] px-4 py-2 text-sm font-semibold text-[#061427] transition hover:brightness-110 disabled:opacity-40"
          >
            Assign a slot
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setMode("schedule")}
            className="min-h-[44px] flex-1 rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white/70 transition hover:border-[#B4E655]/50 hover:text-white disabled:opacity-40"
          >
            Record a time
          </button>
        </div>
      )}

      {mode === "assign" && (
        <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
          {openSlots.length === 0 ? (
            <p className="text-sm text-white/60">
              No open slots — record a coordinated time instead.
            </p>
          ) : (
            <>
            <label htmlFor={`slot-${request.id}`} className="sr-only">
              Open slot
            </label>
            <select
              id={`slot-${request.id}`}
              value={slotKey}
              onChange={(e) => setSlotKey(e.target.value)}
              className={inputClass}
            >
              <option value="" className="bg-[#061427]">
                Pick an open slot…
              </option>
              {openSlots.map((s) => (
                <option
                  key={`${s.blockId}|${s.slotStart}`}
                  value={`${s.blockId}|${s.slotStart}`}
                  className="bg-[#061427]"
                >
                  {s.label}
                </option>
              ))}
            </select>
            </>
          )}
          <div className="flex gap-2">
            {openSlots.length > 0 && (
              <button
                type="button"
                disabled={busy || !slotKey}
                onClick={assign}
                className="min-h-[44px] flex-1 rounded-full bg-[#B4E655] px-4 py-2 text-sm font-semibold text-[#061427] transition hover:brightness-110 disabled:opacity-40"
              >
                {busy ? "Assigning…" : "Assign + confirm"}
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => setMode("idle")}
              className="min-h-[44px] rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white/70 hover:text-white"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {mode === "schedule" && (
        <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
          <p className="text-xs text-white/60">
            Already coordinated by phone or email? Record the agreed date and
            time — they&apos;ll get the confirmation email.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={`sched-date-${request.id}`} className="mb-1 block text-xs text-white/60">Date</label>
              <input
                id={`sched-date-${request.id}`}
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor={`sched-time-${request.id}`} className="mb-1 block text-xs text-white/60">Time</label>
              <input
                id={`sched-time-${request.id}`}
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || !date || !time}
              onClick={() => void post({ action: "schedule", date, time })}
              className="min-h-[44px] flex-1 rounded-full bg-[#B4E655] px-4 py-2 text-sm font-semibold text-[#061427] transition hover:brightness-110 disabled:opacity-40"
            >
              {busy ? "Saving…" : "Mark scheduled"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setMode("idle")}
              className="min-h-[44px] rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white/70 hover:text-white"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export function AdminAssessmentsClient() {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [openSlots, setOpenSlots] = useState<OpenSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // A load failure says so, with Retry (audit L23), instead of leaving the
  // lists silently empty.
  const refresh = useCallback(async () => {
    setLoadError(null);
    try {
      const [bRes, kRes, rRes, sRes] = await Promise.all([
        fetch("/api/assessment/admin/blocks"),
        fetch("/api/assessment/admin/bookings"),
        fetch("/api/assessment/admin/requests"),
        fetch("/api/assessment/slots"),
      ]);
      if (![bRes, kRes, rRes].every((r) => r.ok)) {
        setLoadError("Couldn't load the assessment lists.");
      }
      const bData = await bRes.json();
      const kData = await kRes.json();
      const rData = await rRes.json();
      const sData = await sRes.json();
      setBlocks(bData.blocks ?? []);
      setBookings(kData.bookings ?? []);
      setRequests(rData.requests ?? []);
      setOpenSlots(
        ((sData.blocks ?? []) as Array<{
          blockId: string;
          dateLabel: string;
          slots: Array<{ slotStart: string; timeLabel: string; taken: boolean }>;
        }>).flatMap((b) =>
          b.slots
            .filter((s) => !s.taken)
            .map((s) => ({
              blockId: b.blockId,
              slotStart: s.slotStart,
              label: `${b.dateLabel} · ${s.timeLabel}`,
            }))
        )
      );
    } catch {
      // Keep what is on screen, and say the refresh failed.
      setLoadError("Couldn't reach the server.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Group bookings by day for the list view.
  const byDay = bookings.reduce<Record<string, Booking[]>>((acc, b) => {
    const key = b.block_date || "—";
    (acc[key] ??= []).push(b);
    return acc;
  }, {});
  const days = Object.keys(byDay).sort();

  return (
    <div className="space-y-10">
      {loadError && (
        <div className="flex flex-wrap items-center gap-3">
          <p role="alert" className="text-sm text-red-300">
            {loadError}
          </p>
          <button
            type="button"
            onClick={() => void refresh()}
            className="min-h-[44px] rounded-full border border-white/20 px-4 text-sm font-semibold text-white/70 hover:text-white"
          >
            Retry
          </button>
        </div>
      )}
      {/* Blocks */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">
          Assessment blocks
        </h2>
        <CreateBlock onCreated={refresh} />
        {blocks.length > 0 && (
          <ul className="space-y-2">
            {blocks
              .filter((b) => b.notes !== COORDINATED_NOTE)
              .map((b) => (
              <li
                key={b.id}
                className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-semibold text-white">
                    {fmtDate(b.block_date)}
                  </p>
                  <p className="text-xs text-white/60">
                    {fmtTime(b.start_time)}–{fmtTime(b.end_time)} · {b.slot_minutes}
                    -min slots
                    {b.location_label ? ` · ${b.location_label}` : ""}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Requests — coordinate-directly queue */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">
          Requests
        </h2>
        {!loading && requests.length === 0 && (
          <p className="text-sm text-white/60">No open requests.</p>
        )}
        {requests.map((r) => (
          <RequestCard
            key={r.id}
            request={r}
            openSlots={openSlots}
            onChanged={refresh}
          />
        ))}
      </section>

      {/* Bookings */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">
          Bookings
        </h2>
        {loading && <p className="text-sm text-white/60">Loading…</p>}
        {!loading && bookings.length === 0 && (
          <p className="text-sm text-white/60">No bookings yet.</p>
        )}
        {days.map((day) => (
          <div key={day} className="space-y-3">
            <p className="text-sm font-semibold text-[#B4E655]">{fmtDate(day)}</p>
            {byDay[day]
              .slice()
              .sort((a, b) => a.slot_start.localeCompare(b.slot_start))
              .map((b) => (
                <BookingCard key={b.id} booking={b} onChanged={refresh} />
              ))}
          </div>
        ))}
      </section>
    </div>
  );
}
