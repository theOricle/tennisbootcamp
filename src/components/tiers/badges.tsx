// The seven tier badges — one consistent geometric badge system.
//
// Every badge is the same hexagon "field" (#061427) ringed in lime (#B4E655),
// with a white/lime motif that escalates up the ladder: a single ball at Love,
// two volleying arcs at Rally, balanced balls at Deuce, a broken line at Break,
// a star at Ace, a crown at Match Point, a trophy-and-laurel at Grand Slam.
//
// Drawn on a 64×64 grid with generous stroke weights so the shapes stay legible
// shrunk to a 20px chip and crisp blown up to 64px. Each is role="img" with an
// aria-label; pass `decorative` to hide it from the a11y tree when an adjacent
// text label already names the tier.

import type { TierId } from "@/lib/tiers";

const FIELD = "#061427";
const LIME = "#B4E655";
const WHITE = "#FFFFFF";

export type BadgeProps = {
  /** Rendered width/height in px. Default 64. */
  size?: number;
  className?: string;
  /** Override the aria-label (defaults to e.g. "Love tier badge"). */
  label?: string;
  /** Hide from assistive tech when a text label already names the tier. */
  decorative?: boolean;
};

// Shared hexagon field + lime ring, plus a faint inner ring for depth.
function Field() {
  return (
    <>
      <polygon
        points="32,3 57,17.5 57,46.5 32,61 7,46.5 7,17.5"
        fill={FIELD}
        stroke={LIME}
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
      <polygon
        points="32,9 51.5,20.25 51.5,43.75 32,55 12.5,43.75 12.5,20.25"
        fill="none"
        stroke={WHITE}
        strokeOpacity={0.12}
        strokeWidth={1}
        strokeLinejoin="round"
      />
    </>
  );
}

function Svg({
  size = 64,
  className,
  label,
  decorative,
  name,
  children,
}: BadgeProps & { name: string; children: React.ReactNode }) {
  const a11y = decorative
    ? { "aria-hidden": true as const }
    : { role: "img" as const, "aria-label": label ?? `${name} tier badge` };
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      {...a11y}
    >
      <Field />
      {children}
    </svg>
  );
}

// ─── 1 · Love — a single ball dot ─────────────────────────────────────────────
export function LoveBadge(props: BadgeProps) {
  return (
    <Svg {...props} name="Love">
      <circle cx={32} cy={32} r={7} fill={LIME} />
      <path
        d="M26 28.5 A9 9 0 0 1 38 35.5"
        fill="none"
        stroke={FIELD}
        strokeWidth={1.6}
        strokeLinecap="round"
      />
    </Svg>
  );
}

// ─── 2 · Rally — two volleying arcs ───────────────────────────────────────────
export function RallyBadge(props: BadgeProps) {
  return (
    <Svg {...props} name="Rally">
      <path
        d="M25 20 A15 15 0 0 0 25 44"
        fill="none"
        stroke={WHITE}
        strokeWidth={3}
        strokeLinecap="round"
      />
      <path
        d="M39 20 A15 15 0 0 1 39 44"
        fill="none"
        stroke={LIME}
        strokeWidth={3}
        strokeLinecap="round"
      />
      <circle cx={32} cy={32} r={3.4} fill={LIME} />
    </Svg>
  );
}

// ─── 3 · Deuce — two balanced balls ───────────────────────────────────────────
export function DeuceBadge(props: BadgeProps) {
  return (
    <Svg {...props} name="Deuce">
      <circle
        cx={24}
        cy={29}
        r={6}
        fill="none"
        stroke={WHITE}
        strokeWidth={2.6}
      />
      <circle cx={40} cy={29} r={6} fill={LIME} />
      <line
        x1={16}
        y1={41}
        x2={48}
        y2={41}
        stroke={WHITE}
        strokeWidth={2.4}
        strokeLinecap="round"
      />
      <path d="M32 41 L29 45 L35 45 Z" fill={LIME} />
    </Svg>
  );
}

// ─── 4 · Break — a broken line ────────────────────────────────────────────────
export function BreakBadge(props: BadgeProps) {
  return (
    <Svg {...props} name="Break">
      <line
        x1={17}
        y1={43}
        x2={29}
        y2={31}
        stroke={LIME}
        strokeWidth={3}
        strokeLinecap="round"
      />
      <line
        x1={35}
        y1={33}
        x2={47}
        y2={21}
        stroke={LIME}
        strokeWidth={3}
        strokeLinecap="round"
      />
      <circle cx={29} cy={31} r={2.4} fill={WHITE} />
      <circle cx={35} cy={33} r={2.4} fill={WHITE} />
    </Svg>
  );
}

// ─── 5 · Ace — a star ─────────────────────────────────────────────────────────
export function AceBadge(props: BadgeProps) {
  return (
    <Svg {...props} name="Ace">
      <path
        d="M32 17 L35.5 27.2 L46.3 27.4 L37.7 33.9 L40.8 44.1 L32 38 L23.2 44.1 L26.3 33.9 L17.7 27.4 L28.5 27.2 Z"
        fill={LIME}
        stroke={WHITE}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// ─── 6 · Match Point — a crown ────────────────────────────────────────────────
export function MatchPointBadge(props: BadgeProps) {
  return (
    <Svg {...props} name="Match Point">
      <path
        d="M19 42 L19 25 L26.5 32.5 L32 22 L37.5 32.5 L45 25 L45 42 Z"
        fill={LIME}
        stroke={WHITE}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
      <line
        x1={19}
        y1={42}
        x2={45}
        y2={42}
        stroke={WHITE}
        strokeWidth={2.4}
        strokeLinecap="round"
      />
      <circle cx={19} cy={25} r={2.2} fill={WHITE} />
      <circle cx={32} cy={22} r={2.2} fill={WHITE} />
      <circle cx={45} cy={25} r={2.2} fill={WHITE} />
    </Svg>
  );
}

// ─── 7 · Grand Slam — a trophy with laurel ────────────────────────────────────
export function GrandSlamBadge(props: BadgeProps) {
  return (
    <Svg {...props} name="Grand Slam">
      {/* laurel */}
      <path
        d="M15 43 C12 34 15 25 22 21"
        fill="none"
        stroke={WHITE}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
      <path
        d="M49 43 C52 34 49 25 42 21"
        fill="none"
        stroke={WHITE}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
      {/* handles */}
      <path
        d="M24 22 C17 22 17 32 24 31"
        fill="none"
        stroke={LIME}
        strokeWidth={2.2}
      />
      <path
        d="M40 22 C47 22 47 32 40 31"
        fill="none"
        stroke={LIME}
        strokeWidth={2.2}
      />
      {/* cup */}
      <path
        d="M23 21 H41 V26 C41 33.5 37 38 32 38 C27 38 23 33.5 23 26 Z"
        fill={LIME}
        stroke={WHITE}
        strokeWidth={1.4}
        strokeLinejoin="round"
      />
      {/* stem + base */}
      <line x1={32} y1={38} x2={32} y2={43} stroke={LIME} strokeWidth={2.6} />
      <line
        x1={25}
        y1={44}
        x2={39}
        y2={44}
        stroke={WHITE}
        strokeWidth={2.6}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/** All seven badge components, indexed by tier id (1–7). */
export const BADGE_BY_TIER: Record<
  TierId,
  (props: BadgeProps) => React.JSX.Element
> = {
  1: LoveBadge,
  2: RallyBadge,
  3: DeuceBadge,
  4: BreakBadge,
  5: AceBadge,
  6: MatchPointBadge,
  7: GrandSlamBadge,
};
