// Court Plates tokens (audit H1 permanent fix; design specs §2.4).
//
// The plates are inline SVG drawn in code, so these are plain JS constants
// written as SVG attributes, not CSS variables: the same values work in a
// React component, in a server-rendered string and inside next/og. Plates use
// lime and white only. Tier colours never appear in a plate (specs rule 2):
// the art carries the training pattern, the UI below it carries the data.

/** Solid fills. */
export const PLATE_COLOR = {
  bg: "#061427",
  runoff: "#081A30",
  court: "#0B2342",
  white: "#FFFFFF",
  lime: "#B4E655",
} as const;

/** Opacities applied through fill-opacity / stroke-opacity attributes. */
export const PLATE_OPACITY = {
  line: 0.55,
  netCord: 0.7,
  netPost: 0.45,
  netFill: 0.05,
  support: 0.7,
  ghost: 0.28,
  echoLow: 0.3,
  echoHigh: 0.55,
  shadow: 0.16,
  zoneFill: 0.1,
  zoneStroke: 0.45,
  kick: 0.35,
  ring: 0.6,
  markerRing: 0.55,
  markerLine: 0.35,
  footwork: 0.5,
  footworkLime: 0.7,
  hoop: 0.6,
  cone: 0.9,
} as const;

/**
 * Stroke widths in screen pixels (`vector-effect="non-scaling-stroke"`), per
 * density. `compact` is a plate at 480px wide or less (cards, strips); `hero`
 * is the detail-page plate. The OG card uses `fixed`: hero widths multiplied
 * into viewBox units, because Satori ignores vector-effect.
 */
export type PlateDensity = "compact" | "hero" | "fixed";

export type StrokeSet = {
  court: number;
  net: number;
  signature: number;
  support: number;
  shadow: number;
  shadowDash: readonly [number, number];
  mark: number;
};

export const PLATE_STROKES: Record<"compact" | "hero", StrokeSet> = {
  compact: { court: 1, net: 1.25, signature: 2, support: 1.5, shadow: 1, shadowDash: [3, 4], mark: 1 },
  hero: { court: 1.25, net: 1.5, signature: 2.75, support: 1.75, shadow: 1, shadowDash: [4, 5], mark: 1.25 },
};

/** Coming-soon traces are long-dashed; the plate goes solid when the program opens. */
export const COMING_SOON_DASH: readonly [number, number] = [10, 7];

/**
 * Frames: one drawing, three crops, all `preserveAspectRatio="xMidYMid slice"`.
 * Containers set an aspect ratio, never a fixed height.
 */
export type PlateFrame = "master" | "band" | "strip";

export const PLATE_FRAMES: Record<
  PlateFrame,
  { x: number; y: number; width: number; height: number; viewBox: string; aspect: string }
> = {
  /** 16:10 — program detail, the /programs row variant. */
  master: { x: 0, y: 0, width: 1600, height: 1000, viewBox: "0 0 1600 1000", aspect: "16/10" },
  /** 2:1 — ProgramCard, enroll summary. */
  band: { x: 0, y: 100, width: 1600, height: 800, viewBox: "0 100 1600 800", aspect: "2/1" },
  /** 3:1 — dashboard cards, admin previews, the OG card. */
  strip: { x: -100, y: 215, width: 1800, height: 600, viewBox: "-100 215 1800 600", aspect: "3/1" },
};

/** Markers, bounces and zone vertices stay inside this box in every frame. */
export const PLATE_SAFE_AREA = { x0: 40, x1: 1560, y0: 215, y1: 815 } as const;
