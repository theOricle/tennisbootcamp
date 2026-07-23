"use client";

import {
  DAYS,
  BANDS,
  DAY_LABELS,
  BAND_LABELS,
  serializeAvailability,
  type Availability,
  type Day,
  type Band,
} from "@/lib/availability";

// Days × bands tap-to-toggle grid (7 rows × Morning/Afternoon/Evening).
// Shared by the intake availability step and the booking request-a-time form.
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
