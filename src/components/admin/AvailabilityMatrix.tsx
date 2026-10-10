"use client";

import { useMemo, useState } from "react";
import {
  DAYS,
  BANDS,
  DAY_LABELS,
  BAND_LABELS,
  BAND_HOURS,
  type Day,
  type Band,
} from "@/lib/availability";
import {
  aggregateAvailabilityMatrix,
  type MatrixPlayer,
} from "@/lib/availabilityMatrix";
import { formatLevelBand, formatTierSpan } from "@/lib/tiers";

// Level × availability matrix for the cohort form and detail. Counts the
// leveled players inside the selected band per day-part cell; tap a cell to
// see the names. No clustering, no suggestions — the coach reads it.
//
// With `onToggle` (the cohort detail, audit M28) the names are checkboxes:
// each tick carries the player's participant id, so the invite goes to that
// player — a child's spot, with the child's own $20 credit — not to whoever
// holds the account's email.

export function AvailabilityMatrix({
  players,
  levelMin,
  levelMax,
  loading = false,
  selectedIds,
  onToggle,
}: {
  players: MatrixPlayer[];
  levelMin: number | null;
  levelMax: number | null;
  loading?: boolean;
  /** The players ticked for an invite (participant ids). */
  selectedIds?: ReadonlySet<string>;
  /** Tick or untick a player; omitted = names are read-only chips. */
  onToggle?: (id: string) => void;
}) {
  const [openCell, setOpenCell] = useState<{ day: Day; band: Band } | null>(null);

  const matrix = useMemo(
    () => aggregateAvailabilityMatrix(players, levelMin, levelMax),
    [players, levelMin, levelMax]
  );

  // "Deuce · 3.0–3.5" (audit M29): the tier words and the numeric band.
  const bandLabel = matrix.unbanded
    ? "all leveled players"
    : [formatTierSpan(levelMin, levelMax), formatLevelBand(levelMin, levelMax)]
        .filter(Boolean)
        .join(" · ") || `${levelMin ?? "—"}–${levelMax ?? "—"}`;

  const open = openCell ? matrix.cells[openCell.day][openCell.band] : null;
  const openWho = openCell ? matrix.who[openCell.day][openCell.band] : [];

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3 sm:p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-white/60">
          Who&apos;s free · {bandLabel}
        </p>
        <p className="text-xs text-white/60">
          {loading
            ? "Loading players…"
            : `${matrix.inBand} in band · ${matrix.withAvailability} with times on file`}
        </p>
      </div>
      {matrix.unbanded && !loading && (
        <p className="mt-1 text-xs text-white/60">
          Pick a level band above to narrow this to the players it fits.
        </p>
      )}

      {/* Band header */}
      <div className="mt-3 grid grid-cols-[2.5rem_repeat(3,1fr)] gap-1.5">
        <span aria-hidden="true" />
        {BANDS.map((b) => (
          <span key={b} className="text-center">
            <span className="block text-xs font-semibold uppercase tracking-wide text-white/60">
              {BAND_LABELS[b]}
            </span>
            <span className="block text-xs text-white/60">{BAND_HOURS[b].label}</span>
          </span>
        ))}
      </div>

      {/* One row per day; each cell is a count you can tap for names */}
      <div className="mt-1.5 space-y-1.5">
        {DAYS.map((d) => (
          <div key={d} className="grid grid-cols-[2.5rem_repeat(3,1fr)] items-center gap-1.5">
            <span className="text-sm font-semibold text-white/80">{DAY_LABELS[d]}</span>
            {BANDS.map((b) => {
              const cell = matrix.cells[d][b];
              const isOpen = openCell?.day === d && openCell?.band === b;
              const empty = cell.count === 0;
              return (
                <button
                  key={b}
                  type="button"
                  disabled={empty}
                  aria-pressed={isOpen}
                  aria-label={`${DAY_LABELS[d]} ${BAND_LABELS[b]}: ${cell.count} player${cell.count === 1 ? "" : "s"}`}
                  onClick={() => setOpenCell(isOpen ? null : { day: d, band: b })}
                  className={[
                    "flex min-h-[44px] items-center justify-center rounded-lg border text-sm font-semibold transition",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B4E655]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#061427]",
                    empty
                      ? "border-white/5 bg-transparent disabled:text-white/30"
                      : isOpen
                      ? "border-[#B4E655] bg-[#B4E655] text-[#061427]"
                      : cell.count >= 3
                      ? "border-[#B4E655]/40 bg-[#B4E655]/15 text-[#B4E655]"
                      : "border-white/15 bg-white/5 text-white/80 hover:border-[#B4E655]/50",
                  ].join(" ")}
                >
                  {cell.count}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {openCell && open && (
        <div className="mt-3 rounded-lg border border-white/10 bg-[#061427]/60 p-3">
          <p className="text-xs font-semibold text-white/70">
            {DAY_LABELS[openCell.day]} {BAND_LABELS[openCell.band]} · {open.count}
          </p>
          {onToggle ? (
            <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label="Tick players to invite">
              {openWho.map((person) => {
                const ticked = selectedIds?.has(person.id) ?? false;
                return (
                  <li key={person.id}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={ticked}
                      onClick={() => onToggle(person.id)}
                      className={[
                        "inline-flex min-h-[44px] items-center gap-2 rounded-full border px-3 text-sm font-medium transition",
                        "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B4E655]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#061427]",
                        ticked
                          ? "border-[#B4E655]/60 bg-[#B4E655]/10 text-white"
                          : "border-white/15 bg-white/5 text-white/80 hover:border-white/35",
                      ].join(" ")}
                    >
                      <span
                        aria-hidden="true"
                        className={`flex h-4 w-4 items-center justify-center rounded-sm border text-xs font-bold leading-none ${
                          ticked ? "border-[#B4E655] bg-[#B4E655] text-[#061427]" : "border-white/45"
                        }`}
                      >
                        {ticked ? "✓" : ""}
                      </span>
                      {person.name}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {open.names.map((n, i) => (
                <li
                  key={`${n}-${i}`}
                  className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-medium text-white/70"
                >
                  {n}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
