// Court Plates compositions (audit H1 permanent fix; design specs §4.4).
//
// One composition per program, all on the same court from the same camera.
// Each element traces to the program's own copy in src/content/programs.ts
// (cited beside it), so a copy change triggers a plate review. Rules that
// hold for every plate: exactly one lime signature trace travelling left to
// right; at most 4 traces, 1 zone and 2 markers; every flight clears the net
// cord by 0.3 m and bounces inside the doubles court; no text, numbers, people
// or tier colours. `npm test` (test-plates.ts) enforces all of it.
//
// A new program starts as `plate: "court"` and renders correctly at once. If
// it earns its own plate, add a PlateId, a PlateSpec here (about 20 lines) and
// a MARK_SPECS entry.

import { COURT, type PlateComposition, type Vec2 } from "./geometry";

export const PLATE_IDS = [
  "youth-programs",
  "high-performance",
  "bootcamps",
  "kids-summer-camp",
  "court",
] as const;

export type PlateId = (typeof PLATE_IDS)[number];

export function isPlateId(x: unknown): x is PlateId {
  return typeof x === "string" && (PLATE_IDS as readonly string[]).includes(x);
}

export type PlateSpec = PlateComposition & {
  id: PlateId;
  /** The pattern's name, for the admin gallery and the docs. */
  name: string;
  /** The program copy each element comes from. */
  copy: readonly string[];
};
// The dashed coming-soon state is never part of a spec: every surface passes
// the program's own `comingSoon` flag to ProgramPlate, so the card, the detail
// hero and the OG card go solid together when the program opens.

const { halfLength: L, halfSingles: SW, serviceLine: SL } = COURT;

export const PLATE_SPECS: Record<PlateId, PlateSpec> = {
  "youth-programs": {
    id: "youth-programs",
    name: "Cross-court reps",
    copy: ["rally and point play", "Movement and agility work"],
    zone: [[7.0, 0.6], [L, 0.6], [L, SW], [7.0, SW]],
    traces: [
      // The feed from the far side.
      { role: "support", from: [10.4, 2.6, 1.0], to: [-9.0, -3.3], apex: 2.4 },
      // Two earlier reps, fading in behind the live one.
      { role: "echo", from: [-10.6, -2.2, 0.9], to: [8.1, 1.6], apex: 2.5, kick: 0, opacity: 0.3 },
      { role: "echo", from: [-10.9, -2.9, 0.9], to: [9.3, 2.5], apex: 2.7, kick: 0, opacity: 0.55 },
      // The live rep, aimed past the service line into the zone.
      { role: "signature", from: [-11.2, -3.5, 0.9], to: [10.3, 3.2], apex: 2.9, ring: true },
    ],
    footwork: { points: [[-11.2, -3.5], [-11.6, -2.4], [-11.8, -1.2], [-11.7, -0.2]] },
    markers: [[-11.2, -3.5, 0.9], [10.4, 2.6, 1.0]],
  },
  "high-performance": {
    id: "high-performance",
    name: "Serve plus one",
    copy: ["Serve plus the next shot", "building points on purpose"],
    zone: [[8.0, -SW], [L, -SW], [L, -1.4], [8.0, -1.4]],
    traces: [
      // The serve, flat, to the T.
      { role: "support", from: [-12.1, -0.5, 2.7], to: [5.9, 0.35], apex: 0.62, kick: 0.15 },
      // The return, the set-up ball.
      { role: "ghost", from: [8.6, 1.0, 0.9], to: [-3.9, -0.6], apex: 1.7, kick: 0 },
      // The +1 into the open corner.
      { role: "signature", from: [-6.9, -0.9, 1.0], to: [10.1, -3.2], apex: 1.9, ring: true },
    ],
    footwork: { points: [[-12.1, -0.5], [-10.6, -0.7], [-9.0, -0.8], [-7.6, -0.9]] },
    markers: [[-12.1, -0.5, 2.7], [8.6, 1.0, 0.9]],
  },
  bootcamps: {
    id: "bootcamps",
    name: "Three levels, three flights",
    copy: ["Three levels run back to back", "newer, intermediate, advanced"],
    // From one spot: a high arc landing short, a mid arc, then the flat drive
    // landing deep. The ladder in ball flight.
    traces: [
      { role: "support", from: [-10.8, -2.6, 0.9], to: [5.4, -2.0], apex: 3.6, kick: 0.12, opacity: 0.4 },
      { role: "support", from: [-10.8, -2.6, 0.9], to: [8.2, -2.1], apex: 2.6, kick: 0.12, opacity: 0.75 },
      { role: "signature", from: [-10.8, -2.6, 0.9], to: [10.9, -2.2], apex: 1.8, kick: 0.16, ring: true },
    ],
    markers: [[-10.8, -2.6, 0.9]],
  },
  "kids-summer-camp": {
    id: "kids-summer-camp",
    name: "Movement games, then rally play",
    copy: ["Kids' Summer Camp is for Junior (7–13) players"],
    cones: [[-10.6, -3.6], [-9.0, -1.8], [-7.4, -3.6], [-5.8, -1.8], [-4.2, -3.6]],
    footwork: {
      lime: true,
      points: [
        [-11.4, -2.7], [-10.6, -2.1], [-9.8, -2.9], [-9.0, -2.5], [-8.2, -3.1],
        [-7.4, -2.4], [-6.6, -2.6], [-5.8, -2.9], [-5.0, -2.4], [-4.2, -2.7],
      ],
    },
    hoops: [[3.6, 2.6], [2.2, 0.9]],
    traces: [
      // A short rally across the service boxes.
      { role: "signature", from: [-4.6, 1.6, 0.8], to: [4.4, 1.0], apex: 2.4, kick: 0.1 },
      { role: "support", from: [4.9, 1.2, 0.8], to: [-3.6, 2.4], apex: 2.2, kick: 0.1 },
    ],
  },
  court: {
    id: "court",
    name: "Cross-court rally",
    copy: ["fallback for a retired or new program"],
    traces: [
      { role: "signature", from: [-10.9, -2.8, 0.9], to: [9.4, 2.6], apex: 2.4, ring: true },
    ],
  },
};

