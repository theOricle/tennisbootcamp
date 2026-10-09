import { plateShapes, type PlateShape } from "@/lib/plates/geometry";
import type { PlateId } from "@/lib/plates/specs";
import { PLATE_FRAMES, type PlateFrame } from "@/lib/plates/tokens";
import { plateVariant, resolvePlateSpec } from "@/lib/plates/variant";

// The one program-art primitive (audit H1, design specs §4.6): a Court Plate
// as inline SVG. No hooks and no `server-only`, so it renders in server
// components and inside "use client" admin files alike. The container owns
// the aspect ratio and the corners (`relative overflow-hidden bg-[#061427]`
// plus `aspect-[2/1]`, `aspect-[16/10]` or `aspect-[3/1]`); the SVG fills it.
//
// With no `label` the plate is decorative (aria-hidden) and the text beside
// it carries the meaning. The detail page passes the program's `plateAlt` as
// the label and gets `role="img"`.

export type ProgramPlateProps = {
  plate: PlateId | string;
  frame: PlateFrame;
  /** `compact` at 480px wide or less (cards, strips); `hero` on the detail page. */
  density: "compact" | "hero";
  /** Dashed traces and outline-only bounces until the program opens. */
  comingSoon?: boolean;
  /** A cohort's level band profiles the signature flight (design specs §4.5). */
  levelMin?: number | string | null;
  levelMax?: number | string | null;
  /** Usually the cohort id: picks the side of the court, deterministically. */
  seed?: string | null;
  /** Adult Bootcamps: which class is the lime flight (0, 1, 2). */
  focusSlot?: number | null;
  /** One-shot, motion-safe wipe on mount (detail page only). */
  animate?: boolean;
  /** The accessible name; omitted = decorative. */
  label?: string;
  /** Inside a `group` card: the signature thickens on hover and focus. */
  interactive?: boolean;
  className?: string;
};

/** Hover emphasis per density: the signature stroke +0.5px, the ring to full. */
const INTERACTIVE_TRACE: Record<"compact" | "hero", string> = {
  compact:
    "motion-safe:transition-[stroke-width] motion-safe:duration-200 group-hover:[stroke-width:2.5] group-focus-within:[stroke-width:2.5]",
  hero:
    "motion-safe:transition-[stroke-width] motion-safe:duration-200 group-hover:[stroke-width:3.25] group-focus-within:[stroke-width:3.25]",
};
const INTERACTIVE_RING =
  "motion-safe:transition-[stroke-opacity] motion-safe:duration-200 group-hover:[stroke-opacity:1] group-focus-within:[stroke-opacity:1]";

// The one-shot reveal (design specs §4.8): traces wipe left to right over
// 900ms, the signature 140ms behind the rest; shadows fade in; bounce marks
// and the ring pop once the wipe lands. Keyframes live in tailwind.config.js.
// Everything is `motion-safe:` and fills backwards, so the plate is complete
// and static once the animation ends, or at once under reduced motion.
const WIPE = "motion-safe:animate-plate-wipe";
const WIPE_SIGNATURE = "motion-safe:animate-plate-wipe motion-safe:[animation-delay:140ms]";
const FADE = "motion-safe:animate-plate-fade";
const POP = "motion-safe:animate-plate-pop [transform-box:fill-box] [transform-origin:center] motion-safe:[animation-delay:760ms]";
const POP_SIGNATURE =
  "motion-safe:animate-plate-pop [transform-box:fill-box] [transform-origin:center] motion-safe:[animation-delay:900ms]";

function shapeClass(
  s: PlateShape,
  options: { animate: boolean; interactive: boolean; density: "compact" | "hero" }
): string | undefined {
  const classes: string[] = [];
  if (options.animate) {
    if (s.layer === "trace" || s.layer === "kick") classes.push(s.signature ? WIPE_SIGNATURE : WIPE);
    else if (s.layer === "shadow") classes.push(FADE);
    else if (s.layer === "bounce" || s.layer === "ring") classes.push(s.signature ? POP_SIGNATURE : POP);
  }
  if (options.interactive && s.signature) {
    if (s.layer === "trace") classes.push(INTERACTIVE_TRACE[options.density]);
    else if (s.layer === "ring") classes.push(INTERACTIVE_RING);
  }
  return classes.length > 0 ? classes.join(" ") : undefined;
}

export function ProgramPlate({
  plate,
  frame,
  density,
  comingSoon = false,
  levelMin,
  levelMax,
  seed,
  focusSlot,
  animate = false,
  label,
  interactive = false,
  className = "",
}: ProgramPlateProps) {
  const variant = plateVariant({ plate, levelMin, levelMax, seed, focusSlot });
  const spec = resolvePlateSpec(plate, variant);
  const shapes = plateShapes(spec, { density, side: variant.side, comingSoon: comingSoon || !!spec.comingSoon });
  const a11y = label
    ? { role: "img" as const, "aria-label": label }
    : { "aria-hidden": true as const, focusable: "false" as const };

  return (
    <svg
      viewBox={PLATE_FRAMES[frame].viewBox}
      preserveAspectRatio="xMidYMid slice"
      className={`block h-full w-full ${className}`.trim()}
      {...a11y}
    >
      {shapes.map((s, i) => (
        <path
          key={i}
          d={s.d}
          fill={s.fill}
          fillOpacity={s.fillOpacity}
          stroke={s.stroke}
          strokeOpacity={s.strokeOpacity}
          strokeWidth={s.width}
          strokeDasharray={s.dash?.join(" ")}
          strokeLinecap={s.cap}
          vectorEffect={s.width !== undefined ? "non-scaling-stroke" : undefined}
          className={shapeClass(s, { animate, interactive, density })}
        />
      ))}
    </svg>
  );
}
