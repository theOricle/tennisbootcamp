"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Cohort } from "@/types/cohort";
import { COHORT_TOTAL, COHORT_WEEKS, listedPrograms as programs } from "@/content/programs";
import { scheduledEndDate, addDaysISO } from "@/lib/makeup";
import { TierLine, TierRangeBadges } from "@/components/tiers";
import { LEVEL_OPTIONS, formatLevelBand, formatTierSpan } from "@/lib/tiers";
import { AvailabilityMatrix } from "@/components/admin/AvailabilityMatrix";
import { PlayerPreview } from "@/components/admin/PlayerPreview";
import { PlateMark } from "@/components/plates/PlateMark";
import type { MatrixPlayer } from "@/lib/availabilityMatrix";
import { artFocusForCohort } from "@/lib/plates/variant";
import { COHORT_STATUS_LABELS, programTitleFor, statusLabel } from "@/lib/adminLabels";
import type { SessionSlot } from "@/types/cohort";

type AdminCohort = Cohort & { paidCount: number };

const inputClass =
  "w-full rounded-lg border border-white/35 bg-white/5 px-3 py-2.5 text-base text-white " +
  "placeholder:text-white/45 focus:border-[#B4E655]/60 focus:outline-none focus:ring-2 focus:ring-[#B4E655]/30";

// The level band stays numeric; tier names are display only (LEVEL_OPTIONS
// reads "3.0 · Deuce", audit M29).

const DAYS: SessionSlot["day"][] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-white/10 text-white/60",
  inviting: "bg-amber-400/15 text-amber-200",
  confirmed: "bg-[#B4E655]/15 text-[#B4E655]",
  running: "bg-sky-400/15 text-sky-200",
  completed: "bg-white/10 text-white/60",
  cancelled: "bg-red-400/15 text-red-200",
};

function fmtDate(iso: string): string {
  const [y, mo, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d)).toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

type SlotDraft = { day: SessionSlot["day"]; start: string; end: string };

