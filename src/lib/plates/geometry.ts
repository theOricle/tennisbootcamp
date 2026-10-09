// Court Plates geometry (audit H1 permanent fix; design specs §4.3).
//
// Every plate draws the same court from one fixed broadcast camera, the
// Hawk-Eye replay idiom, and programs differ only by what happens on it. This
// module owns the court space, the camera, ball flight sampling and the
// primitives, and turns a composition (specs.ts) into a list of flat shapes
// that both the React component and the string serialiser render.
//
// Court space is metres with the origin at the net centre on the ground:
// `u` runs along the length (baselines at ±11.885), `v` across (doubles
// sidelines at ±5.485), `z` up. Pure and deterministic: no React, no DOM, no
// randomness, so the same input always yields the same markup.

import {
  COMING_SOON_DASH,
  PLATE_COLOR,
  PLATE_FRAMES,
  PLATE_OPACITY,
  PLATE_STROKES,
  type PlateDensity,
  type PlateFrame,
} from "./tokens";

export type Vec2 = readonly [number, number];
export type Vec3 = readonly [number, number, number];

/** Which side of the court the pattern plays on: `ad` mirrors v → −v. */
export type PlateSide = "deuce" | "ad";

/** ITF court dimensions, in metres. */
export const COURT = {
  halfLength: 11.885,
  halfDoubles: 5.485,
  halfSingles: 4.115,
  serviceLine: 6.4,
  centreMark: 0.3,
  runoffU: 14.885,
  runoffV: 7.485,
  netCentre: 0.914,
  netPost: 1.07,
  postV: 6.4,
} as const;

/** The one camera: position, target, focal length and principal point. */
export const CAMERA = {
  pos: [-7, -27, 17] as Vec3,
  target: [0.5, 0.8, 0] as Vec3,
  F: 1800,
  cx: 800,
  cy: 431,
} as const;

// ── vector helpers ──────────────────────────────────────────────────────────
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]);
  return [a[0] / l, a[1] / l, a[2] / l];
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const BASIS = (() => {
  const f = norm(sub(CAMERA.target, CAMERA.pos));
  const r = norm(cross(f, [0, 0, 1]));
  const up = cross(r, f);
  return { f, r, up };
})();

/** Court point (u, v, z) → viewBox point, in the master frame's 1600×1000 space. */
export function project(u: number, v: number, z = 0, side: PlateSide = "deuce"): Vec2 {
  const d = sub([u, side === "ad" ? -v : v, z], CAMERA.pos);
  const depth = dot(d, BASIS.f);
  return [
    CAMERA.cx + (CAMERA.F * dot(d, BASIS.r)) / depth,
    CAMERA.cy - (CAMERA.F * dot(d, BASIS.up)) / depth,
  ];
}

/** Net cord height at v: 0.914 m at the centre, 1.07 m at the posts. */
export function netHeightAt(v: number): number {
  const t = Math.min(Math.abs(v), COURT.postV) / COURT.postV;
  return COURT.netCentre + (COURT.netPost - COURT.netCentre) * t * t;
}

// ── ball flight ─────────────────────────────────────────────────────────────

export type Flight = {
  /** The ball in the air, 33 samples from contact to bounce. */
  air: Vec3[];
  /** The same path on the ground (the dashed shadow). */
  ground: Vec3[];
  /** The kick after the bounce: 22% of the flight length, 38% of the apex. */
  kick: Vec3[];
  /** Where the ball lands, in court metres. */
  landing: Vec2;
  /** Height above the net cord where the flight crosses it; null if it never does. */
  clearance: number | null;
};

const FLIGHT_SAMPLES = 32;
const KICK_SAMPLES = 12;
const KICK_LENGTH = 0.22;
const KICK_APEX = 0.38;

/**
 * A flight from contact `from` (u, v, z0) to bounce `to` (u, v) with apex
 * lift `apex`: u and v are linear in t, z = z0·(1−t) + 4·apex·t·(1−t).
 * `kick` is the length of the kick after the bounce as a fraction of the
 * flight; 0 draws no kick.
 */
