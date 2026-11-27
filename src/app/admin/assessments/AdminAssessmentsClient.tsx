"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { trackAssessmentCompletedAdmin } from "@/lib/analytics";
import { TierChip } from "@/components/tiers";
import { LEVEL_OPTIONS, formatTierLevel } from "@/lib/tiers";
import { BOOKING_STATUS_LABELS, selfEstimateLine, statusLabel } from "@/lib/adminLabels";
import { AdminLoadProblem } from "@/components/admin/LoadProblem";
import { adminRead, couldNotLoad, keepOnFailure, problemOf, signedOutAmong, type LoadProblem } from "@/lib/adminLoad";
import { KEEP_PAID, MARK_UNPAID, UNDO_PAID, unmarkPaidLine } from "@/lib/assessmentPaid";

// ─── Types (mirror the admin API payloads) ────────────────────────────────────

export type Block = {
  id: string;
  block_date: string;
  start_time: string;
  end_time: string;
  slot_minutes: number;
  location_label: string | null;
  notes: string | null;
};

export type Booking = {
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
  /** "unused" until the $20 has come off a program price, then "applied". */
  credit_status?: string | null;
  level_result: number | null;
  coach_notes: string | null;
  block_date: string;
  block_start: string;
  location_label: string | null;
};

export type RequestRow = {
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
export type OpenSlot = {
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

// ─── Paid: a status, and an Undo that asks first (backlog #104) ───────────────
// A paid booking shows "Paid" as a chip beside its status, never as a button:
// it read like the status chip next to it, and one tap marked the booking
// unpaid. "Undo" is the quiet button under it, and it only opens the line
// below; the booking is marked unpaid from that line's "Mark unpaid" alone.

/** The paid part of a booking's header: the chip and "Undo", or "Mark paid". */
export function PaidStatus({
  paid,
  busy,
  undoing,
  onMarkPaid,
  onAskUndo,
}: {
  paid: boolean;
  busy: boolean;
  /** The confirmation is open under the card: "Undo" steps aside. */
  undoing: boolean;
  onMarkPaid: () => void;
  onAskUndo: () => void;
}) {
  if (!paid) {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={onMarkPaid}
        title="Paid at court or by e-transfer"
        className="mt-1.5 block min-h-[44px] w-full rounded-full bg-white/10 px-3 text-xs font-semibold text-white/80 transition hover:text-white disabled:opacity-40"
      >
        Mark paid
      </button>
    );
  }
  return (
    <>
      <span className="ml-1.5 mt-1 inline-block rounded-full bg-[#B4E655]/15 px-2 py-0.5 text-xs font-semibold text-[#B4E655]">
        Paid
      </span>
      {!undoing && (
        <button
          type="button"
          disabled={busy}
          onClick={onAskUndo}
          className="ml-auto mt-1.5 block min-h-[44px] rounded-full border border-white/20 px-4 text-xs font-semibold text-white/60 transition hover:border-red-400/50 hover:text-red-200 disabled:opacity-40"
        >
          {UNDO_PAID}
        </button>
      )}
    </>
  );
}

/** The line "Undo" opens: what unmarking changes, then the two answers. */
export function UnmarkPaidConfirm({
  line,
  busy,
  error,
  onConfirm,
  onKeep,
}: {
  line: string;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onKeep: () => void;
}) {
  return (
    <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
      <p className="text-xs text-white/60">{line}</p>
      {error && <p className="text-sm text-red-300">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onConfirm}
          className="min-h-[44px] flex-1 rounded-full bg-red-400/80 px-4 py-2 text-sm font-semibold text-[#061427] transition hover:brightness-110 disabled:opacity-40"
        >
          {busy ? "Saving…" : MARK_UNPAID}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onKeep}
          className="min-h-[44px] rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white/70 hover:text-white"
        >
          {KEEP_PAID}
        </button>
      </div>
    </div>
  );
}

