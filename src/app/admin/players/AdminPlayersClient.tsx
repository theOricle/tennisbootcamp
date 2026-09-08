"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AvailabilityGrid,
  AvailabilityHoursLegend,
} from "@/components/ui/AvailabilityGrid";
import { TierChip } from "@/components/tiers";
import { TIERS } from "@/lib/tiers";
import {
  AVAILABILITY_SOURCE_LABELS,
  type Availability,
  type AvailabilitySource,
} from "@/lib/availability";

type Player = {
  /** Participant id — the person, not the account. */
  id: string;
  name: string | null;
  relationship: string;
  relationshipLabel: string;
  isMinor: boolean;
  /** The account holder this player belongs to. */
  account: { id: string; name: string | null; email: string };
  email: string;
  phone: string | null;
  level: number | null;
  level_assessed_at: string | null;
  level_notes: string | null;
  availability: Availability;
  availability_chips: string[];
  availability_updated_at: string | null;
  availability_source: AvailabilitySource | null;
  availability_note: string | null;
};

type View = "all" | "leveled" | "unleveled";
type Sort = "level" | "availability_updated_at";

const VIEW_LABELS: Record<View, string> = {
  all: "All",
  leveled: "Leveled",
  unleveled: "Unleveled",
};

// NTRP halves 1.0 → 7.0 (same list as the assessment complete form).
const LEVELS: string[] = Array.from({ length: 13 }, (_, i) =>
  (1 + i * 0.5).toFixed(1)
);

const inputClass =
  "w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-base text-white " +
  "placeholder-white/35 focus:border-[#B4E655]/60 focus:outline-none focus:ring-2 focus:ring-[#B4E655]/30";

const chipClass = (active: boolean) =>
  `min-h-[44px] shrink-0 snap-start rounded-full px-4 text-sm font-semibold transition ${
    active
      ? "bg-[#B4E655] text-[#061427]"
      : "border border-white/20 text-white/70 hover:text-white"
  }`;

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
  });
}

function availabilityStatus(p: Player): string {
  if (!p.availability_updated_at) {
    return p.availability_chips.length > 0 ? "Availability on file" : "No availability yet";
  }
  const who = p.availability_source
    ? AVAILABILITY_SOURCE_LABELS[p.availability_source]
    : "on file";
  return `Availability ${who} · ${fmtDate(p.availability_updated_at)}`;
}

