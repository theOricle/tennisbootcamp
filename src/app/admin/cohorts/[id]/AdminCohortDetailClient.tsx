"use client";

import { useCallback, useEffect, useState } from "react";
import type { Cohort } from "@/types/cohort";
import { trackCohortInviteSent } from "@/lib/analytics";
import { inviteNotice } from "@/lib/emailResult";
import { TierRangeBadges } from "@/components/tiers";
import { AvailabilityMatrix } from "@/components/admin/AvailabilityMatrix";
import { PlayerPreview } from "@/components/admin/PlayerPreview";
import type { MatrixPlayer } from "@/lib/availabilityMatrix";
import { dayNameForDate } from "@/lib/makeup";
import { perClassFigure, perClassLine } from "@/lib/groupBlocks";
import { accountEmailOffered } from "@/lib/enrollPlayers";
import {
  COHORT_STATUS_LABELS,
  INVITE_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  adminMoney as money,
  programTitleFor,
  statusLabel,
} from "@/lib/adminLabels";
import {
  BACK_TO_DRAFT_BUTTON,
  OPEN_BUTTON,
  OPEN_LINE,
  PRIVATE_LINE,
  openingControl,
  type OpeningControl,
  type OpeningMove,
} from "@/lib/cohortOpening";
import { AdminLoadProblem } from "@/components/admin/LoadProblem";
import { adminRead, type LoadProblem } from "@/lib/adminLoad";

type PaymentMode = "card" | "etransfer";

export type InviteRow = {
  id: string;
  /** The account holder's email — one payer, one inbox. */
  email: string;
  /** Which player on that account the spot is for (backlog #11). */
  participant_name?: string;
  account_name?: string;
  token: string;
  status: "invited" | "paid" | "declined" | "expired";
  invited_at: string;
  expires_at: string;
  // E-transfer rail (migration 0006)
  payment_method: PaymentMode | null;
  payment_note: string | null;
  paid_at: string | null;
  amountDueCents: number | null; // price − assessment credit; null once paid
};

type SessionRow = {
  id: string;
  session_date: string;
  start_time: string;
  end_time: string;
  status: "scheduled" | "completed" | "cancelled";
  cancellation_reason: string | null;
  makeup_for: string | null;
};

/** One card payment, as the cohort API lists it (backlog #84). */
type PaymentRow = {
  id: string;
  participantName: string | null;
  contactEmail: string | null;
  status: string;
  createdAt: string | null;
};

type Detail = {
  cohort: Cohort;
  invites: InviteRow[];
  sessions: SessionRow[];
  memberCount: number;
  /** Paid players by name, for the Cancel cohort confirmation (audit M30). */
  paidPlayers?: string[];
  paidCount: number;
  /** Card payments by state; absent from an older API response. */
  payments?: PaymentRow[];
};

const inputClass =
  "w-full rounded-lg border border-white/35 bg-white/5 px-3 py-2.5 text-base text-white " +
  "placeholder:text-white/45 focus:border-[#B4E655]/60 focus:outline-none focus:ring-2 focus:ring-[#B4E655]/30";

const INVITE_STYLE: Record<string, string> = {
  invited: "bg-amber-400/15 text-amber-200",
  paid: "bg-[#B4E655]/15 text-[#B4E655]",
  expired: "bg-white/10 text-white/60",
  declined: "bg-red-400/15 text-red-200",
};

/** A card payment's chip (backlog #84): only real money reads lime. */
const PAYMENT_STYLE: Record<string, string> = {
  paid: "bg-[#B4E655]/15 text-[#B4E655]",
  test_paid: "bg-white/10 text-white/70",
  refunded: "bg-white/10 text-white/60",
  disputed: "bg-red-400/15 text-red-200",
};

const REASONS = [
  { value: "weather", label: "Weather" },
  { value: "court", label: "Court" },
  { value: "coach", label: "Coach" },
  { value: "other", label: "Other" },
] as const;

function fmtTime(t: string): string {
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const hour = h % 12 || 12;
  return m === 0 ? `${hour}${suffix}` : `${hour}:${String(m).padStart(2, "0")}${suffix}`;
}

function fmtDate(iso: string): string {
  const [y, mo, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d)).toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-CA", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const METHOD_LABEL: Record<PaymentMode, string> = {
  card: "card",
  etransfer: "e-transfer",
};

