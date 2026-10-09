// Tier emblem geometry (audit H6, design specs §3.2) — pure data, no JSX.
//
// Seven emblems on a 64×64 grid. The motif inside each (ball, rally arcs,
// balance, break, star, crown, trophy and laurel) is the one the badges always
// carried; what escalates now is the FRAME: ring weight, vertex studs, an
// inner ring, notched corners, a bevel ring and the field fill, with one flat
// colour per tier from the ramp in src/lib/tiers.ts. Every adjacent pair
// differs in at least one frame feature, so the rank reads without colour.
//
// Shapes are data and every colour is an SVG attribute (no className fills),
// so the same list renders as React elements in badges.tsx and serialises
// through emblemSvgString() for the email PNG route (design specs §3.9).

import { TIERS, TIER_COUNT, tierById, type TierId } from "@/lib/tiers";
import { FIELD_TINT, FUTURE_INK, NAVY, TIER_FRAME, type TierFrame } from "@/lib/tierStyle";

export type EmblemState = "earned" | "future" | "provisional" | "ghost";
export type EmblemVariant = "full" | "mark";

type Paint = {
  fill?: string;
  fillOpacity?: number;
  stroke?: string;
  strokeWidth?: number;
  strokeOpacity?: number;
  strokeDasharray?: string;
  strokeLinecap?: "round" | "butt";
  strokeLinejoin?: "round" | "miter";
  opacity?: number;
};

export type Shape = Paint &
  (
    | { kind: "polygon"; points: string }
    | { kind: "circle"; cx: number; cy: number; r: number }
    | { kind: "path"; d: string }
    | { kind: "line"; x1: number; y1: number; x2: number; y2: number }
  );

const WHITE = "#FFFFFF";

/** The plain hexagon the first four tiers wear. */
export const HEX = "32,3 57,17.5 57,46.5 32,61 7,46.5 7,17.5";

/** The notched hexagon (4.5 cut from each vertex) for Ace and above. */
export const NOTCHED_HEX =
  "28.11,5.26 35.89,5.26 53.11,15.24 57,22 57,42 53.11,48.76 35.89,58.74 28.11,58.74 10.89,48.76 7,42 7,22 10.89,15.24";

/** Emblems narrower than this render as the mark: outer shape only, no motif. */
export const MARK_MAX_SIZE = 27;

/** The smallest an emblem may render. */
export const MIN_EMBLEM_SIZE = 20;

function parsePoints(points: string): [number, number][] {
  return points
    .trim()
    .split(/\s+/)
    .map((pair) => pair.split(",").map(Number) as [number, number]);
}

