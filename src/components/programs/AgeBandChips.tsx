import {
  AGE_BAND_LABELS,
  AGE_BAND_STEP,
  ANY_AGE_LABEL,
  isAnyAge,
  orderAgeBands,
  type AgeBand,
} from "@/lib/ageBand";

// Age as shape plus text, in neutral white (design specs §1.2, §4.6): one
// chip per band in display order, or a single "Any age" chip when a program
// takes all three. The text is exactly AGE_BAND_LABELS; the glyph is a
// three-bar step with the band's bar lit, and is decorative.

const CHIP =
  "inline-flex min-h-6 items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-medium text-white/85";

const BAR_HEIGHTS = [5, 8, 11] as const;

function AgeGlyph({ lit }: { lit: readonly boolean[] }) {
  return (
    <svg viewBox="0 0 12 12" width={12} height={12} aria-hidden="true" focusable="false" className="shrink-0">
      {BAR_HEIGHTS.map((h, i) => (
        <rect
          key={i}
          x={i * 4}
          y={12 - h}
          width={3}
          height={h}
          rx={0.5}
          fill="#FFFFFF"
          fillOpacity={lit[i] ? 0.9 : 0.25}
        />
      ))}
    </svg>
  );
}

export function AgeBandChips({ bands, className = "" }: { bands: readonly AgeBand[]; className?: string }) {
  if (isAnyAge(bands)) {
    return (
      <span className={`${CHIP} ${className}`.trim()}>
        <AgeGlyph lit={[true, true, true]} />
        {ANY_AGE_LABEL}
      </span>
    );
  }
  const ordered = orderAgeBands(bands);
  if (ordered.length === 0) return null;
  return (
    <ul role="list" className={`flex flex-wrap gap-1.5 ${className}`.trim()}>
      {ordered.map((band) => (
        <li key={band} className={CHIP}>
          <AgeGlyph lit={BAR_HEIGHTS.map((_, i) => i === AGE_BAND_STEP[band])} />
          {AGE_BAND_LABELS[band]}
        </li>
      ))}
    </ul>
  );
}