// ─── Card payments (backlog #84) ──────────────────────────────────────────────
// What Stripe (or mock mode) recorded for this cohort, row by row. A test
// payment took no money: it holds no seat and never counts toward the
// minimum, and the chip says so.

function CardPayments({ payments }: { payments: PaymentRow[] }) {
  if (payments.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">
        Card payments
      </h2>
      <p className="text-xs text-white/60">
        A test payment took no money, holds no seat and never counts toward the
        minimum. A full refund or a dispute in Stripe releases the seat.
      </p>
      <ul className="space-y-2">
        {payments.map((p) => (
          <li
            key={p.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3"
          >
            <div className="min-w-0">
              <p className="truncate text-sm text-white">
                {p.participantName?.trim() || p.contactEmail || "Player"}
              </p>
              <p className="truncate text-xs text-white/60">
                {p.contactEmail ?? ""}
                {p.createdAt ? ` · ${fmtDateTime(p.createdAt)}` : ""}
              </p>
            </div>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                PAYMENT_STYLE[p.status] ?? "bg-white/10 text-white/60"
              }`}
            >
              {statusLabel(PAYMENT_STATUS_LABELS, p.status)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ─── Invite row: status + mark paid / undo (e-transfer rail) ──────────────────

/** Outcome of the player receipt that mark-paid sends (backlog #15). */
type Receipt =
  | { status: "sent" }
  | { status: "skipped"; detail: string }
  | { status: "failed"; detail: string };

function receiptLine(receipt: Receipt): string {
  if (receipt.status === "sent") return "Receipt emailed to the player.";
  if (receipt.status === "skipped") return receipt.detail;
  return `Receipt email failed — the payment is still recorded. ${receipt.detail}`;
}

export function InviteItem({
  cohortId,
  invite,
  onChanged,
}: {
  cohortId: string;
  invite: InviteRow;
  onChanged: () => void;
}) {
  const [mode, setMode] = useState<"idle" | "paying" | "undoing">("idle");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // What the mark-paid receipt did (backlog #15) — the payment is recorded
  // whatever happens here, so this reports rather than blocks.
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  // What "Send account email" did (owner, 2026-10-12): the guest's set-up
  // email, or the enrolled note, sent again by hand.
  const [accountEmail, setAccountEmail] = useState<string | null>(null);

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/cohorts/${cohortId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed.");
        setBusy(false);
        return;
      }
      setReceipt(body.action === "mark_paid" ? (data.receipt ?? null) : null);
      if (body.action === "account_link") {
        const outcome = data.accountEmail as { status: "sent" } | { status: "failed"; detail: string } | undefined;
        setAccountEmail(
          outcome?.status === "sent"
            ? "Account email sent to the player."
            : `Account email failed. ${outcome?.status === "failed" ? outcome.detail : ""}`.trim()
        );
      } else {
        setAccountEmail(null);
      }
      setMode("idle");
      setNote("");
      onChanged();
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  }

  const payable = invite.status === "invited" || invite.status === "expired";
  const method = invite.payment_method ? METHOD_LABEL[invite.payment_method] : null;

  let meta: string;
  if (invite.status === "paid") {
    meta = `Paid${method ? ` by ${method}` : ""}${invite.paid_at ? ` · ${fmtDateTime(invite.paid_at)}` : ""}`;
  } else {
    const parts: string[] = [];
    if (invite.payment_method === "etransfer") parts.push("E-transfer sent, awaiting receipt");
    if (invite.amountDueCents != null) parts.push(`${money(invite.amountDueCents)} due`);
    meta = parts.join(" · ");
  }

  // The status chip, drawn once per width: beside the name on a phone, before
  // the buttons from 640px (where it is the element it always was).
  const chip = (where: string) => (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
        INVITE_STYLE[invite.status] ?? "bg-white/10 text-white/60"
      } ${where}`}
    >
      {statusLabel(INVITE_STATUS_LABELS, invite.status)}
    </span>
  );
  // The row's buttons show only while nothing is open under it.
  const hasButtons = mode === "idle" && (payable || invite.status === "paid" || accountEmailOffered(invite));

  // On a phone (backlog #104) the row stacks: the chip on the name line, the
  // name, the account and the notes wrapped in full, and the buttons on a
  // line of their own under the text, the main one first. In one line the
  // name column was about 60px wide. From 640px it is the one line it always
  // was: every phone-only class is `max-sm:`, the chip beside the name is
  // hidden there and the one before the buttons shows.
  return (
    <li className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
      <div className="flex items-center justify-between gap-3 max-sm:flex-col max-sm:items-stretch max-sm:gap-2">
        <div className="min-w-0">
          <div className="max-sm:flex max-sm:items-start max-sm:justify-between max-sm:gap-2">
            <p className="text-sm text-white max-sm:min-w-0 max-sm:[overflow-wrap:anywhere] sm:truncate">
              {invite.participant_name || invite.email}
            </p>
            {chip("shrink-0 sm:hidden")}
          </div>
          {/* Two players under one payer read as two rows, told apart here. */}
          <p className="text-xs text-white/60 max-sm:mt-0.5 max-sm:[overflow-wrap:anywhere] sm:truncate">
            <span className="text-white/60">Account: </span>
            {invite.account_name && invite.account_name !== invite.email
              ? `${invite.account_name} · ${invite.email}`
              : invite.email}
          </p>
          {meta && <p className="mt-0.5 text-xs text-white/60 max-sm:[overflow-wrap:anywhere]">{meta}</p>}
          {invite.payment_note && (
            <p className="mt-0.5 text-xs text-white/60 max-sm:[overflow-wrap:anywhere]">{invite.payment_note}</p>
          )}
          {receipt && (
            <p
              className={`mt-0.5 text-xs ${
                receipt.status === "failed" ? "text-red-300" : "text-white/60"
              }`}
            >
              {receiptLine(receipt)}
            </p>
          )}
          {accountEmail && (
            <p
              className={`mt-0.5 text-xs ${
                accountEmail.startsWith("Account email failed") ? "text-red-300" : "text-white/60"
              }`}
            >
              {accountEmail}
            </p>
          )}
        </div>
        <div
          className={`flex shrink-0 items-center gap-2 max-sm:flex-wrap${hasButtons ? "" : " max-sm:hidden"}`}
          data-invite-actions=""
        >
          {chip("max-sm:hidden")}
          {payable && mode === "idle" && (
            <button
              type="button"
              onClick={() => setMode("paying")}
              className="min-h-[44px] rounded-full border border-white/20 px-3 text-xs font-semibold text-white/70 transition hover:border-[#B4E655]/50 hover:text-white max-sm:border-white/35 max-sm:px-4 max-sm:text-sm max-sm:text-white"
            >
              Mark paid…
            </button>
          )}
          {invite.status === "paid" && mode === "idle" && (
            <button
              type="button"
              onClick={() => setMode("undoing")}
              className="min-h-[44px] rounded-full border border-white/20 px-3 text-xs font-semibold text-white/60 transition hover:border-red-400/50 hover:text-red-200 max-sm:px-4 max-sm:text-sm"
            >
              Undo
            </button>
          )}
          {/* Only where someone enrolled: paid, or an e-transfer on its way.
              A bare or expired invitation has no enrollment for the email to
              describe, and the route refuses it too. On a phone it is the
              quieter of the two: words alone, after the main button. */}
          {accountEmailOffered(invite) && mode === "idle" && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void post({ action: "account_link", inviteId: invite.id })}
              className="min-h-[44px] rounded-full border border-white/20 px-3 text-xs font-semibold text-white/60 transition hover:border-[#B4E655]/50 hover:text-white disabled:opacity-40 max-sm:border-transparent max-sm:px-2 max-sm:text-sm max-sm:underline max-sm:underline-offset-4"
            >
              Send account email
            </button>
          )}
        </div>
      </div>

      {mode === "paying" && (
        <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
          <label htmlFor={`note-${invite.id}`} className="block text-xs text-white/60">
            Note (optional) — what arrived and when
          </label>
          <input
            id={`note-${invite.id}`}
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e-transfer received 2026-09-30, ref C1A2B3"
            maxLength={500}
            className={inputClass}
          />
          {error && <p className="text-sm text-red-300">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void post({ action: "mark_paid", inviteId: invite.id, note })}
              className="min-h-[44px] flex-1 rounded-full bg-[#B4E655] px-4 py-2 text-sm font-semibold text-[#061427] transition hover:brightness-110 disabled:opacity-40"
            >
              {busy ? "Saving…" : "Confirm paid"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setMode("idle");
                setError(null);
              }}
              className="min-h-[44px] rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white/70 hover:text-white"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {mode === "undoing" && (
        <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
          <p className="text-xs text-white/60">
            Undo puts the invite back to unpaid without deleting it. A cohort
            that already confirmed stays confirmed.
          </p>
          {error && <p className="text-sm text-red-300">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void post({ action: "mark_unpaid", inviteId: invite.id })}
              className="min-h-[44px] flex-1 rounded-full bg-red-400/80 px-4 py-2 text-sm font-semibold text-[#061427] transition hover:brightness-110 disabled:opacity-40"
            >
              {busy ? "Saving…" : "Mark unpaid"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setMode("idle");
                setError(null);
              }}
              className="min-h-[44px] rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white/70 hover:text-white"
            >
              Keep paid
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

// ─── Payment mode (cohort settings) ───────────────────────────────────────────

function PaymentSettings({
  cohortId,
  paymentMode,
  onChanged,
}: {
  cohortId: string;
  paymentMode: PaymentMode;
  onChanged: () => void;
}) {
  const [mode, setMode] = useState<PaymentMode>(paymentMode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMode(paymentMode);
  }, [paymentMode]);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/cohorts/${cohortId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", paymentMode: mode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "That didn't save. Try again.");
        setBusy(false);
        return;
      }
      onChanged();
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">
        Payment
      </h2>
      <div className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-4">
        <label htmlFor="cohort-payment-mode" className="block text-xs text-white/60">
          How players pay
        </label>
        <select
          id="cohort-payment-mode"
          value={mode}
          onChange={(e) => setMode(e.target.value as PaymentMode)}
          className={inputClass}
        >
          <option value="card" className="bg-[#061427]">Card (Stripe Checkout)</option>
          <option value="etransfer" className="bg-[#061427]">E-transfer (you mark invites paid)</option>
        </select>
        <p className="text-xs text-white/60">
          {mode === "etransfer"
            ? "Players get e-transfer instructions in the enroll wizard and tap “I've sent it”; you mark each invite paid below when the money lands. Card checkout stays available as a secondary link."
            : "Players pay by card at checkout; Stripe marks the invite paid."}
        </p>
        {error && <p className="text-sm text-red-300">{error}</p>}
        <button
          type="button"
          disabled={busy || mode === paymentMode}
          onClick={() => void save()}
          className="min-h-[44px] rounded-full bg-[#B4E655] px-5 py-2 text-sm font-semibold text-[#061427] transition hover:brightness-110 disabled:opacity-40"
        >
          {busy ? "Saving…" : "Save payment mode"}
        </button>
      </div>
    </section>
  );
}

// ─── Invite section ───────────────────────────────────────────────────────────

function InviteSection({
  cohortId,
  invites,
  canInvite,
  selected,
  onClearSelection,
  onChanged,
}: {
  cohortId: string;
  invites: InviteRow[];
  canInvite: boolean;
  /** Players ticked in "Who's free" (audit M28): id and name. */
  selected: { id: string; name: string }[];
  onClearSelection: () => void;
  onChanged: () => void;
}) {
  const [emails, setEmails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Invite the ticked players (by participant id), or — the fallback — the
  // typed emails, which go to each account holder's own spot.
  async function send(by: "players" | "emails") {
    const list = emails
      .split(/[\s,;]+/)
      .map((e) => e.trim())
      .filter(Boolean);
    if (by === "emails" && list.length === 0) {
      setError("Add at least one email.");
      return;
    }
    if (by === "players" && selected.length === 0) {
      setError("Tick at least one player in Who's free.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/cohorts/${cohortId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          by === "players"
            ? { action: "invite", participantIds: selected.map((p) => p.id) }
            : { action: "invite", emails: list }
        ),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Invites failed.");
        setBusy(false);
        return;
      }
      const created: number = data.sent ?? 0;
      // Count the emails that actually left, not the rows we wrote.
      const emailed: number = data.emailed ?? created;
      trackCohortInviteSent(cohortId, emailed);
      if (by === "players") onClearSelection();
      else setEmails("");

      const message = inviteNotice({
        created,
        emailed,
        errors: Array.isArray(data.errors) ? data.errors : [],
      });
      // A held spot whose email never went out is a failure the coach has to
      // act on, so it reads as an error rather than a passing note.
      if (emailed < created) setError(message);
      else setNotice(message);
      onChanged();
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">
        Invites
      </h2>
      {canInvite ? (
        <div className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-4">
          {/* Players first (audit M28): each tick is a participant, so a
              child's invite holds the child's spot with the child's credit. */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-white/60">
              Ticked in Who&apos;s free
            </p>
            {selected.length === 0 ? (
              <p className="text-sm text-white/60">
                Open a cell above and tick the players to invite.
              </p>
            ) : (
              <ul className="flex flex-wrap gap-1.5" aria-label="Players to invite">
                {selected.map((p) => (
                  <li
                    key={p.id}
                    className="rounded-full border border-[#B4E655]/40 bg-[#B4E655]/10 px-2.5 py-1 text-xs font-semibold text-white"
                  >
                    {p.name}
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy || selected.length === 0}
                onClick={() => void send("players")}
                className="min-h-[44px] flex-1 rounded-full bg-[#B4E655] px-4 py-2 text-sm font-semibold text-[#061427] transition hover:brightness-110 disabled:opacity-40"
              >
                {busy
                  ? "Sending…"
                  : selected.length === 0
                    ? "Invite ticked players"
                    : `Invite ${selected.length} player${selected.length === 1 ? "" : "s"} (48h hold)`}
              </button>
              {selected.length > 0 && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={onClearSelection}
                  className="min-h-[44px] rounded-full border border-white/20 px-4 text-sm font-semibold text-white/70 hover:text-white"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="space-y-2 border-t border-white/10 pt-4">
            <label htmlFor="invite-emails" className="block text-xs text-white/60">
              Or invite by email (comma, space, or line separated). Each goes to that account holder&apos;s own spot.
            </label>
            <textarea
              id="invite-emails"
              value={emails}
              onChange={(e) => setEmails(e.target.value)}
              rows={2}
              placeholder="player1@example.com, player2@example.com"
              className={inputClass}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => void send("emails")}
              className="min-h-[44px] w-full rounded-full border border-white/25 px-4 py-2 text-sm font-semibold text-white/80 transition hover:border-[#B4E655]/50 hover:text-white disabled:opacity-40"
            >
              {busy ? "Sending…" : "Send email invites (48h hold)"}
            </button>
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-300">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="text-sm text-yellow-200">
              {notice}
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm text-white/60">
          Invites go out while the cohort is draft or open. Re-invite from
          those states; an expired invite gets a fresh link the same way.
        </p>
      )}

      {invites.length === 0 ? (
        <p className="text-sm text-white/60">No invites yet.</p>
      ) : (
        <ul className="space-y-2">
          {invites.map((i) => (
            <InviteItem key={i.id} cohortId={cohortId} invite={i} onChanged={onChanged} />
          ))}
        </ul>
      )}
    </section>
  );
}

// ─── Sessions section ─────────────────────────────────────────────────────────

function SessionRowItem({
  cohortId,
  session,
  onChanged,
}: {
  cohortId: string;
  session: SessionRow;
  onChanged: () => void;
}) {
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState<(typeof REASONS)[number]["value"]>("weather");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancel() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/cohorts/${cohortId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "cancel_session",
          sessionId: session.id,
          reason,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Cancel failed.");
        setBusy(false);
        return;
      }
      onChanged();
    } catch {
      setError("Network error.");
      setBusy(false);
    }
  }

  const cancelled = session.status === "cancelled";

  return (
    <li
      className={`rounded-xl border px-4 py-3 ${
        cancelled
          ? "border-white/5 bg-white/[0.02] opacity-60"
          : "border-white/10 bg-white/5"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className={`text-sm font-semibold ${cancelled ? "text-white/60 line-through" : "text-white"}`}>
            {dayNameForDate(session.session_date)} {fmtDate(session.session_date)} ·{" "}
            {fmtTime(session.start_time)}–{fmtTime(session.end_time)}
          </p>
          <div className="mt-0.5 flex flex-wrap gap-2 text-xs">
            {session.makeup_for && (
              <span className="rounded-full bg-sky-400/15 px-2 py-0.5 font-semibold text-sky-200">
                Make-up
              </span>
            )}
            {cancelled && (
              <span className="rounded-full bg-red-400/15 px-2 py-0.5 font-semibold text-red-200">
                Cancelled
                {session.cancellation_reason
                  ? ` · ${REASONS.find((r) => r.value === session.cancellation_reason)?.label ?? session.cancellation_reason}`
                  : ""}
              </span>
            )}
          </div>
        </div>
        {!cancelled && !cancelling && (
          <button
            type="button"
            onClick={() => setCancelling(true)}
            className="min-h-[44px] shrink-0 rounded-full border border-white/20 px-4 text-sm font-semibold text-white/60 transition hover:border-red-400/50 hover:text-red-200"
          >
            Cancel…
          </button>
        )}
      </div>

      {cancelling && !cancelled && (
        <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
          <div className="flex flex-wrap gap-2">
            {REASONS.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setReason(r.value)}
                className={`min-h-[44px] rounded-full px-4 text-sm font-semibold transition ${
                  reason === r.value
                    ? "bg-[#B4E655] text-[#061427]"
                    : "border border-white/20 text-white/70 hover:text-white"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          {error && <p className="text-sm text-red-300">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void cancel()}
              className="min-h-[44px] flex-1 rounded-full bg-red-400/80 px-4 py-2 text-sm font-semibold text-[#061427] transition hover:brightness-110 disabled:opacity-40"
            >
              {busy ? "Cancelling…" : "Cancel session + set make-up"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setCancelling(false)}
              className="min-h-[44px] rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white/70 hover:text-white"
            >
              Keep it
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

// ─── Open to the public / Back to draft (backlog #95) ─────────────────────────
// One row at the top of the status controls, at most one per cohort
// (openingControl, src/lib/cohortOpening.ts): a public draft whose first class
// is still ahead gets the button and its line, a private draft the line
// alone, and an open cohort with no seat held or paid "Back to draft". The
// API checks the same rules again; a refusal shows in the status line.

/** The style of the "Reopen cohort" button, shared by both. */
const OPENING_BUTTON_CLASS =
  "min-h-[44px] rounded-full border border-white/20 px-4 text-sm font-semibold text-white/80 hover:border-[#B4E655]/50 hover:text-white disabled:opacity-40";

export function OpeningControls({
  control,
  busy,
  onMove,
}: {
  control: OpeningControl;
  busy: boolean;
  onMove: (move: OpeningMove) => void;
}) {
  if (control === "open") {
    return (
      <div className="mb-1 basis-full">
        <button
          type="button"
          disabled={busy}
          onClick={() => onMove("open")}
          aria-describedby="opening-line"
          className={OPENING_BUTTON_CLASS}
        >
          {OPEN_BUTTON}
        </button>
        <p id="opening-line" className="mt-2 text-xs text-white/60">
          {OPEN_LINE}
        </p>
      </div>
    );
  }
  if (control === "private") {
    return <p className="mb-1 basis-full text-xs text-white/60">{PRIVATE_LINE}</p>;
  }
  if (control === "back_to_draft") {
    return (
      <div className="basis-full">
        <button
          type="button"
          disabled={busy}
          onClick={() => onMove("back_to_draft")}
          className={OPENING_BUTTON_CLASS}
        >
          {BACK_TO_DRAFT_BUTTON}
        </button>
      </div>
    );
  }
  return null;
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export function AdminCohortDetailClient({ cohortId }: { cohortId: string }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [problem, setProblem] = useState<LoadProblem | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [pool, setPool] = useState<MatrixPlayer[]>([]);
  const [poolLoading, setPoolLoading] = useState(true);
  const [poolError, setPoolError] = useState(false);
  // Players ticked in "Who's free" for an invite (audit M28).
  const [ticked, setTicked] = useState<Set<string>>(() => new Set());

  function toggleTick(id: string) {
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Leveled pool for the who's-free matrix above the invite box.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/players?view=leveled")
      .then((r) => {
        if (!r.ok) throw new Error("pool");
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;
        setPool(
          (data.players ?? []).map(
            (p: { id: string; name: string | null; level: number | null; availability: unknown }) => ({
              id: p.id,
              name: p.name,
              level: p.level,
              availability: p.availability,
            })
          )
        );
      })
      .catch(() => {
        if (!cancelled) setPoolError(true);
      })
      .finally(() => {
        if (!cancelled) setPoolLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // A read that fails says so and keeps the cohort already on screen
  // (backlog #104): a refresh after an action never blanks the page.
  const refresh = useCallback(async () => {
    const result = await adminRead<Detail>(`/api/admin/cohorts/${cohortId}`, undefined, (d) => Boolean(d.cohort));
    if (result.ok) {
      setProblem(null);
      setDetail(result.data);
    } else {
      setProblem(result.problem);
    }
  }, [cohortId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Status changes report a refusal instead of swallowing it (audit M30).
  async function postStatus(body: Record<string, unknown>): Promise<boolean> {
    setStatusBusy(true);
    setStatusError(null);
    try {
      const res = await fetch(`/api/admin/cohorts/${cohortId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatusError(typeof data.error === "string" ? data.error : "That didn't save. Try again.");
        return false;
      }
      await refresh();
      return true;
    } catch {
      setStatusError("Network error. Try again.");
      return false;
    } finally {
      setStatusBusy(false);
    }
  }

  const setStatus = (status: string) => postStatus({ action: "set_status", status });

  const loadProblem = problem && (
    <AdminLoadProblem
      problem={problem}
      what="this cohort"
      here={`/admin/cohorts/${cohortId}`}
      onRetry={() => void refresh()}
    />
  );
  if (!detail) return loadProblem || <p className="text-sm text-white/60">Loading…</p>;

  const { cohort, invites, sessions, paidCount } = detail;
  // The per-class figure the sign-up page shows (backlog #86), from the
  // block's own row: the session list below may hold a cancelled class and
  // its make-up, and the figure counts that class once.
  const perClass = perClassFigure(cohort);
  const dbStatus = cohort.dbStatus ?? "draft";
  // Open to the public / Back to draft (backlog #95), judged on what this
  // page has read, its invites and its card payments. The API reads the
  // Sheet's paid rows as well before it moves anything.
  const opening = openingControl(cohort, {
    inviteStatuses: invites.map((i) => i.status),
    enrollmentStatuses: (detail.payments ?? []).map((p) => p.status),
    sheetPaidRows: null,
  });
  const paidPlayers = detail.paidPlayers ?? [];
  const selected = pool
    .filter((p) => ticked.has(p.id))
    .map((p) => ({ id: p.id, name: (p.name ?? "").trim() || "Unnamed player" }));

  return (
    <div className="space-y-8">
      {/* A refresh that failed: said here, over the cohort as it was last read. */}
      {loadProblem}
      {/* Header */}
      <header>
        <h1 className="text-2xl font-semibold text-white">{cohort.label}</h1>
        <p className="mt-1 text-sm text-white/60">
          {programTitleFor(cohort.programId)} · starts {fmtDate(cohort.startDate)} · {cohort.weeks} wk ·{" "}
          ${(cohort.priceCents / 100).toFixed(0)} · {cohort.capacityMin}–{cohort.capacityMax} players
          {cohort.visibility === "private" ? " · private" : " · public"}
          {cohort.paymentMode === "etransfer" ? " · e-transfer" : " · card"}
        </p>
        {/* Read-only, beside the price: this page edits no price, weeks or class days. */}
        {perClass && <p className="mt-0.5 text-xs tabular-nums text-white/60">{perClassLine(perClass)}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <TierRangeBadges levelMin={cohort.levelMin} levelMax={cohort.levelMax} />
          <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold text-white/80">
            {statusLabel(COHORT_STATUS_LABELS, dbStatus)}
          </span>
          <span className="text-xs text-white/60">
            {paidCount}/{cohort.capacityMin} paid to run
          </span>
        </div>
      </header>

      {cohort.creditFollowup && (
        <p className="rounded-lg border border-yellow-400/30 bg-yellow-400/10 px-3 py-2 text-sm text-yellow-200">
          Cancellations passed the make-up cap — those sessions convert to
          credit. Follow up with the group about amounts.
        </p>
      )}

      {/* What players will see: the dashboard art for this cohort. */}
      <PlayerPreview
        programId={cohort.programId}
        levelMin={cohort.levelMin ?? null}
        levelMax={cohort.levelMax ?? null}
        sessions={cohort.sessions}
        seed={cohort.id}
        className="max-w-xl"
      />

      {/* Status controls */}
      <div className="flex flex-wrap gap-2">
        <OpeningControls
          control={opening}
          busy={statusBusy}
          onMove={(move) => void postStatus({ action: move })}
        />
        {dbStatus === "confirmed" && (
          <button
            type="button"
            disabled={statusBusy}
            onClick={() => void setStatus("running")}
            className="min-h-[44px] rounded-full border border-white/20 px-4 text-sm font-semibold text-white/70 hover:text-white disabled:opacity-40"
          >
            Mark running
          </button>
        )}
        {["confirmed", "running"].includes(dbStatus) && (
          <button
            type="button"
            disabled={statusBusy}
            onClick={() => void setStatus("completed")}
            className="min-h-[44px] rounded-full border border-white/20 px-4 text-sm font-semibold text-white/70 hover:text-white disabled:opacity-40"
          >
            Mark completed
          </button>
        )}
        {dbStatus !== "cancelled" && dbStatus !== "completed" && !confirmingCancel && (
          <button
            type="button"
            disabled={statusBusy}
            onClick={() => {
              setStatusError(null);
              setConfirmingCancel(true);
            }}
            className="min-h-[44px] rounded-full border border-white/20 px-4 text-sm font-semibold text-white/70 hover:border-red-400/50 hover:text-red-200 disabled:opacity-40"
          >
            Cancel cohort…
          </button>
        )}
        {/* Undo (audit M30): back to the status its invites support. */}
        {dbStatus === "cancelled" && (
          <button
            type="button"
            disabled={statusBusy}
            onClick={() => void postStatus({ action: "reopen" })}
            className="min-h-[44px] rounded-full border border-white/20 px-4 text-sm font-semibold text-white/80 hover:border-[#B4E655]/50 hover:text-white disabled:opacity-40"
          >
            {statusBusy ? "Reopening…" : "Reopen cohort"}
          </button>
        )}
      </div>

      {/* The confirmation sheet (audit M30): who has paid, and that nobody is
          told automatically. What a cancellation tells players is open
          (owner decision D22), so no email goes out from here. */}
      {confirmingCancel && dbStatus !== "cancelled" && (
        <div role="alertdialog" aria-labelledby="cancel-title" aria-describedby="cancel-body" className="space-y-3 rounded-xl border border-red-400/30 bg-red-400/5 p-4">
          <p id="cancel-title" className="text-sm font-semibold text-white">
            Cancel {cohort.label}?
          </p>
          <div id="cancel-body" className="space-y-2 text-sm text-white/75">
            {paidPlayers.length > 0 ? (
              <>
                <p>
                  {paidPlayers.length} paid player{paidPlayers.length === 1 ? "" : "s"}:
                </p>
                <ul className="flex flex-wrap gap-1.5">
                  {paidPlayers.map((name, i) => (
                    <li
                      key={`${name}-${i}`}
                      className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-medium text-white/85"
                    >
                      {name}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p>Nobody has paid yet.</p>
            )}
            <p>
              Nobody is emailed. Their dashboards show the cohort as cancelled, and you contact each
              player about their make-up or credit. You can reopen it afterwards.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={statusBusy}
              onClick={async () => {
                if (await setStatus("cancelled")) setConfirmingCancel(false);
              }}
              className="min-h-[44px] flex-1 rounded-full bg-red-400/80 px-4 py-2 text-sm font-semibold text-[#061427] transition hover:brightness-110 disabled:opacity-40"
            >
              {statusBusy ? "Cancelling…" : "Cancel cohort"}
            </button>
            <button
              type="button"
              disabled={statusBusy}
              onClick={() => setConfirmingCancel(false)}
              className="min-h-[44px] rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white/70 hover:text-white"
            >
              Keep it
            </button>
          </div>
        </div>
      )}
      {statusError && (
        <p role="alert" className="text-sm text-red-300">
          {statusError}
        </p>
      )}

      {/* Who's free in this cohort's band — read it, then invite below */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">
          Who&apos;s free
        </h2>
        {poolError && (
          <p role="alert" className="text-sm text-red-300">
            Couldn&apos;t load the player pool. Reload the page to try again.
          </p>
        )}
        <AvailabilityMatrix
          players={pool}
          levelMin={cohort.levelMin ?? null}
          levelMax={cohort.levelMax ?? null}
          loading={poolLoading}
          selectedIds={ticked}
          onToggle={["draft", "inviting"].includes(dbStatus) ? toggleTick : undefined}
        />
      </section>

      {/* Invites before payment settings, so on a phone the invite box sits
          right under the names it invites (audit L23). */}
      <InviteSection
        cohortId={cohortId}
        invites={invites}
        canInvite={["draft", "inviting"].includes(dbStatus)}
        selected={selected}
        onClearSelection={() => setTicked(new Set())}
        onChanged={refresh}
      />

      <CardPayments payments={detail.payments ?? []} />

      <PaymentSettings
        cohortId={cohortId}
        paymentMode={cohort.paymentMode ?? "card"}
        onChanged={refresh}
      />


      {/* Sessions */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">
          Sessions
        </h2>
        {sessions.length === 0 ? (
          <p className="text-sm text-white/60">
            Sessions are generated when the cohort confirms (paid invites reach
            the minimum).
          </p>
        ) : (
          <ul className="space-y-2">
            {sessions.map((s) => (
              <SessionRowItem
                key={s.id}
                cohortId={cohortId}
                session={s}
                onChanged={refresh}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