/** The composition for an id; anything unknown renders the fallback court. */
export function plateSpec(id: string | null | undefined): PlateSpec {
  return isPlateId(id) ? PLATE_SPECS[id] : PLATE_SPECS.court;
}

// ── Marks: plan-view thumbnails of the target half-court ────────────────────
// Drawn by PlateMark.tsx in a 96×96 box with the net on the left edge. One
// motif per program, in court metres on the target half (u 0 → 11.885).

export type MarkLine = {
  from: Vec2;
  to: Vec2;
  color: "lime" | "white";
  width?: number;
  opacity?: number;
  /** Landing dot radius in box units (0 for none). */
  dot?: number;
  dotOpacity?: number;
  /** Target ring around the landing. */
  ring?: boolean;
};

export type MarkSpec = {
  zone?: readonly [number, number, number, number];
  lines: readonly MarkLine[];
  hoops?: readonly Vec2[];
  cones?: readonly Vec2[];
  /** Quadratic arc (from, control, to), dashed lime. */
  arc?: { from: Vec2; ctrl: Vec2; to: Vec2 };
};

export const MARK_SPECS: Record<PlateId, MarkSpec> = {
  "youth-programs": {
    zone: [SL + 0.6, 0.6, L, SW],
    lines: [
      { from: [-1, -2.6], to: [8.1, 1.6], color: "lime", width: 1.5, opacity: 0.35, dot: 2.4, dotOpacity: 0.4 },
      { from: [-1, -3.0], to: [9.3, 2.5], color: "lime", width: 1.5, opacity: 0.6, dot: 2.4, dotOpacity: 0.7 },
      { from: [-1, -3.4], to: [10.3, 3.2], color: "lime", dot: 3.2 },
    ],
  },
  "high-performance": {
    zone: [SL + 1.6, -SW, L, -1.4],
    lines: [
      { from: [-1, -0.4], to: [5.9, 0.35], color: "white", width: 1.5, opacity: 0.7, dot: 2.4, dotOpacity: 0.8 },
      { from: [-1, -0.9], to: [10.1, -3.2], color: "lime", dot: 3.2, ring: true },
    ],
  },
  bootcamps: {
    lines: [
      { from: [-1, -2.3], to: [5.4, -2.0], color: "white", width: 1.5, opacity: 0.4, dot: 2.6, dotOpacity: 0.5 },
      { from: [-1, -2.3], to: [8.2, -2.1], color: "white", width: 1.5, opacity: 0.75, dot: 2.6, dotOpacity: 0.85 },
      { from: [-1, -2.3], to: [10.9, -2.2], color: "lime", dot: 3.2 },
    ],
  },
  "kids-summer-camp": {
    lines: [],
    hoops: [[3.6, 2.6], [2.2, 0.9]],
    cones: [[7.5, -3.4], [8.7, -1.8], [9.9, -3.4], [11.1, -1.8]],
    arc: { from: [-1, 1.4], ctrl: [1.8, 4.4], to: [4.4, 1.0] },
  },
  court: {
    lines: [{ from: [-1, -2.8], to: [9.4, 2.6], color: "lime", dot: 3.2 }],
  },
};