function PlayerCard({
  player,
  onChanged,
}: {
  player: Player;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  // Unleveled players start with no selection: the coach picks the level.
  const [level, setLevel] = useState(
    player.level != null ? player.level.toFixed(1) : ""
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
      // Only send what changed: an untouched grid must not re-stamp the
      // availability provenance, and a blank level leaves it unleveled.
      const payload: Record<string, unknown> = { id: player.id, levelNotes: notes.trim() };
      if (level) payload.level = Number(level);
      if (JSON.stringify(availability) !== JSON.stringify(player.availability)) {
        payload.availability = availability;
      }
      const res = await fetch("/api/admin/players", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
            {player.isMinor && (
              <span className="ml-2 rounded-full border border-white/15 px-1.5 py-0.5 text-[10px] font-medium text-white/50">
                Under 18
              </span>
            )}
          </p>
          {/* Account: two players with the same name under different holders
              are told apart here. */}
          <p className="truncate text-xs text-white/50">
            <span className="text-white/35">Account: </span>
            {player.account.name || player.account.email || "—"}
            {player.account.email ? ` · ${player.account.email}` : ""}
          </p>
          {player.relationship !== "self" && player.relationshipLabel && (
            <p className="text-[11px] text-white/40">{player.relationshipLabel}</p>
          )}
          {player.phone && <p className="text-xs text-white/50">{player.phone}</p>}
          <p className="mt-1 text-[11px] text-white/40">{availabilityStatus(player)}</p>
        </div>
        <div className="shrink-0 text-right">
          <div className="flex items-center justify-end gap-2">
            <span className="text-sm font-semibold text-[#B4E655]">
              {player.level != null ? player.level.toFixed(1) : "—"}
            </span>
            {player.level != null ? (
              <TierChip level={player.level} />
            ) : (
              <span className="rounded-full border border-yellow-400/30 bg-yellow-400/10 px-2 py-0.5 text-[10px] font-medium text-yellow-200">
                Unleveled
              </span>
            )}
          </div>
          {player.level_assessed_at && (
            <p className="mt-1 text-[11px] text-white/40">
              Assessed {fmtDate(player.level_assessed_at)}
            </p>
          )}
        </div>
      </button>

      {!open && (
        <>
          {player.availability_chips.length > 0 && (
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
          {player.availability_note && (
            <p className="mt-2 text-xs italic text-white/55">
              &ldquo;{player.availability_note}&rdquo;
            </p>
          )}
        </>
      )}

      {open && (
        <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
          <div className="grid grid-cols-[auto_1fr] items-center gap-3">
            <label htmlFor={`level-${player.id}`} className="text-sm text-white/70">
              Level
            </label>
            <select
              id={`level-${player.id}`}
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              className={inputClass}
            >
              <option value="" className="bg-[#061427]">
                {player.level != null ? "—" : "Pick a level"}
              </option>
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
            <AvailabilityHoursLegend className="mb-2" />
            <AvailabilityGrid value={availability} onChange={setAvailability} />
            {player.availability_note && (
              <p className="mt-2 text-xs italic text-white/55">
                Player note: &ldquo;{player.availability_note}&rdquo;
              </p>
            )}
          </div>
          {error && <p className="text-sm text-red-300">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void save()}
              className="min-h-[44px] flex-1 rounded-full bg-[#B4E655] px-4 py-2 text-sm font-semibold text-[#061427] transition hover:brightness-110 disabled:opacity-40"
            >
              {busy ? "Saving…" : player.level == null && level ? "Set level" : "Save changes"}
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
  const [counts, setCounts] = useState<Record<View, number>>({ all: 0, leveled: 0, unleveled: 0 });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [view, setView] = useState<View>("all");
  const [sort, setSort] = useState<Sort>("level");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [band, setBand] = useState<string>("all"); // "all" | tier id "1".."7"

  const refresh = useCallback(async () => {
    try {
      const qs = new URLSearchParams({ view, sort, dir });
      const res = await fetch(`/api/admin/players?${qs.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        setLoadError(data.error ?? "Failed to load players.");
        return;
      }
      setLoadError(null);
      setPlayers(data.players ?? []);
      if (data.counts) setCounts(data.counts);
    } catch {
      setLoadError("Network error.");
    } finally {
      setLoading(false);
    }
  }, [view, sort, dir]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function toggleSort(next: Sort) {
    if (sort === next) {
      setDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSort(next);
      setDir("desc");
    }
  }

  // Tier band chips only make sense over leveled players.
  const filtered =
    band === "all"
      ? players
      : players.filter(
          (p) =>
            p.level != null &&
            Math.min(7, Math.max(1, Math.floor(p.level))) === Number(band)
        );

  const arrow = dir === "desc" ? "↓" : "↑";

  return (
    <div className="space-y-4">
      {/* View toggle — All / Leveled / Unleveled */}
      <div className="flex gap-2" role="group" aria-label="View">
        {(["all", "leveled", "unleveled"] as View[]).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            aria-pressed={view === v}
            className={chipClass(view === v)}
          >
            {VIEW_LABELS[v]}
            <span className={`ml-1.5 text-xs ${view === v ? "text-[#061427]/70" : "text-white/40"}`}>
              {counts[v]}
            </span>
          </button>
        ))}
      </div>

      {/* Sort */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-white/50">
        <span>Sort by</span>
        <button
          type="button"
          onClick={() => toggleSort("level")}
          className={`min-h-[44px] rounded-full px-3 font-semibold transition ${
            sort === "level" ? "text-[#B4E655]" : "text-white/60 hover:text-white"
          }`}
        >
          Level {sort === "level" ? arrow : ""}
        </button>
        <button
          type="button"
          onClick={() => toggleSort("availability_updated_at")}
          className={`min-h-[44px] rounded-full px-3 font-semibold transition ${
            sort === "availability_updated_at" ? "text-[#B4E655]" : "text-white/60 hover:text-white"
          }`}
        >
          Availability updated {sort === "availability_updated_at" ? arrow : ""}
        </button>
      </div>

      {/* Level-band filter — one chip per tier (leveled players only) */}
      {view !== "unleveled" && (
        <div className="flex snap-x gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button type="button" onClick={() => setBand("all")} className={chipClass(band === "all")}>
            Any tier
          </button>
          {TIERS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setBand(String(t.id))}
              className={chipClass(band === String(t.id))}
            >
              {t.name} · {t.band}
            </button>
          ))}
        </div>
      )}

      {loading && <p className="text-sm text-white/50">Loading…</p>}
      {loadError && <p className="text-sm text-red-300">{loadError}</p>}
      {!loading && !loadError && filtered.length === 0 && (
        <p className="text-sm text-white/50">
          {view === "unleveled"
            ? "Nobody is waiting for a level. New quiz sign-ups and assessment requests land here."
            : view === "leveled"
            ? `No leveled players${band === "all" ? " yet" : " in this band"}. Completed assessments and levels you set here land in this list.`
            : "No players yet. Quiz sign-ups, assessment requests and completed assessments all land here."}
        </p>
      )}
      {filtered.map((p) => (
        <PlayerCard key={p.id} player={p} onChanged={refresh} />
      ))}
    </div>
  );
}
