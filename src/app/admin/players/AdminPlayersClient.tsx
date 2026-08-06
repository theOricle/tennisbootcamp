"use client";

import { useCallback, useEffect, useState } from "react";
import { AvailabilityGrid } from "@/components/ui/AvailabilityGrid";
import { TierChip } from "@/components/tiers";
import { TIERS } from "@/lib/tiers";
import type { Availability } from "@/lib/availability";

type Player = {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  level: number | null;
  level_assessed_at: string | null;
  level_notes: string | null;
  availability: Availability;
  availability_chips: string[];
};

// NTRP halves 1.0 → 7.0 (same list as the assessment complete form).
const LEVELS: string[] = Array.from({ length: 13 }, (_, i) =>
  (1 + i * 0.5).toFixed(1)
);

const inputClass =
  "w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-base text-white " +
  "placeholder-white/35 focus:border-[#B4E655]/60 focus:outline-none focus:ring-2 focus:ring-[#B4E655]/30";

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
  });
}

function PlayerCard({
  player,
  onChanged,
}: {
  player: Player;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [level, setLevel] = useState(
    player.level != null ? player.level.toFixed(1) : "3.0"
  );
  const [notes, setNotes] = useState(player.level_notes ?? "");
  const [availability, setAvailability] = useState<Availability>(
    player.availability
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/players", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: player.id,
          level: Number(level),
          levelNotes: notes.trim(),
          availability,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Save failed.");
        setBusy(false);
        return;
      }
      setOpen(false);
      onChanged();
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-[44px] w-full items-start justify-between gap-3 text-left"
        aria-expanded={open}
      >
        <div className="min-w-0">
          <p className="truncate font-semibold text-white">
            {player.name || player.email || "Player"}
          </p>
          <p className="truncate text-xs text-white/50">{player.email}</p>
          {player.phone && <p className="text-xs text-white/50">{player.phone}</p>}
        </div>
        <div className="shrink-0 text-right">
          <div className="flex items-center justify-end gap-2">
            <span className="text-sm font-semibold text-[#B4E655]">
              {player.level != null ? player.level.toFixed(1) : "—"}
            </span>
            <TierChip level={player.level} />
          </div>
          {player.level_assessed_at && (
            <p className="mt-1 text-[11px] text-white/40">
              Assessed {fmtDate(player.level_assessed_at)}
            </p>
          )}
        </div>
      </button>

      {player.availability_chips.length > 0 && !open && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {player.availability_chips.map((chip) => (
            <span
              key={chip}
              className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-white/70"
            >
              {chip}
            </span>
          ))}
        </div>
      )}

      {open && (
        <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
          <div className="grid grid-cols-[auto_1fr] items-center gap-3">
            <label className="text-sm text-white/70">Level</label>
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              className={inputClass}
            >
              {LEVELS.map((l) => (
                <option key={l} value={l} className="bg-[#061427]">
                  {l}
                </option>
              ))}
            </select>
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Coach note on their game…"
            className={inputClass}
          />
          <div>
            <p className="mb-2 text-xs text-white/60">Weekly availability</p>
            <AvailabilityGrid value={availability} onChange={setAvailability} />
          </div>
          {error && <p className="text-sm text-red-300">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void save()}
              className="min-h-[44px] flex-1 rounded-full bg-[#B4E655] px-4 py-2 text-sm font-semibold text-[#061427] transition hover:brightness-110 disabled:opacity-40"
            >
              {busy ? "Saving…" : "Save changes"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setOpen(false)}
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

export function AdminPlayersClient() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [band, setBand] = useState<string>("all"); // "all" | tier id "1".."7"

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/players");
      const data = await res.json();
      if (!res.ok) {
        setLoadError(data.error ?? "Failed to load players.");
        return;
      }
      setLoadError(null);
      setPlayers(data.players ?? []);
    } catch {
      setLoadError("Network error.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const filtered =
    band === "all"
      ? players
      : players.filter(
          (p) =>
            p.level != null &&
            Math.min(7, Math.max(1, Math.floor(p.level))) === Number(band)
        );

  return (
    <div className="space-y-4">
      {/* Level-band filter — one chip per tier */}
      <div className="flex snap-x gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          type="button"
          onClick={() => setBand("all")}
          className={`min-h-[44px] shrink-0 snap-start rounded-full px-4 text-sm font-semibold transition ${
            band === "all"
              ? "bg-[#B4E655] text-[#061427]"
              : "border border-white/20 text-white/70 hover:text-white"
          }`}
        >
          All
        </button>
        {TIERS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setBand(String(t.id))}
            className={`min-h-[44px] shrink-0 snap-start rounded-full px-4 text-sm font-semibold transition ${
              band === String(t.id)
                ? "bg-[#B4E655] text-[#061427]"
                : "border border-white/20 text-white/70 hover:text-white"
            }`}
          >
            {t.name} · {t.band}
          </button>
        ))}
      </div>

      {loading && <p className="text-sm text-white/50">Loading…</p>}
      {loadError && <p className="text-sm text-red-300">{loadError}</p>}
      {!loading && !loadError && filtered.length === 0 && (
        <p className="text-sm text-white/50">
          No assessed players{band === "all" ? " yet" : " in this band"}.
          Completed assessments land here automatically.
        </p>
      )}
      {filtered.map((p) => (
        <PlayerCard key={p.id} player={p} onChanged={refresh} />
      ))}
    </div>
  );
}
