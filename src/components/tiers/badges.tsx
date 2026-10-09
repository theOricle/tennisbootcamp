// The seven tier emblems (audit H6, design specs §3.2).
//
// One component, `TierEmblem`, draws any tier in any of four states —
// earned, future, provisional, ghost — from the shape data in
// emblemGeometry.ts. The frame escalates up the ladder (ring weight, studs,
// inner ring, notched corners, bevel, field) in one flat tier colour each, so
// the rank reads at a glance and without colour. Below 28px the emblem is a
// "mark": the outer shape only, always sitting beside the tier name in text.
//
// Every colour is an SVG attribute, never a className, so the same data
// serialises for the email PNG route. Emblems are role="img" with a label,
// or aria-hidden when `decorative` because adjacent text names the tier.
// They are never focusable.

import type { TierId } from "@/lib/tiers";
import {
  EMBLEM_SHAPES,
  GHOST_SHAPES,
  MIN_EMBLEM_SIZE,
  emblemLabel,
  emblemVariantForSize,
  type EmblemState,
  type EmblemVariant,
  type Shape,
} from "./emblemGeometry";

export type TierEmblemProps = {
  /** The tier, or null for the unranked ghost. */
  tier: TierId | null;
  state?: EmblemState;
  /** Rendered width and height in px (minimum 20). Default 64. */
  size?: number;
  /**
   * Fill the parent instead of a fixed pixel size (the ladder sizes its
   * nodes with responsive classes). Always the full variant.
   */
  fluid?: boolean;
  /** Force the mark or the full emblem instead of deciding by size. */
  variant?: EmblemVariant;
  /** Override the accessible name. */
  label?: string;
  /** Hide from assistive tech when adjacent text already names the tier. */
  decorative?: boolean;
  className?: string;
};

function ShapeEl({ shape }: { shape: Shape }) {
  const paint = {
    fill: shape.fill,
    fillOpacity: shape.fillOpacity,
    stroke: shape.stroke,
    strokeWidth: shape.strokeWidth,
    strokeOpacity: shape.strokeOpacity,
    strokeDasharray: shape.strokeDasharray,
    strokeLinecap: shape.strokeLinecap,
    strokeLinejoin: shape.strokeLinejoin,
    opacity: shape.opacity,
  };
  switch (shape.kind) {
    case "polygon":
      return <polygon points={shape.points} {...paint} />;
    case "circle":
      return <circle cx={shape.cx} cy={shape.cy} r={shape.r} {...paint} />;
    case "path":
      return <path d={shape.d} {...paint} />;
    case "line":
      return <line x1={shape.x1} y1={shape.y1} x2={shape.x2} y2={shape.y2} {...paint} />;
  }
}

export function TierEmblem({
  tier,
  state = "earned",
  size = 64,
  fluid = false,
  variant,
  label,
  decorative = false,
  className,
}: TierEmblemProps) {
  const px = Math.max(MIN_EMBLEM_SIZE, size);
  const v = variant ?? (fluid ? "full" : emblemVariantForSize(px));
  const effectiveState: EmblemState = tier === null ? "ghost" : state;
  const shapes = tier === null ? GHOST_SHAPES(v) : EMBLEM_SHAPES(tier, effectiveState, v);
  const a11y = decorative
    ? { "aria-hidden": true as const }
    : { role: "img" as const, "aria-label": label ?? emblemLabel(tier, effectiveState) };
  return (
    <svg
      viewBox="0 0 64 64"
      width={fluid ? "100%" : px}
      height={fluid ? "100%" : px}
      className={className}
      focusable="false"
      {...a11y}
    >
      {shapes.map((shape, i) => (
        <ShapeEl key={i} shape={shape} />
      ))}
    </svg>
  );
}

// ─── Back-compat wrappers ─────────────────────────────────────────────────────
// The seven named badges and BADGE_BY_TIER keep their old API (earned state).

export type BadgeProps = {
  /** Rendered width/height in px. Default 64. */
  size?: number;
  className?: string;
  /** Override the aria-label (defaults to e.g. "Love, tier 1 of 7"). */
  label?: string;
  /** Hide from assistive tech when a text label already names the tier. */
  decorative?: boolean;
};

function badgeFor(tier: TierId) {
  const Badge = (props: BadgeProps) => <TierEmblem tier={tier} {...props} />;
  Badge.displayName = `TierBadge${tier}`;
  return Badge;
}

export const LoveBadge = badgeFor(1);
export const RallyBadge = badgeFor(2);
export const DeuceBadge = badgeFor(3);
export const BreakBadge = badgeFor(4);
export const AceBadge = badgeFor(5);
export const MatchPointBadge = badgeFor(6);
export const GrandSlamBadge = badgeFor(7);

/** All seven badge components, indexed by tier id (1–7). */
export const BADGE_BY_TIER: Record<TierId, (props: BadgeProps) => React.JSX.Element> = {
  1: LoveBadge,
  2: RallyBadge,
  3: DeuceBadge,
  4: BreakBadge,
  5: AceBadge,
  6: MatchPointBadge,
  7: GrandSlamBadge,
};