function formatPoints(pts: [number, number][]): string {
  return pts.map(([x, y]) => `${round(x)},${round(y)}`).join(" ");
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Scale a polygon about the centre (32,32), clamped inside 1..63. */
export function scalePolygon(points: string, factor: number): string {
  return formatPoints(
    parsePoints(points).map(([x, y]) => [
      Math.min(63, Math.max(1, (x - 32) * factor + 32)),
      Math.min(63, Math.max(1, (y - 32) * factor + 32)),
    ])
  );
}

/** The bevel ring: the notched shape scaled 1.12 about the centre (r ≈ 29.5). */
export const BEVEL_HEX = scalePolygon(NOTCHED_HEX, 1.12);

function outerShape(frame: TierFrame): string {
  return frame.notched ? NOTCHED_HEX : HEX;
}

/** The six stud positions: the plain hexagon's vertices. */
const STUDS = parsePoints(HEX);

/** The variant a rendered size calls for: a mark below 28px, the full emblem above. */
export function emblemVariantForSize(size: number): EmblemVariant {
  return size <= MARK_MAX_SIZE ? "mark" : "full";
}

// ─── Motifs (64-unit grid) ────────────────────────────────────────────────────
// `primary` is the tier's ink, `secondary` the detail ink (white, or navy on
// gold), `field` the fill behind the motif (for the ball's seam).

type Inks = { primary: string; secondary: string; field: string };

const MOTIFS: Record<TierId, (ink: Inks) => Shape[]> = {
  // 1 · Love — a single ball
  1: ({ primary, field }) => [
    { kind: "circle", cx: 32, cy: 32, r: 7, fill: primary },
    {
      kind: "path",
      d: "M26 28.5 A9 9 0 0 1 38 35.5",
      fill: "none",
      stroke: field,
      strokeWidth: 1.6,
      strokeLinecap: "round",
    },
  ],
  // 2 · Rally — two volleying arcs
  2: ({ primary, secondary }) => [
    {
      kind: "path",
      d: "M25 20 A15 15 0 0 0 25 44",
      fill: "none",
      stroke: secondary,
      strokeWidth: 3,
      strokeLinecap: "round",
    },
    {
      kind: "path",
      d: "M39 20 A15 15 0 0 1 39 44",
      fill: "none",
      stroke: primary,
      strokeWidth: 3,
      strokeLinecap: "round",
    },
    { kind: "circle", cx: 32, cy: 32, r: 3.4, fill: primary },
  ],
  // 3 · Deuce — two balanced balls
  3: ({ primary, secondary }) => [
    { kind: "circle", cx: 24, cy: 29, r: 6, fill: "none", stroke: secondary, strokeWidth: 2.6 },
    { kind: "circle", cx: 40, cy: 29, r: 6, fill: primary },
    { kind: "line", x1: 16, y1: 41, x2: 48, y2: 41, stroke: secondary, strokeWidth: 2.4, strokeLinecap: "round" },
    { kind: "path", d: "M32 41 L29 45 L35 45 Z", fill: primary },
  ],
  // 4 · Break — a broken line
  4: ({ primary, secondary }) => [
    { kind: "line", x1: 17, y1: 43, x2: 29, y2: 31, stroke: primary, strokeWidth: 3, strokeLinecap: "round" },
    { kind: "line", x1: 35, y1: 33, x2: 47, y2: 21, stroke: primary, strokeWidth: 3, strokeLinecap: "round" },
    { kind: "circle", cx: 29, cy: 31, r: 2.4, fill: secondary },
    { kind: "circle", cx: 35, cy: 33, r: 2.4, fill: secondary },
  ],
  // 5 · Ace — a star
  5: ({ primary, secondary }) => [
    {
      kind: "path",
      d: "M32 17 L35.5 27.2 L46.3 27.4 L37.7 33.9 L40.8 44.1 L32 38 L23.2 44.1 L26.3 33.9 L17.7 27.4 L28.5 27.2 Z",
      fill: primary,
      stroke: secondary,
      strokeWidth: 1.6,
      strokeLinejoin: "round",
    },
  ],
  // 6 · Match Point — a crown
  6: ({ primary, secondary }) => [
    {
      kind: "path",
      d: "M19 42 L19 25 L26.5 32.5 L32 22 L37.5 32.5 L45 25 L45 42 Z",
      fill: primary,
      stroke: secondary,
      strokeWidth: 1.6,
      strokeLinejoin: "round",
    },
    { kind: "line", x1: 19, y1: 42, x2: 45, y2: 42, stroke: secondary, strokeWidth: 2.4, strokeLinecap: "round" },
    { kind: "circle", cx: 19, cy: 25, r: 2.2, fill: secondary },
    { kind: "circle", cx: 32, cy: 22, r: 2.2, fill: secondary },
    { kind: "circle", cx: 45, cy: 25, r: 2.2, fill: secondary },
  ],
  // 7 · Grand Slam — a trophy with laurel
  7: ({ primary, secondary }) => [
    { kind: "path", d: "M15 43 C12 34 15 25 22 21", fill: "none", stroke: secondary, strokeWidth: 1.8, strokeLinecap: "round" },
    { kind: "path", d: "M49 43 C52 34 49 25 42 21", fill: "none", stroke: secondary, strokeWidth: 1.8, strokeLinecap: "round" },
    { kind: "path", d: "M24 22 C17 22 17 32 24 31", fill: "none", stroke: primary, strokeWidth: 2.2 },
    { kind: "path", d: "M40 22 C47 22 47 32 40 31", fill: "none", stroke: primary, strokeWidth: 2.2 },
    {
      kind: "path",
      d: "M23 21 H41 V26 C41 33.5 37 38 32 38 C27 38 23 33.5 23 26 Z",
      fill: primary,
      stroke: secondary,
      strokeWidth: 1.4,
      strokeLinejoin: "round",
    },
    { kind: "line", x1: 32, y1: 38, x2: 32, y2: 43, stroke: primary, strokeWidth: 2.6 },
    { kind: "line", x1: 25, y1: 44, x2: 39, y2: 44, stroke: secondary, strokeWidth: 2.6, strokeLinecap: "round" },
  ],
};

// ─── Frames ───────────────────────────────────────────────────────────────────

function earnedFrame(id: TierId, variant: EmblemVariant): Shape[] {
  const frame = TIER_FRAME[id];
  const color = tierById(id).color;
  const field = FIELD_TINT[frame.field];
  const outer = outerShape(frame);
  if (variant === "mark") {
    return [
      { kind: "polygon", points: outer, fill: field, stroke: color, strokeWidth: 5, strokeLinejoin: "round" },
    ];
  }
  const shapes: Shape[] = [];
  if (frame.bevel) {
    shapes.push({
      kind: "polygon",
      points: BEVEL_HEX,
      fill: "none",
      stroke: color,
      strokeWidth: 1.5,
      strokeLinejoin: "round",
    });
  }
  shapes.push({
    kind: "polygon",
    points: outer,
    fill: field,
    stroke: color,
    strokeWidth: frame.ring,
    strokeLinejoin: "round",
  });
  const innerPoints = scalePolygon(outer, 0.78);
  if (frame.inner === "faint") {
    shapes.push({ kind: "polygon", points: innerPoints, fill: "none", stroke: WHITE, strokeOpacity: 0.12, strokeWidth: 1, strokeLinejoin: "round" });
  } else if (frame.inner === "tier") {
    shapes.push({ kind: "polygon", points: innerPoints, fill: "none", stroke: color, strokeWidth: 1.5, strokeLinejoin: "round" });
  } else {
    shapes.push({ kind: "polygon", points: innerPoints, fill: "none", stroke: NAVY, strokeOpacity: 0.35, strokeWidth: 1, strokeLinejoin: "round" });
  }
  if (frame.studs) {
    for (const [cx, cy] of STUDS) shapes.push({ kind: "circle", cx, cy, r: 1.8, fill: color });
  }
  return shapes;
}

function earnedInks(id: TierId): Inks {
  const frame = TIER_FRAME[id];
  const color = tierById(id).color;
  if (frame.ink === "navy") return { primary: NAVY, secondary: NAVY, field: FIELD_TINT[frame.field] };
  return { primary: color, secondary: WHITE, field: FIELD_TINT[frame.field] };
}

/**
 * The shapes for one tier in one state. `mark` is the outer shape only (used
 * at 20–27px, always beside the tier name in text); `full` adds the frame
 * details and the motif.
 */
export function EMBLEM_SHAPES(
  id: TierId,
  state: EmblemState = "earned",
  variant: EmblemVariant = "full"
): Shape[] {
  const frame = TIER_FRAME[id];
  const color = tierById(id).color;
  const outer = outerShape(frame);
  switch (state) {
    case "earned":
      return [...earnedFrame(id, variant), ...(variant === "full" ? MOTIFS[id](earnedInks(id)) : [])];
    case "future": {
      const ring: Shape = {
        kind: "polygon",
        points: outer,
        fill: NAVY,
        stroke: FUTURE_INK,
        strokeWidth: variant === "mark" ? 5 : 2,
        strokeLinejoin: "round",
      };
      return [
        ring,
        ...(variant === "full"
          ? MOTIFS[id]({ primary: FUTURE_INK, secondary: FUTURE_INK, field: NAVY })
          : []),
      ];
    }
    case "provisional": {
      const ring: Shape = {
        kind: "polygon",
        points: outer,
        fill: NAVY,
        stroke: color,
        strokeWidth: variant === "mark" ? 5 : frame.ring,
        strokeDasharray: "5 4",
        strokeLinejoin: "round",
      };
      return [
        ring,
        ...(variant === "full"
          ? MOTIFS[id]({ primary: color, secondary: WHITE, field: NAVY }).map((s) => ({ ...s, opacity: 0.6 }))
          : []),
      ];
    }
    case "ghost":
      return GHOST_SHAPES(variant);
  }
}

/** The unranked emblem: a dashed grey hexagon, no motif. */
export function GHOST_SHAPES(variant: EmblemVariant = "full"): Shape[] {
  return [
    {
      kind: "polygon",
      points: HEX,
      fill: NAVY,
      stroke: FUTURE_INK,
      strokeWidth: variant === "mark" ? 5 : 2,
      strokeDasharray: "5 4",
      strokeLinejoin: "round",
    },
  ];
}

/** "Deuce, tier 3 of 7" · "Likely Rally, provisional" · "Unranked". */
export function emblemLabel(id: TierId | null, state: EmblemState = "earned"): string {
  if (id === null || state === "ghost") return "Unranked";
  const tier = tierById(id);
  if (state === "provisional") return `Likely ${tier.name}, provisional`;
  return `${tier.name}, tier ${tier.id} of ${TIER_COUNT}`;
}

function attr(name: string, value: string | number | undefined): string {
  return value === undefined ? "" : ` ${name}="${value}"`;
}

function paintAttrs(s: Paint): string {
  return (
    attr("fill", s.fill) +
    attr("fill-opacity", s.fillOpacity) +
    attr("stroke", s.stroke) +
    attr("stroke-width", s.strokeWidth) +
    attr("stroke-opacity", s.strokeOpacity) +
    attr("stroke-dasharray", s.strokeDasharray) +
    attr("stroke-linecap", s.strokeLinecap) +
    attr("stroke-linejoin", s.strokeLinejoin) +
    attr("opacity", s.opacity)
  );
}

/** One shape as SVG markup. */
export function shapeToSvg(s: Shape): string {
  switch (s.kind) {
    case "polygon":
      return `<polygon points="${s.points}"${paintAttrs(s)}/>`;
    case "circle":
      return `<circle cx="${s.cx}" cy="${s.cy}" r="${s.r}"${paintAttrs(s)}/>`;
    case "path":
      return `<path d="${s.d}"${paintAttrs(s)}/>`;
    case "line":
      return `<line x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}"${paintAttrs(s)}/>`;
  }
}

/**
 * A standalone SVG document for one emblem — the email PNG route renders it
 * at 128px (design specs §3.9). Deterministic: the same input gives the same
 * string.
 */
export function emblemSvgString(
  id: TierId | null,
  {
    size = 128,
    state = "earned",
    variant,
  }: { size?: number; state?: EmblemState; variant?: EmblemVariant } = {}
): string {
  const v = variant ?? emblemVariantForSize(size);
  const shapes = id === null ? GHOST_SHAPES(v) : EMBLEM_SHAPES(id, state, v);
  const label = emblemLabel(id, id === null ? "ghost" : state);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}" role="img" aria-label="${label}">` +
    shapes.map(shapeToSvg).join("") +
    `</svg>`
  );
}

/** Every tier id, low to high, for galleries and tests. */
export const TIER_IDS: readonly TierId[] = TIERS.map((t) => t.id);
