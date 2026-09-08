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

/**
 * The hour definitions behind the three bands, read from the one constant in
 * src/lib/availability.ts. Shown next to every grid — intake, request-a-time,
 * the dashboard editor and the admin correction — so a "Morning" means the
 * same hours everywhere.
 */
export function AvailabilityHoursLegend({ className = "" }: { className?: string }) {
  return (
    <div className={["text-xs leading-relaxed text-white/50", className].join(" ").trim()}>
      <p className="flex flex-wrap gap-x-3 gap-y-0.5">
        {BANDS.map((b) => (
          <span key={b} className="whitespace-nowrap">
            <span className="font-semibold text-white/70">{BAND_LABELS[b]}</span>{" "}
            {BAND_HOURS[b].label}
          </span>
        ))}
      </p>
      <p className="mt-0.5">{EVENING_FALL_NOTE}</p>
    </div>
  );
}

// Days × bands tap-to-toggle grid (7 rows × Morning/Afternoon/Evening).
// Shared by the intake availability step, the booking request-a-time form,
// the dashboard editor and the admin player correction.
export function AvailabilityGrid({
  value,
  onChange,
}: {
  value: Availability;
  onChange: (next: Availability) => void;
}) {
  function toggle(day: Day, band: Band) {
    const current = value.days[day] ?? [];
    const nextBands = current.includes(band)
      ? current.filter((b) => b !== band)
      : [...current, band];
    onChange(serializeAvailability({ ...value.days, [day]: nextBands }));
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-3 sm:p-4">
      {/* Band header — labels the three columns once */}
      <div className="grid grid-cols-[2.5rem_repeat(3,1fr)] gap-2">
        <span aria-hidden="true" />
        {BANDS.map((b) => (
          <span
            key={b}
            className="text-center text-[11px] font-semibold uppercase tracking-wide text-white/45"
          >
            {BAND_LABELS[b]}
          </span>
        ))}
      </div>

      {/* One row per day; each cell is a tap-to-toggle band button */}
      <div className="mt-2 space-y-2">
        {DAYS.map((d) => (
          <div key={d} className="grid grid-cols-[2.5rem_repeat(3,1fr)] items-center gap-2">
            <span className="text-sm font-semibold text-white/80">{DAY_LABELS[d]}</span>
            {BANDS.map((b) => {
              const on = value.days[d]?.includes(b) ?? false;
              return (
                <button
                  key={b}
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  aria-label={`${DAY_LABELS[d]} ${BAND_LABELS[b]}`}
                  onClick={() => toggle(d, b)}
                  className={[
                    "flex min-h-[44px] items-center justify-center rounded-xl border text-sm font-medium transition",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B4E655]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#061427]",
                    on
                      ? "border-[#B4E655] bg-[#B4E655] text-[#061427]"
                      : "border-white/15 bg-white/5 text-white/60 hover:border-[#B4E655]/50 hover:text-white/80",
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
