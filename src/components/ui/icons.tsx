import type { ReactNode } from "react";

// The site's small pictograms (owner-approved design, 2026-11-17): inline
// SVG, drawn in the current text colour, hidden from assistive tech and out
// of the tab order. An icon never carries meaning the words beside it do
// not, so every one is decoration. No icon font and no package: the shapes
// are drawn here. The map pin is PinIcon in
// src/components/locations/LocationLine.tsx, the one pin on the site.

type IconProps = {
  /** Size and colour, as Tailwind classes ("h-5 w-5 text-[#B4E655]"). */
  className?: string;
};

/** An icon whose line weight a surface may set (the home band draws its three at 1.8). */
type WeightedIconProps = IconProps & { strokeWidth?: number };

function Icon({
  className = "h-5 w-5",
  strokeWidth = 2,
  children,
}: IconProps & { strokeWidth?: number; children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

// ── The class: tennis and fitness ───────────────────────────────────────────

/** Two arrows chasing each other: the class rotates. Shape from the Lucide icon set ("refresh-cw"), ISC licence. */
export function RotateIcon({ className, strokeWidth = 2 }: WeightedIconProps) {
  return (
    <Icon className={className} strokeWidth={strokeWidth}>
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M8 16H3v5" />
    </Icon>
  );
}

/** Two people: a group of players. Shape from the Lucide icon set ("users"), ISC licence. */
export function PlayersIcon({ className, strokeWidth = 2 }: WeightedIconProps) {
  return (
    <Icon className={className} strokeWidth={strokeWidth}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </Icon>
  );
}

/** A racket: technique. */
export function TechniqueIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <g transform="rotate(-38 12 12)">
        <ellipse cx="12" cy="7.9" rx="4.7" ry="5.9" />
        <path d="M10.3 2.6v10.6M13.7 2.6v10.6M7.6 6h8.8M7.6 9.6h8.8" strokeWidth={1} opacity={0.7} />
        <path d="M12 13.8v2.6" />
        <path d="M12 16.6v5.6" strokeWidth={3} />
      </g>
    </Icon>
  );
}

/** Dotted steps and an arrow: footwork. */
export function FootworkIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M3.6 20.2c2.8-.4 4.6-2.4 5.6-5s3-4.6 6.2-5.4" strokeWidth={2.4} strokeDasharray="0.1 3.6" />
      <path d="M15.2 5.9 19 9 15.9 12.6" />
    </Icon>
  );
}

/** A cross, a ball and the path between them: tactics. */
export function TacticsIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M4.4 14.6l4 4M8.4 14.6l-4 4" />
      <circle cx="17.6" cy="6.6" r="2.6" />
      <path d="M9.6 14.4c1-3.4 2.6-5 5-5.9" />
      <path d="M12.2 7.2l2.6 1.3-1.2 2.7" />
    </Icon>
  );
}

/** A target: focus. */
export function FocusIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" />
    </Icon>
  );
}

/** A bolt: power. */
export function PowerIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M13.2 2.8 5.6 13.4h5.2l-1 7.8 8.6-11.4h-5.6z" />
    </Icon>
  );
}

/** A stopwatch with its hand moving: speed. */
export function SpeedIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <circle cx="12" cy="13.6" r="7.4" />
      <path d="M12 13.6 15.2 10.2" />
      <path d="M9.8 3h4.4M12 3v3.2" />
    </Icon>
  );
}

/** A pulse line: stamina. */
export function StaminaIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M2.5 12.5h3.6l2.3-6 3.8 12 2.7-8.2 1.5 2.2h5.1" />
    </Icon>
  );
}

/** An arc with both ends turning: mobility. */
export function MobilityIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M4 17a8 8 0 0 1 16 0" />
      <path d="M1.6 13.6 4 17.2l3.7-2.1" />
      <path d="M22.4 13.6 20 17.2l-3.7-2.1" />
      <circle cx="12" cy="17" r="1.2" fill="currentColor" stroke="none" />
    </Icon>
  );
}

/** A court with a ball in play: point play, and the first day on court. */
export function PointPlayIcon({ className, strokeWidth = 2 }: WeightedIconProps) {
  return (
    <Icon className={className} strokeWidth={strokeWidth}>
      <rect x="3" y="5.5" width="18" height="13" rx="1.2" />
      <path d="M12 5.5v13M3 12h3.2M17.8 12H21" />
      <circle cx="16.4" cy="9.3" r="1.3" fill="currentColor" stroke="none" />
    </Icon>
  );
}

// ── How joining works ───────────────────────────────────────────────────────

/** Two rows, the first one ticked: pick a group. */
export function PickGroupIcon({ className }: IconProps) {
  return (
    <Icon className={className} strokeWidth={1.7}>
      <rect x="3.5" y="4" width="17" height="6.6" rx="2" />
      <rect x="3.5" y="13.4" width="17" height="6.6" rx="2" opacity={0.45} />
      <path d="M7 7.3l1.5 1.5 2.8-3" />
    </Icon>
  );
}

/** A payment card: pay online. */
export function PayCardIcon({ className }: IconProps) {
  return (
    <Icon className={className} strokeWidth={1.7}>
      <rect x="2.8" y="5.5" width="18.4" height="13" rx="2.2" />
      <path d="M2.8 10h18.4M6.4 14.8h3.6" />
    </Icon>
  );
}

// ── Lines on a group card, the "Good to know" rows, where and who ───────────

/** A person: who a group is for, and the coach. */
export function PersonIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.8 20c.8-3.8 3.6-5.8 7.2-5.8s6.4 2 7.2 5.8" />
    </Icon>
  );
}

/** A calendar: when a group trains. */
export function CalendarIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </Icon>
  );
}

/** A court from above: week one, on court. */
export function CourtIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <rect x="3" y="5.5" width="18" height="13" rx="1.2" />
      <path d="M12 5.5v13" />
    </Icon>
  );
}

/** A shield with a tick: by approval. */
export function ApprovalIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M12 3.2l7 2.6v5.4c0 4.4-2.9 7.9-7 9.6-4.1-1.7-7-5.2-7-9.6V5.8z" />
      <path d="M8.8 12.2l2.2 2.2 4.2-4.4" />
    </Icon>
  );
}

/** A stopwatch: the 20-minute assessment. */
export function StopwatchIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <circle cx="12" cy="13.6" r="7.4" />
      <path d="M12 13.6V9.6M9.8 3h4.4" />
    </Icon>
  );
}

/** A page: the Program Policies. */
export function DocumentIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M6.5 3.5h7.6l3.4 3.6v13.4h-11z" />
      <path d="M9.4 11.5h5.2M9.4 15h5.2" />
    </Icon>
  );
}
