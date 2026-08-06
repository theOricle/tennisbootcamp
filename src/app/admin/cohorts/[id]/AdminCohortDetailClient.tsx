"use client";

import { useCallback, useEffect, useState } from "react";
import type { Cohort } from "@/types/cohort";
import { trackCohortInviteSent } from "@/lib/analytics";
import { TierRangeBadges } from "@/components/tiers";
import { dayNameForDate } from "@/lib/makeup";

type InviteRow = {
  id: string;
  email: string;
  token: string;
  status: "invited" | "paid" | "declined" | "expired";
  invited_at: string;
  expires_at: string;
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

type Detail = {
  cohort: Cohort;
  invites: InviteRow[];
  sessions: SessionRow[];
  memberCount: number;
  paidCount: number;
};

const inputClass =
  "w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-base text-white " +
  "placeholder-white/35 focus:border-[#B4E655]/60 focus:outline-none focus:ring-2 focus:ring-[#B4E655]/30";

const INVITE_STYLE: Record<string, string> = {
  invited: "bg-amber-400/15 text-amber-200",
  paid: "bg-[#B4E655]/15 text-[#B4E655]",
  expired: "bg-white/10 text-white/50",
  declined: "bg-red-400/15 text-red-200",
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

// ─── Invite section ───────────────────────────────────────────────────────────

function InviteSection({
  cohortId,
  invites,
  canInvite,
  onChanged,
}: {
  cohortId: string;
  invites: InviteRow[];
  canInvite: boolean;
  onChanged: () => void;
}) {
  const [emails, setEmails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function send() {
    const list = emails
      .split(/[\s,;]+/)
      .map((e) => e.trim())
      .filter(Boolean);
    if (list.length === 0) {
      setError("Add at least one email.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/cohorts/${cohortId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "invite", emails: list }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Invites failed.");
        setBusy(false);
        return;
      }
      trackCohortInviteSent(cohortId, data.sent ?? list.length);
      setEmails("");
      if (Array.isArray(data.errors) && data.errors.length > 0) {
        setNotice(`Sent ${data.sent}. Skipped: ${data.errors.join(" ")}`);
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
      <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">
        Invites
      </h2>
      {canInvite ? (
        <div className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-4">
          <label className="block text-xs text-white/60">
            Emails (comma, space, or line separated)
          </label>
          <textarea
            value={emails}
            onChange={(e) => setEmails(e.target.value)}
            rows={2}
            placeholder="player1@example.com, player2@example.com"
            className={inputClass}
          />
          {error && <p className="text-sm text-red-300">{error}</p>}
          {notice && <p className="text-sm text-yellow-200">{notice}</p>}
          <button
            type="button"
            disabled={busy}
            onClick={() => void send()}
            className="min-h-[44px] w-full rounded-full bg-[#B4E655] px-4 py-2 text-sm font-semibold text-[#061427] transition hover:brightness-110 disabled:opacity-40"
          >
            {busy ? "Sending…" : "Send invites (48h hold)"}
          </button>
        </div>
      ) : (
        <p className="text-sm text-white/50">
          Invites go out while the cohort is draft or inviting. Re-invite from
          those states; an expired invite gets a fresh link the same way.
        </p>
      )}

      {invites.length === 0 ? (
        <p className="text-sm text-white/50">No invites yet.</p>
      ) : (
        <ul className="space-y-2">
          {invites.map((i) => (
            <li
              key={i.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3"
            >
              <p className="min-w-0 truncate text-sm text-white">{i.email}</p>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  INVITE_STYLE[i.status] ?? "bg-white/10 text-white/60"
                }`}
              >
                {i.status}
              </span>
            </li>
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
          <p className={`text-sm font-semibold ${cancelled ? "text-white/50 line-through" : "text-white"}`}>
            {dayNameForDate(session.session_date)} {fmtDate(session.session_date)} ·{" "}
            {fmtTime(session.start_time)}–{fmtTime(session.end_time)}
          </p>
          <div className="mt-0.5 flex flex-wrap gap-2 text-[11px]">
            {session.makeup_for && (
              <span className="rounded-full bg-sky-400/15 px-2 py-0.5 font-semibold text-sky-200">
                Make-up
              </span>
            )}
            {cancelled && (
              <span className="rounded-full bg-red-400/15 px-2 py-0.5 font-semibold text-red-200">
                Cancelled{session.cancellation_reason ? ` · ${session.cancellation_reason}` : ""}
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

// ─── Root ─────────────────────────────────────────────────────────────────────

export function AdminCohortDetailClient({ cohortId }: { cohortId: string }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/cohorts/${cohortId}`);
      const data = await res.json();
      if (!res.ok) {
        setLoadError(data.error ?? "Failed to load cohort.");
        return;
      }
      setLoadError(null);
      setDetail(data);
    } catch {
      setLoadError("Network error.");
    }
  }, [cohortId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function setStatus(status: string) {
    setStatusBusy(true);
    try {
      await fetch(`/api/admin/cohorts/${cohortId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_status", status }),
      });
      await refresh();
    } finally {
      setStatusBusy(false);
    }
  }

  if (loadError) return <p className="text-sm text-red-300">{loadError}</p>;
  if (!detail) return <p className="text-sm text-white/50">Loading…</p>;

  const { cohort, invites, sessions, paidCount } = detail;
  const dbStatus = cohort.dbStatus ?? "draft";

  return (
    <div className="space-y-8">
      {/* Header */}
      <header>
        <h1 className="text-2xl font-semibold text-white">{cohort.label}</h1>
        <p className="mt-1 text-sm text-white/55">
          {cohort.programId} · starts {fmtDate(cohort.startDate)} · {cohort.weeks} wk ·{" "}
          ${(cohort.priceCents / 100).toFixed(0)} · {cohort.capacityMin}–{cohort.capacityMax} players
          {cohort.visibility === "private" ? " · private" : " · public"}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <TierRangeBadges levelMin={cohort.levelMin} levelMax={cohort.levelMax} />
          <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white/70">
            {dbStatus}
          </span>
          <span className="text-[11px] text-white/40">
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

      {/* Status controls */}
      <div className="flex flex-wrap gap-2">
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
        {dbStatus !== "cancelled" && dbStatus !== "completed" && (
          <button
            type="button"
            disabled={statusBusy}
            onClick={() => void setStatus("cancelled")}
            className="min-h-[44px] rounded-full border border-white/20 px-4 text-sm font-semibold text-white/60 hover:border-red-400/50 hover:text-red-200 disabled:opacity-40"
          >
            Cancel cohort
          </button>
        )}
      </div>

      <InviteSection
        cohortId={cohortId}
        invites={invites}
        canInvite={["draft", "inviting"].includes(dbStatus)}
        onChanged={refresh}
      />

      {/* Sessions */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">
          Sessions
        </h2>
        {sessions.length === 0 ? (
          <p className="text-sm text-white/50">
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
