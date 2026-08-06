"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Cohort } from "@/types/cohort";
import { programs } from "@/content/programs";
import { scheduledEndDate, addDaysISO } from "@/lib/makeup";
import { TierRangeBadges } from "@/components/tiers";
import type { SessionSlot } from "@/types/cohort";

type AdminCohort = Cohort & { paidCount: number };

const inputClass =
  "w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-base text-white " +
  "placeholder-white/35 focus:border-[#B4E655]/60 focus:outline-none focus:ring-2 focus:ring-[#B4E655]/30";

// Numeric NTRP halves for the level band — the form stays numeric; tiers are
// derived for display only.
const LEVELS: string[] = Array.from({ length: 13 }, (_, i) =>
  (1 + i * 0.5).toFixed(1)
);

const DAYS: SessionSlot["day"][] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-white/10 text-white/60",
  inviting: "bg-amber-400/15 text-amber-200",
  confirmed: "bg-[#B4E655]/15 text-[#B4E655]",
  running: "bg-sky-400/15 text-sky-200",
  completed: "bg-white/10 text-white/50",
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
  onCreated,
}: {
  seasonEndDate: string;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [programId, setProgramId] = useState(programs[0]?.id ?? "");
  const [label, setLabel] = useState("");
  const [levelMin, setLevelMin] = useState("");
  const [levelMax, setLevelMax] = useState("");
  const [locationLabel, setLocationLabel] = useState("");
  const [startDate, setStartDate] = useState("");
  const [weeks, setWeeks] = useState(6);
  const [slots, setSlots] = useState<SlotDraft[]>([
    { day: "Tue", start: "18:00", end: "19:00" },
  ]);
  const [priceDollars, setPriceDollars] = useState("649");
  const [capacityMin, setCapacityMin] = useState(3);
  const [capacityMax, setCapacityMax] = useState(6);
  const [visibility, setVisibility] = useState<"private" | "public">("private");
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
        <label className="mb-1 block text-xs text-white/60">Program</label>
        <select
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
        <label className="mb-1 block text-xs text-white/60">Label</label>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Tue/Thu Evening — Level 3.0"
          required
          className={inputClass}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs text-white/60">Level min</label>
          <select
            value={levelMin}
            onChange={(e) => setLevelMin(e.target.value)}
            className={inputClass}
          >
            <option value="" className="bg-[#061427]">—</option>
            {LEVELS.map((l) => (
              <option key={l} value={l} className="bg-[#061427]">{l}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-white/60">Level max</label>
          <select
            value={levelMax}
            onChange={(e) => setLevelMax(e.target.value)}
            className={inputClass}
          >
            <option value="" className="bg-[#061427]">—</option>
            {LEVELS.map((l) => (
              <option key={l} value={l} className="bg-[#061427]">{l}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs text-white/60">
          Location note (optional)
        </label>
        <input
          type="text"
          value={locationLabel}
          onChange={(e) => setLocationLabel(e.target.value)}
          placeholder="Court / meeting details"
          className={inputClass}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs text-white/60">Start date</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            required
            className={inputClass}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-white/60">Weeks</label>
          <input
            type="number"
            min={1}
            value={weeks}
            onChange={(e) => setWeeks(Number(e.target.value))}
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs text-white/60">Weekly sessions</label>
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
                  className="min-h-[44px] min-w-[44px] rounded-full text-white/50 hover:text-red-200"
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
            setSlots((s) => [...s, { day: "Thu", start: "18:00", end: "19:00" }])
          }
          className="mt-2 min-h-[44px] rounded-full border border-white/20 px-4 text-sm font-semibold text-white/70 hover:text-white"
        >
          + Add a session slot
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="mb-1 block text-xs text-white/60">Price (CAD)</label>
          <input
            type="number"
            min={0}
            step="1"
            value={priceDollars}
            onChange={(e) => setPriceDollars(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-white/60">Min to run</label>
          <input
            type="number"
            min={1}
            value={capacityMin}
            onChange={(e) => setCapacityMin(Number(e.target.value))}
            className={inputClass}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-white/60">Capacity</label>
          <input
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
          <label className="mb-1 block text-xs text-white/60">Visibility</label>
          <select
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as "private" | "public")}
            className={inputClass}
          >
            <option value="private" className="bg-[#061427]">Private</option>
            <option value="public" className="bg-[#061427]">Public</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-white/60">Hold (hours)</label>
          <input
            type="number"
            min={1}
            value={holdHours}
            onChange={(e) => setHoldHours(Number(e.target.value))}
            className={inputClass}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-white/60">Make-up cap (wks)</label>
          <input
            type="number"
            min={0}
            value={makeupMaxWeeks}
            onChange={(e) => setMakeupMaxWeeks(Number(e.target.value))}
            className={inputClass}
          />
        </div>
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

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/cohorts");
      const data = await res.json();
      setCohorts(data.cohorts ?? []);
      setDbReady(data.dbReady ?? false);
    } catch {
      setDbReady(false);
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

      <CreateCohortForm seasonEndDate={seasonEndDate} onCreated={refresh} />

      {loading && <p className="text-sm text-white/50">Loading…</p>}
      {!loading && dbReady && cohorts.length === 0 && (
        <p className="text-sm text-white/50">No cohorts yet.</p>
      )}

      {cohorts.map((c) => (
        <Link
          key={c.id}
          href={`/admin/cohorts/${c.id}`}
          className="block rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-[#B4E655]/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B4E655]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#061427]"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-semibold text-white">{c.label}</p>
              <p className="mt-0.5 text-xs text-white/50">
                {c.programId} · starts {fmtDate(c.startDate)} · {c.weeks} wk
                {c.visibility === "private" ? " · private" : ""}
              </p>
              <TierRangeBadges levelMin={c.levelMin} levelMax={c.levelMax} className="mt-2" />
            </div>
            <div className="shrink-0 text-right">
              <span
                className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  STATUS_STYLE[c.dbStatus ?? "draft"] ?? "bg-white/10 text-white/60"
                }`}
              >
                {c.dbStatus ?? "?"}
              </span>
              <p className="mt-1 text-[11px] text-white/40">
                {c.paidCount}/{c.capacityMin} paid to run
              </p>
              {c.creditFollowup && (
                <p className="mt-1 text-[11px] font-semibold text-yellow-200">
                  credit follow-up
                </p>
              )}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
