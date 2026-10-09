"use client";

import {
  DAYS,
  BANDS,
  BAND_HOURS,
  DAY_LABELS,
  BAND_LABELS,
  EVENING_FALL_NOTE,
  serializeAvailability,
  type Availability,
  type Day,
  type Band,
} from "@/lib/availability";
import { FOCUS_RING } from "@/components/ui/focus";

/**
 * The hour definitions behind the three bands, read from the one constant in
 * src/lib/availability.ts. Shown next to every grid — intake, request-a-time,
 * the dashboard editor and the admin correction — so a "Morning" means the
 * same hours everywhere.
 */
export function AvailabilityHoursLegend({ className = "" }: { className?: string }) {
  return (
    <div className={["text-xs leading-relaxed text-white/60", className].join(" ").trim()}>
      <p className="flex flex-wrap gap-x-3 gap-y-0.5">
        {BANDS.map((b) => (
          <span key={b} className="whitespace-nowrap">
            <span className="font-semibold text-white/75">{BAND_LABELS[b]}</span>{" "}
            {BAND_HOURS[b].label}
          </span>
        ))}
      </p>
      <p className="mt-0.5">{EVENING_FALL_NOTE}</p>
    </div>
  );
}

/** Saturday and Sunday first: every weekend class runs then (audit L11). */
const WEEKEND_FIRST: readonly Day[] = ["sat", "sun", "mon", "tue", "wed", "thu", "fri"];

// Days × bands tap-to-toggle grid (7 rows × Morning/Afternoon/Evening).
// Shared by the intake availability step, the booking request-a-time form,
// the dashboard editor and the admin player correction.
export function AvailabilityGrid({
  value,
  onChange,
  weekendFirst = false,
  label = "Times you can train",
  firstCellId,
  describedBy,
}: {
  value: Availability;
  onChange: (next: Availability) => void;
  /** List Saturday and Sunday before the weekdays (the quiz). */
  weekendFirst?: boolean;
  /** The group's accessible name. */
  label?: string;
  /** An id for the first cell, so a form can move focus here on an error. */
  firstCellId?: string;
  /** Ids of a hint or an error that describe the whole grid. */
  describedBy?: string;
}) {
  function toggle(day: Day, band: Band) {
    const current = value.days[day] ?? [];
    const nextBands = current.includes(band)
      ? current.filter((b) => b !== band)
      : [...current, band];
    onChange(serializeAvailability({ ...value.days, [day]: nextBands }));
  }

  const days = weekendFirst ? WEEKEND_FIRST : DAYS;

  return (
    <div
      role="group"
      aria-label={label}
      aria-describedby={describedBy}
      className="rounded-2xl border border-white/10 bg-white/5 p-3 sm:p-4"
    >
      {/* Band header — labels the three columns once */}
      <div className="grid grid-cols-[2.5rem_repeat(3,1fr)] gap-2" aria-hidden="true">
        <span />
        {BANDS.map((b) => (
          <span
            key={b}
            className="text-center text-xs font-semibold uppercase tracking-wide text-white/60"
          >
            {BAND_LABELS[b]}
          </span>
        ))}
      </div>

      {/* One row per day; each cell is a tap-to-toggle band button */}
      <div className="mt-2 space-y-2">
        {days.map((d, row) => (
          <div
            key={d}
            className={[
              "grid grid-cols-[2.5rem_repeat(3,1fr)] items-center gap-2",
              // A hairline between the weekend and the weekdays.
              weekendFirst && row === 2 ? "border-t border-white/10 pt-2" : "",
            ].join(" ")}
          >
            <span className="text-sm font-semibold text-white/80">{DAY_LABELS[d]}</span>
            {BANDS.map((b, col) => {
              const on = value.days[d]?.includes(b) ?? false;
              return (
                <button
                  key={b}
                  id={row === 0 && col === 0 ? firstCellId : undefined}
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  aria-label={`${DAY_LABELS[d]} ${BAND_LABELS[b]}`}
                  onClick={() => toggle(d, b)}
                  className={[
                    "flex min-h-[44px] items-center justify-center rounded-xl border text-sm font-medium transition",
                    FOCUS_RING,
                    // Off cells keep a 3:1 outline (WCAG 1.4.11, audit M23).
                    on
                      ? "border-[#B4E655] bg-[#B4E655] text-[#061427]"
                      : "border-white/35 bg-white/5 text-white/70 hover:border-[#B4E655]/60 hover:text-white",
                  ].join(" ")}
                >
                  {on ? "✓" : ""}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