function CreateCohortForm({
  seasonEndDate,
  pool,
  poolLoading,
  onCreated,
}: {
  seasonEndDate: string;
  pool: MatrixPlayer[];
  poolLoading: boolean;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [programId, setProgramId] = useState(programs[0]?.id ?? "");
  const [label, setLabel] = useState("");
  const [levelMin, setLevelMin] = useState("");
  const [levelMax, setLevelMax] = useState("");
  const [locationLabel, setLocationLabel] = useState("");
  const [startDate, setStartDate] = useState("");
  const [weeks, setWeeks] = useState(COHORT_WEEKS);
  const [slots, setSlots] = useState<SlotDraft[]>([
    { day: "Sat", start: "12:00", end: "13:00" },
  ]);
  // Weekend offer defaults (backlog #20, #27): the cohort total for
  // COHORT_WEEKS weeks, one 60-minute session a week, from src/content/programs.ts.
  const [priceDollars, setPriceDollars] = useState(String(COHORT_TOTAL));
  const [capacityMin, setCapacityMin] = useState(3);
  const [capacityMax, setCapacityMax] = useState(6);
  const [visibility, setVisibility] = useState<"private" | "public">("private");
  // Fall 2026 collects by e-transfer (CLAUDE.md, audit L23); card stays one tap away.
  const [paymentMode, setPaymentMode] = useState<"card" | "etransfer">("etransfer");
  const [holdHours, setHoldHours] = useState(48);
  const [makeupMaxWeeks, setMakeupMaxWeeks] = useState(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Season-end guard: warn (never block) when the schedule plus its make-up
  // headroom would run past the outdoor season.
  const seasonWarning = useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || slots.length === 0) return null;
    const end = scheduledEndDate(startDate, weeks, slots as SessionSlot[]);
    const withMakeups = addDaysISO(end, makeupMaxWeeks * 7);
    if (withMakeups > seasonEndDate) {
      return `Make-ups could run past the outdoor season (${fmtDate(withMakeups)} vs. season end ${fmtDate(seasonEndDate)}) — consider an earlier start.`;
    }
    return null;
  }, [startDate, weeks, slots, makeupMaxWeeks, seasonEndDate]);

  function setSlot(i: number, patch: Partial<SlotDraft>) {
    setSlots((s) => s.map((slot, idx) => (idx === i ? { ...slot, ...patch } : slot)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/cohorts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          programId,
          label,
          levelMin: levelMin || null,
          levelMax: levelMax || null,
          locationLabel: locationLabel || null,
          startDate,
          weeks,
          sessions: slots,
          priceCents: Math.round(Number(priceDollars || "0") * 100),
          capacityMin,
          capacityMax,
          visibility,
          paymentMode,
          inviteHoldHours: holdHours,
          makeupMaxWeeks,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Create failed.");
        setBusy(false);
        return;
      }
      setOpen(false);
      setLabel("");
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
        + New cohort
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4">
      <div>
        <label htmlFor="new-cohort-program" className="mb-1 block text-xs text-white/60">Program</label>
        <select
          id="new-cohort-program"
          value={programId}
          onChange={(e) => setProgramId(e.target.value)}
          className={inputClass}
        >
          {programs.map((p) => (
            <option key={p.id} value={p.id} className="bg-[#061427]">
              {p.title}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="new-cohort-label" className="mb-1 block text-xs text-white/60">Label</label>
        <input
          id="new-cohort-label"
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Saturday 12pm — Deuce"
          required
          className={inputClass}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="new-cohort-level-min" className="mb-1 block text-xs text-white/60">Level min</label>
          <select
            id="new-cohort-level-min"
            value={levelMin}
            onChange={(e) => setLevelMin(e.target.value)}
            className={inputClass}
          >
            <option value="" className="bg-[#061427]">—</option>
            {LEVEL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value} className="bg-[#061427]">{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="new-cohort-level-max" className="mb-1 block text-xs text-white/60">Level max</label>
          <select
            id="new-cohort-level-max"
            value={levelMax}
            onChange={(e) => setLevelMax(e.target.value)}
            className={inputClass}
          >
            <option value="" className="bg-[#061427]">—</option>
            {LEVEL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value} className="bg-[#061427]">{o.label}</option>
            ))}
          </select>
        </div>
      </div>
      {/* The band as the players will see it (audit M29): the span rail and
          its words, live as the selects change. */}
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
        <p className="text-xs font-semibold text-white" aria-live="polite">
          {levelMin || levelMax
            ? `${formatTierSpan(levelMin || null, levelMax || null)} · ${formatLevelBand(levelMin || null, levelMax || null)}`
            : "Not tier-gated"}
        </p>
        <TierLine
          variant="rail"
          size="sm"
          span={levelMin || levelMax ? { min: levelMin || null, max: levelMax || null } : null}
          className="mt-2"
        />
      </div>
      {/* The cohort's art as players will see it, live as the form changes. */}
      <PlayerPreview
        programId={programId}
        levelMin={levelMin || null}
        levelMax={levelMax || null}
        sessions={slots as SessionSlot[]}
      />
      {/* Who's free in this band — read-only, counts per day-part, names on tap */}
      <AvailabilityMatrix
        players={pool}
        levelMin={levelMin ? Number(levelMin) : null}
        levelMax={levelMax ? Number(levelMax) : null}
        loading={poolLoading}
      />
      <div>
        <label htmlFor="new-cohort-location" className="mb-1 block text-xs text-white/60">
          Location note (optional)
        </label>
        <input
          id="new-cohort-location"
          type="text"
          value={locationLabel}
          onChange={(e) => setLocationLabel(e.target.value)}
          placeholder="Court / meeting details"
          className={inputClass}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="new-cohort-start" className="mb-1 block text-xs text-white/60">Start date</label>
          <input
            id="new-cohort-start"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            required
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="new-cohort-weeks" className="mb-1 block text-xs text-white/60">Weeks</label>
          <input
            id="new-cohort-weeks"
            type="number"
            min={1}
            value={weeks}
            onChange={(e) => setWeeks(Number(e.target.value))}
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <p className="mb-1 block text-xs text-white/60">Weekly sessions</p>
        <div className="space-y-2">
          {slots.map((slot, i) => (
            <div key={i} className="flex items-center gap-2">
              <select
                value={slot.day}
                onChange={(e) => setSlot(i, { day: e.target.value as SessionSlot["day"] })}
                className={`${inputClass} w-24`}
                aria-label="Day"
              >
                {DAYS.map((d) => (
                  <option key={d} value={d} className="bg-[#061427]">{d}</option>
                ))}
              </select>
              <input
                type="time"
                value={slot.start}
                onChange={(e) => setSlot(i, { start: e.target.value })}
                className={inputClass}
                aria-label="Start time"
              />
              <input
                type="time"
                value={slot.end}
                onChange={(e) => setSlot(i, { end: e.target.value })}
                className={inputClass}
                aria-label="End time"
              />
              {slots.length > 1 && (
                <button
                  type="button"
                  onClick={() => setSlots((s) => s.filter((_, idx) => idx !== i))}
                  className="min-h-[44px] min-w-[44px] rounded-full text-white/60 hover:text-red-200"
                  aria-label="Remove session slot"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() =>
            setSlots((s) => [...s, { day: "Sat", start: "12:00", end: "13:00" }])
          }
          className="mt-2 min-h-[44px] rounded-full border border-white/20 px-4 text-sm font-semibold text-white/70 hover:text-white"
        >
          + Add a session slot
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label htmlFor="new-cohort-price" className="mb-1 block text-xs text-white/60">Price (CAD)</label>
          <input
            id="new-cohort-price"
            type="number"
            min={0}
            step="1"
            value={priceDollars}
            onChange={(e) => setPriceDollars(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="new-cohort-min" className="mb-1 block text-xs text-white/60">Min to run</label>
          <input
            id="new-cohort-min"
            type="number"
            min={1}
            value={capacityMin}
            onChange={(e) => setCapacityMin(Number(e.target.value))}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="new-cohort-capacity" className="mb-1 block text-xs text-white/60">Capacity</label>
          <input
            id="new-cohort-capacity"
            type="number"
            min={1}
            value={capacityMax}
            onChange={(e) => setCapacityMax(Number(e.target.value))}
            className={inputClass}
          />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label htmlFor="new-cohort-visibility" className="mb-1 block text-xs text-white/60">Visibility</label>
          <select
            id="new-cohort-visibility"
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as "private" | "public")}
            className={inputClass}
          >
            <option value="private" className="bg-[#061427]">Private</option>
            <option value="public" className="bg-[#061427]">Public</option>
          </select>
        </div>
        <div>
          <label htmlFor="new-cohort-hold" className="mb-1 block text-xs text-white/60">Hold (hours)</label>
          <input
            id="new-cohort-hold"
            type="number"
            min={1}
            value={holdHours}
            onChange={(e) => setHoldHours(Number(e.target.value))}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="new-cohort-makeup" className="mb-1 block text-xs text-white/60">Make-up cap (wks)</label>
          <input
            id="new-cohort-makeup"
            type="number"
            min={0}
            value={makeupMaxWeeks}
            onChange={(e) => setMakeupMaxWeeks(Number(e.target.value))}
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <label htmlFor="new-cohort-payment" className="mb-1 block text-xs text-white/60">Payment</label>
        <select
          id="new-cohort-payment"
          value={paymentMode}
          onChange={(e) => setPaymentMode(e.target.value as "card" | "etransfer")}
          className={inputClass}
        >
          <option value="etransfer" className="bg-[#061427]">E-transfer (you mark invites paid)</option>
          <option value="card" className="bg-[#061427]">Card (Stripe Checkout)</option>
        </select>
      </div>

      {seasonWarning && (
        <p className="rounded-lg border border-yellow-400/30 bg-yellow-400/10 px-3 py-2 text-sm text-yellow-200">
          {seasonWarning}
        </p>
      )}
      {error && <p className="text-sm text-red-300">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="min-h-[44px] flex-1 rounded-full bg-[#B4E655] px-4 py-2 text-sm font-semibold text-[#061427] transition hover:brightness-110 disabled:opacity-40"
        >
          {busy ? "Saving…" : "Create cohort (draft)"}
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

export function AdminCohortsClient({ seasonEndDate }: { seasonEndDate: string }) {
  const [cohorts, setCohorts] = useState<AdminCohort[]>([]);
  const [dbReady, setDbReady] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pool, setPool] = useState<MatrixPlayer[]>([]);
  const [poolLoading, setPoolLoading] = useState(true);

  // Leveled pool for the create form's matrix — one fetch, shared by every band
  // the coach tries.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/players?view=leveled")
      .then((r) => r.json())
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
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setPoolLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // A load failure says so, with Retry (audit L23), instead of reading as
  // "no cohorts" or as a missing migration.
  const refresh = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch("/api/admin/cohorts");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoadError(typeof data.error === "string" ? data.error : "Couldn't load the cohorts.");
        return;
      }
      setCohorts(data.cohorts ?? []);
      setDbReady(data.dbReady ?? false);
    } catch {
      setLoadError("Couldn't reach the server.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div className="space-y-4">
      {!loading && !dbReady && (
        <p className="rounded-lg border border-yellow-400/30 bg-yellow-400/10 px-3 py-2 text-sm text-yellow-200">
          The cohorts table isn&apos;t reachable — run
          supabase/migrations/0004_cohorts_admin.sql in the Supabase SQL editor
          first.
        </p>
      )}

      <CreateCohortForm
        seasonEndDate={seasonEndDate}
        pool={pool}
        poolLoading={poolLoading}
        onCreated={refresh}
      />

      {loading && <p className="text-sm text-white/60">Loading…</p>}
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
      {!loading && !loadError && dbReady && cohorts.length === 0 && (
        <p className="text-sm text-white/60">No cohorts yet.</p>
      )}

      {cohorts.map((c) => {
        const program = programs.find((p) => p.id === c.programId);
        const banded = c.levelMin != null || c.levelMax != null;
        return (
        <Link
          key={c.id}
          href={`/admin/cohorts/${c.id}`}
          className="block overflow-hidden rounded-xl border border-white/10 bg-white/5 transition hover:border-[#B4E655]/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B4E655]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#061427]"
        >
          <div className="flex items-start justify-between gap-3 p-4">
            {/* The program's 48px mark (design specs §4.8), its title, not the slug. */}
            <div className="flex min-w-0 items-start gap-3">
              <PlateMark
                plate={program?.plate ?? "court"}
                size={48}
                focusSlot={program ? artFocusForCohort(program, c) : null}
              />
              <div className="min-w-0">
                <p className="truncate font-semibold text-white">{c.label}</p>
                <p className="mt-0.5 text-xs text-white/60">
                  {programTitleFor(c.programId)} · starts {fmtDate(c.startDate)} · {c.weeks} wk
                  {c.visibility === "private" ? " · private" : ""}
                  {c.paymentMode === "etransfer" ? " · e-transfer" : ""}
                </p>
                <TierRangeBadges levelMin={c.levelMin} levelMax={c.levelMax} className="mt-2" />
              </div>
            </div>
            <div className="shrink-0 text-right">
              <span
                className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
                  STATUS_STYLE[c.dbStatus ?? "draft"] ?? "bg-white/10 text-white/60"
                }`}
              >
                {statusLabel(COHORT_STATUS_LABELS, c.dbStatus ?? "draft")}
              </span>
              <p className="mt-1 text-xs text-white/60">
                {c.paidCount}/{c.capacityMin} paid to run
              </p>
              {c.creditFollowup && (
                <p className="mt-1 text-xs font-semibold text-yellow-200">
                  Credit follow-up
                </p>
              )}
            </div>
          </div>
          {/* The band along the row's bottom edge: flat xs pips (design specs §4.8). */}
          {banded && (
            <TierLine
              variant="rail"
              size="xs"
              span={{ min: c.levelMin, max: c.levelMax }}
              labels="none"
              className="px-4 pb-3"
            />
          )}
        </Link>
        );
      })}
    </div>
  );
}