export function flight(from: Vec3, to: Vec2, apex: number, kick = KICK_LENGTH): Flight {
  const air: Vec3[] = [];
  const ground: Vec3[] = [];
  for (let i = 0; i <= FLIGHT_SAMPLES; i++) {
    const t = i / FLIGHT_SAMPLES;
    const u = lerp(from[0], to[0], t);
    const v = lerp(from[1], to[1], t);
    air.push([u, v, from[2] * (1 - t) + 4 * apex * t * (1 - t)]);
    ground.push([u, v, 0]);
  }
  const kickPts: Vec3[] = [];
  if (kick > 0) {
    const du = (to[0] - from[0]) * kick;
    const dv = (to[1] - from[1]) * kick;
    const kh = apex * KICK_APEX;
    for (let i = 0; i <= KICK_SAMPLES; i++) {
      const t = i / KICK_SAMPLES;
      kickPts.push([to[0] + du * t, to[1] + dv * t, 4 * kh * t * (1 - t)]);
    }
  }
  let clearance: number | null = null;
  if (Math.sign(from[0]) !== Math.sign(to[0]) && from[0] !== to[0]) {
    const t = from[0] / (from[0] - to[0]);
    const v = lerp(from[1], to[1], t);
    const z = from[2] * (1 - t) + 4 * apex * t * (1 - t);
    clearance = z - netHeightAt(v);
  }
  return { air, ground, kick: kickPts, landing: [to[0], to[1]], clearance };
}

// ── shapes ──────────────────────────────────────────────────────────────────

export type PlateLayer =
  | "ground"
  | "court"
  | "zone"
  | "net"
  | "footwork"
  | "hoop"
  | "cone"
  | "shadow"
  | "trace"
  | "kick"
  | "bounce"
  | "ring"
  | "marker";

/** One flat SVG path. Colours are attributes, never classes, so the same data serialises to a string. */
export type PlateShape = {
  d: string;
  layer: PlateLayer;
  fill: string;
  fillOpacity?: number;
  stroke?: string;
  strokeOpacity?: number;
  width?: number;
  dash?: readonly number[];
  cap?: "round" | "square";
  /** The one lime trace per plate (and its kick, bounce and ring). */
  signature?: boolean;
};

export type TraceRole = "signature" | "support" | "ghost" | "echo";

export type TraceSpec = {
  role: TraceRole;
  from: Vec3;
  to: Vec2;
  apex: number;
  /** Kick length as a fraction of the flight; defaults to 22%, 0 for none. */
  kick?: number;
  /** Target ring on the bounce (signature only). */
  ring?: boolean;
  /** Overrides the role's default colour. */
  color?: "lime" | "white";
  /** Overrides the role's default opacity. */
  opacity?: number;
};

export type PlateComposition = {
  /** Ground polygon, lime @0.10 fill, @0.45 stroke. At most one. */
  zone?: readonly Vec2[];
  /** Up to 4 traces, drawn in order (first = furthest back). */
  traces: readonly TraceSpec[];
  /** Dotted footwork path on the ground. */
  footwork?: { points: readonly Vec2[]; lime?: boolean };
  /** Player markers: ground ring, hairline to contact height, contact dot. At most 2. */
  markers?: readonly Vec3[];
  cones?: readonly Vec2[];
  hoops?: readonly Vec2[];
};

export type PlateOptions = {
  density: PlateDensity;
  /** viewBox units per screen pixel; only read for `fixed` (OG). */
  scale?: number;
  side?: PlateSide;
  comingSoon?: boolean;
};

const px = (n: number) => String(Math.round(n));
const pathOf = (pts: readonly Vec2[], close = false) =>
  "M" + pts.map((p) => `${px(p[0])} ${px(p[1])}`).join("L") + (close ? "Z" : "");

function groundEllipse(u: number, v: number, radius: number, side: PlateSide, n = 24): string {
  const pts: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push(project(u + radius * Math.cos(a), v + radius * Math.sin(a), 0, side));
  }
  return pathOf(pts, true);
}