export function BookingCard({
  booking,
  onChanged,
}: {
  booking: Booking;
  onChanged: () => void;
}) {
  // "Undo" on a paid booking opens the confirmation; nothing is sent until
  // its "Mark unpaid".
  const [undoing, setUndoing] = useState(false);
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

  async function setPaid(paid: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/assessment/admin/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId: booking.id,
          action: "set_paid",
          paid,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed.");
        setBusy(false);
        return;
      }
      setUndoing(false);
      setBusy(false);
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
            <PaidStatus
              paid={booking.paid}
              busy={busy}
              undoing={undoing}
              onMarkPaid={() => void setPaid(true)}
              onAskUndo={() => {
                setError(null);
                setUndoing(true);
              }}
            />
          )}
        </div>
      </div>

      {undoing && booking.paid && (
        <UnmarkPaidConfirm
          line={unmarkPaidLine(booking)}
          busy={busy}
          error={error}
          onConfirm={() => void setPaid(false)}
          onKeep={() => {
            setUndoing(false);
            setError(null);
          }}
        />
      )}

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
  slotsFailed,
  onChanged,
}: {
  request: RequestRow;
  openSlots: OpenSlot[];
  /** The open slots could not be read: an empty list is not "no open slots". */
  slotsFailed: boolean;
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
              {slotsFailed
                ? `${couldNotLoad("the open slots")} Record a coordinated time instead.`
                : "No open slots — record a coordinated time instead."}
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

export type AssessmentLists = {
  blocks: Block[];
  bookings: Booking[];
  requests: RequestRow[];
  openSlots: OpenSlot[];
};

/** Why each list's own read gave nothing, or null when it answered. */
export type AssessmentProblems = {
  blocks: LoadProblem | null;
  bookings: LoadProblem | null;
  requests: LoadProblem | null;
  openSlots: LoadProblem | null;
  /** The admin sign-in has ended: said once, over the page. */
  signedOut: boolean;
};

export const EMPTY_LISTS: AssessmentLists = { blocks: [], bookings: [], requests: [], openSlots: [] };

type SlotsAnswer = {
  blocks?: Array<{
    blockId: string;
    dateLabel: string;
    slots: Array<{ slotStart: string; timeLabel: string; taken: boolean }>;
  }>;
};

/**
 * The page's four reads, each judged on its own (backlog #104): a list whose
 * read failed keeps the rows already on screen and reports its problem; the
 * others take their new rows. Never an empty list from a failed answer.
 */
export async function loadAssessmentLists(
  previous: AssessmentLists,
  fetchImpl?: Parameters<typeof adminRead>[1]
): Promise<{ lists: AssessmentLists; problems: AssessmentProblems }> {
  const [blocks, bookings, requests, slots] = await Promise.all([
    adminRead<{ blocks?: Block[] }>("/api/assessment/admin/blocks", fetchImpl),
    adminRead<{ bookings?: Booking[] }>("/api/assessment/admin/bookings", fetchImpl),
    adminRead<{ requests?: RequestRow[] }>("/api/assessment/admin/requests", fetchImpl),
    adminRead<SlotsAnswer>("/api/assessment/slots", fetchImpl),
  ]);
  return {
    lists: {
      blocks: keepOnFailure(previous.blocks, blocks, (d) => d.blocks ?? []),
      bookings: keepOnFailure(previous.bookings, bookings, (d) => d.bookings ?? []),
      requests: keepOnFailure(previous.requests, requests, (d) => d.requests ?? []),
      openSlots: keepOnFailure(previous.openSlots, slots, (d) =>
        (d.blocks ?? []).flatMap((b) =>
          b.slots
            .filter((slot) => !slot.taken)
            .map((slot) => ({
              blockId: b.blockId,
              slotStart: slot.slotStart,
              label: `${b.dateLabel} · ${slot.timeLabel}`,
            }))
        )
      ),
    },
    problems: {
      blocks: problemOf(blocks),
      bookings: problemOf(bookings),
      requests: problemOf(requests),
      openSlots: problemOf(slots),
      signedOut: signedOutAmong([blocks, bookings, requests]),
    },
  };
}

/**
 * The line under a section's heading: why its own read gave nothing (with
 * Retry), or, only when that read answered, that the list is empty. A lapsed
 * sign-in is said once over the page, so a section then says nothing.
 */
export function SectionStatus({
  loading,
  problem,
  signedOut,
  what,
  count,
  empty,
  onRetry,
}: {
  loading: boolean;
  problem: LoadProblem | null;
  signedOut: boolean;
  /** What the section's read loads: "the requests". */
  what: string;
  count: number;
  /** The empty-list line, for a section that has one. */
  empty?: string;
  onRetry: () => void;
}) {
  if (loading || signedOut) return null;
  if (problem) {
    return <AdminLoadProblem problem={problem} what={what} here="/admin/assessments" onRetry={onRetry} />;
  }
  if (count === 0 && empty) return <p className="text-sm text-white/60">{empty}</p>;
  return null;
}

export function AdminAssessmentsClient() {
  const [lists, setLists] = useState<AssessmentLists>(EMPTY_LISTS);
  const [problems, setProblems] = useState<AssessmentProblems>({
    blocks: null,
    bookings: null,
    requests: null,
    openSlots: null,
    signedOut: false,
  });
  const [loading, setLoading] = useState(true);
  // The rows on screen, for the next read to keep where it fails.
  const shown = useRef<AssessmentLists>(EMPTY_LISTS);
  const { blocks, bookings, requests, openSlots } = lists;

  // Each list's read is judged on its own (backlog #104): the one that failed
  // says so under its own heading and keeps its rows; the rest refresh.
  const refresh = useCallback(async () => {
    const next = await loadAssessmentLists(shown.current);
    shown.current = next.lists;
    setLists(next.lists);
    setProblems(next.problems);
    setLoading(false);
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
      {problems.signedOut && (
        <AdminLoadProblem
          problem="signed_out"
          what="the assessments"
          here="/admin/assessments"
          onRetry={() => void refresh()}
        />
      )}
      {/* Blocks */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">
          Assessment blocks
        </h2>
        <CreateBlock onCreated={refresh} />
        <SectionStatus
          loading={loading}
          problem={problems.blocks}
          signedOut={problems.signedOut}
          what="the assessment blocks"
          count={blocks.length}
          onRetry={() => void refresh()}
        />
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
        <SectionStatus
          loading={loading}
          problem={problems.requests}
          signedOut={problems.signedOut}
          what="the requests"
          count={requests.length}
          empty="No open requests."
          onRetry={() => void refresh()}
        />
        {requests.map((r) => (
          <RequestCard
            key={r.id}
            request={r}
            openSlots={openSlots}
            slotsFailed={problems.openSlots !== null}
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
        <SectionStatus
          loading={loading}
          problem={problems.bookings}
          signedOut={problems.signedOut}
          what="the bookings"
          count={bookings.length}
          empty="No bookings yet."
          onRetry={() => void refresh()}
        />
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