/** A dot drawn as a zero-length round-capped stroke, so it keeps its size at any scale. */
function dotPath(p: Vec2): string {
  return `M${px(p[0])} ${px(p[1])}l0.01 0`;
}

const ROLE_STYLE: Record<TraceRole, { color: "lime" | "white"; opacity: number }> = {
  signature: { color: "lime", opacity: 1 },
  support: { color: "white", opacity: PLATE_OPACITY.support },
  ghost: { color: "white", opacity: PLATE_OPACITY.ghost },
  echo: { color: "lime", opacity: PLATE_OPACITY.echoLow },
};

/**
 * Turn a composition into flat shapes. Draw order: ground, court lines, zone,
 * net, footwork, hoops, cones, then each trace (shadow, flight, kick, bounce,
 * ring) and finally the player markers.
 */
export function plateShapes(spec: PlateComposition, options: PlateOptions): PlateShape[] {
  const side = options.side ?? "deuce";
  const scale = options.density === "fixed" ? options.scale ?? 1 : 1;
  const S = PLATE_STROKES[options.density === "fixed" ? "hero" : options.density];
  const w = (n: number) => n * scale;
  const dash = (d: readonly number[]) => d.map((n) => n * scale);
  const P = (u: number, v: number, z = 0) => project(u, v, z, side);
  const line3 = (pts: readonly Vec3[]) => pathOf(pts.map((p) => P(p[0], p[1], p[2])));
  const out: PlateShape[] = [];

  // Ground: an oversized background so any crop stays filled, the run-off, the court.
  out.push({ d: "M-400 -400h2400v1800h-2400Z", layer: "ground", fill: PLATE_COLOR.bg });
  const { halfLength: L, halfDoubles: DW, halfSingles: SW, serviceLine: SL, runoffU, runoffV } = COURT;
  out.push({
    d: pathOf([P(-runoffU, -runoffV), P(runoffU, -runoffV), P(runoffU, runoffV), P(-runoffU, runoffV)], true),
    layer: "ground",
    fill: PLATE_COLOR.runoff,
  });
  out.push({
    d: pathOf([P(-L, -DW), P(L, -DW), P(L, DW), P(-L, DW)], true),
    layer: "ground",
    fill: PLATE_COLOR.court,
  });

  // Court lines: doubles and singles sidelines, baselines, service lines,
  // centre service line and the two centre marks.
  const lines: [Vec2, Vec2][] = [
    [[-L, -DW], [L, -DW]],
    [[-L, DW], [L, DW]],
    [[-L, -DW], [-L, DW]],
    [[L, -DW], [L, DW]],
    [[-L, -SW], [L, -SW]],
    [[-L, SW], [L, SW]],
    [[-SL, -SW], [-SL, SW]],
    [[SL, -SW], [SL, SW]],
    [[-SL, 0], [SL, 0]],
    [[-L, 0], [-L + COURT.centreMark, 0]],
    [[L, 0], [L - COURT.centreMark, 0]],
  ];
  out.push({
    d: lines.map(([a, b]) => pathOf([P(a[0], a[1]), P(b[0], b[1])])).join(""),
    layer: "court",
    fill: "none",
    stroke: PLATE_COLOR.white,
    strokeOpacity: PLATE_OPACITY.line,
    width: w(S.court),
    cap: "square",
  });

  if (spec.zone) {
    out.push({
      d: pathOf(spec.zone.map((q) => P(q[0], q[1])), true),
      layer: "zone",
      fill: PLATE_COLOR.lime,
      fillOpacity: PLATE_OPACITY.zoneFill,
      stroke: PLATE_COLOR.lime,
      strokeOpacity: PLATE_OPACITY.zoneStroke,
      width: w(S.mark),
    });
  }

  // Net: translucent mesh, the cord sampled at 25 points, two posts.
  const cord: Vec2[] = [];
  for (let i = 0; i <= 24; i++) {
    const v = -COURT.postV + (2 * COURT.postV * i) / 24;
    cord.push(P(0, v, netHeightAt(v)));
  }
  out.push({
    d: pathOf([...cord, P(0, COURT.postV), P(0, -COURT.postV)], true),
    layer: "net",
    fill: PLATE_COLOR.white,
    fillOpacity: PLATE_OPACITY.netFill,
  });
  out.push({
    d: pathOf(cord),
    layer: "net",
    fill: "none",
    stroke: PLATE_COLOR.white,
    strokeOpacity: PLATE_OPACITY.netCord,
    width: w(S.net),
  });
  out.push({
    d:
      pathOf([P(0, -COURT.postV), P(0, -COURT.postV, COURT.netPost)]) +
      pathOf([P(0, COURT.postV), P(0, COURT.postV, COURT.netPost)]),
    layer: "net",
    fill: "none",
    stroke: PLATE_COLOR.white,
    strokeOpacity: PLATE_OPACITY.netPost,
    width: w(S.net),
  });

  if (spec.footwork) {
    out.push({
      d: pathOf(spec.footwork.points.map((q) => P(q[0], q[1]))),
      layer: "footwork",
      fill: "none",
      stroke: spec.footwork.lime ? PLATE_COLOR.lime : PLATE_COLOR.white,
      strokeOpacity: spec.footwork.lime ? PLATE_OPACITY.footworkLime : PLATE_OPACITY.footwork,
      width: w(S.mark * 1.6),
      dash: dash([0.1, 7]),
      cap: "round",
    });
  }

  for (const [u, v] of spec.hoops ?? []) {
    out.push({
      d: groundEllipse(u, v, 0.6, side, 32),
      layer: "hoop",
      fill: "none",
      stroke: PLATE_COLOR.white,
      strokeOpacity: PLATE_OPACITY.hoop,
      width: w(S.mark * 1.2),
    });
  }

  for (const [u, v] of spec.cones ?? []) {
    out.push({
      d: pathOf([P(u - 0.16, v), P(u + 0.16, v), P(u, v, 0.42)], true),
      layer: "cone",
      fill: PLATE_COLOR.lime,
      fillOpacity: PLATE_OPACITY.cone,
    });
  }

  for (const t of spec.traces) {
    const fl = flight(t.from, t.to, t.apex, t.kick ?? KICK_LENGTH);
    const style = ROLE_STYLE[t.role];
    const color = (t.color ?? style.color) === "lime" ? PLATE_COLOR.lime : PLATE_COLOR.white;
    const opacity = t.opacity ?? style.opacity;
    const signature = t.role === "signature";
    const width = w(signature ? S.signature : S.support);
    out.push({
      d: line3(fl.ground),
      layer: "shadow",
      fill: "none",
      stroke: PLATE_COLOR.white,
      strokeOpacity: PLATE_OPACITY.shadow,
      width: w(S.shadow),
      dash: dash(S.shadowDash),
      signature,
    });
    const comingDash = options.comingSoon ? dash(COMING_SOON_DASH) : undefined;
    out.push({
      d: line3(fl.air),
      layer: "trace",
      fill: "none",
      stroke: color,
      strokeOpacity: opacity,
      width,
      dash: comingDash,
      cap: "round",
      signature,
    });
    if (fl.kick.length > 0) {
      out.push({
        d: line3(fl.kick),
        layer: "kick",
        fill: "none",
        stroke: color,
        strokeOpacity: opacity * PLATE_OPACITY.kick,
        width: width * 0.75,
        dash: comingDash,
        cap: "round",
        signature,
      });
    }
    out.push({
      d: groundEllipse(fl.landing[0], fl.landing[1], 0.24, side),
      layer: "bounce",
      fill: options.comingSoon ? "none" : color,
      fillOpacity: options.comingSoon ? undefined : opacity,
      stroke: color,
      strokeOpacity: opacity,
      width: w(1),
      signature,
    });
    if (t.ring) {
      out.push({
        d: groundEllipse(fl.landing[0], fl.landing[1], 0.75, side, 32),
        layer: "ring",
        fill: "none",
        stroke: PLATE_COLOR.lime,
        strokeOpacity: PLATE_OPACITY.ring,
        width: w(1),
        signature,
      });
    }
  }

  for (const [u, v, z] of spec.markers ?? []) {
    out.push({
      d: groundEllipse(u, v, 0.5, side),
      layer: "marker",
      fill: "none",
      stroke: PLATE_COLOR.white,
      strokeOpacity: PLATE_OPACITY.markerRing,
      width: w(S.mark),
    });
    out.push({
      d: pathOf([P(u, v), P(u, v, z)]),
      layer: "marker",
      fill: "none",
      stroke: PLATE_COLOR.white,
      strokeOpacity: PLATE_OPACITY.markerLine,
      width: w(1),
    });
    out.push({
      d: dotPath(P(u, v, z)),
      layer: "marker",
      fill: "none",
      stroke: PLATE_COLOR.white,
      width: w(7),
      cap: "round",
    });
  }

  return out;
}

// ── checks the tests and the gallery share ──────────────────────────────────

/** Every flight of a composition with its net clearance and landing, for the physics checks. */
export function flightsOf(spec: PlateComposition): Flight[] {
  return spec.traces.map((t) => flight(t.from, t.to, t.apex, t.kick ?? KICK_LENGTH));
}

/** True when (u, v) is on or inside the doubles court. */
export function insideDoublesCourt([u, v]: Vec2): boolean {
  return Math.abs(u) <= COURT.halfLength + 1e-9 && Math.abs(v) <= COURT.halfDoubles + 1e-9;
}

/** Projected points the safe-area test checks: markers, bounces and zone vertices. */
export function anchorPoints(spec: PlateComposition, side: PlateSide = "deuce"): Vec2[] {
  const pts: Vec2[] = [];
  for (const q of spec.zone ?? []) pts.push(project(q[0], q[1], 0, side));
  for (const t of spec.traces) pts.push(project(t.to[0], t.to[1], 0, side));
  for (const m of spec.markers ?? []) pts.push(project(m[0], m[1], 0, side), project(m[0], m[1], m[2], side));
  return pts;
}

// ── string serialiser (OG card, tests) ──────────────────────────────────────

function attr(name: string, value: string | number | undefined): string {
  return value === undefined ? "" : ` ${name}="${value}"`;
}

/** One shape as an SVG `<path>` string. `fixed` density writes no vector-effect. */
export function shapeToString(s: PlateShape, density: PlateDensity): string {
  return (
    `<path d="${s.d}"` +
    attr("fill", s.fill) +
    attr("fill-opacity", s.fillOpacity) +
    attr("stroke", s.stroke) +
    attr("stroke-opacity", s.strokeOpacity) +
    attr("stroke-width", s.width) +
    attr("stroke-dasharray", s.dash?.join(" ")) +
    attr("stroke-linecap", s.cap) +
    (s.width !== undefined && density !== "fixed" ? ` vector-effect="non-scaling-stroke"` : "") +
    "/>"
  );
}

/**
 * A whole plate as a standalone SVG document. `renderWidth` sets the stroke
 * scale for `fixed` density; `width`/`height` are the document's own size
 * (the OG card writes 1200×380 so Satori and resvg can place it).
 */
export function plateSvgString(
  spec: PlateComposition,
  frame: PlateFrame,
  options: PlateOptions & { renderWidth?: number; width?: number; height?: number }
): string {
  const fr = PLATE_FRAMES[frame];
  const scale = options.density === "fixed" ? fr.width / (options.renderWidth ?? fr.width) : 1;
  const shapes = plateShapes(spec, { ...options, scale });
  const size = attr("width", options.width) + attr("height", options.height);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg"${size} viewBox="${fr.viewBox}" preserveAspectRatio="xMidYMid slice">` +
    shapes.map((s) => shapeToString(s, options.density)).join("") +
    `</svg>`
  );
}
