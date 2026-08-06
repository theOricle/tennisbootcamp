// Tier UI — the labeled badge, the unranked chip, the header decision helper,
// and the ladder strip. All derive from the numeric level via src/lib/tiers.ts;
// nothing here stores or mutates a level.

import Link from "next/link";
import {
  TIERS,
  tierForLevel,
  formatLevelNumber,
  tierRangeForLevels,
} from "@/lib/tiers";
import { BADGE_BY_TIER, type BadgeProps } from "./badges";

export * from "./badges";

/**
 * Labeled tier badge — glyph + tier name + numeric level ("Rally · 2.5").
 * Renders nothing when the level is unranked (callers show `UnrankedChip`).
 * The glyph is decorative because the text beside it already names the tier.
 */
export function TierBadge({
  level,
  size = 40,
  className = "",
}: {
  level: number | string | null | undefined;
  size?: number;
  className?: string;
}) {
  const tier = tierForLevel(level);
  if (!tier) return null;
  const Badge = BADGE_BY_TIER[tier.id];
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <Badge size={size} decorative className="shrink-0" />
      <span className="leading-tight">
        <span className="block text-sm font-semibold text-white">
          {tier.name}
        </span>
        <span className="block text-xs font-medium text-[#B4E655]">
          Level {formatLevelNumber(level)}
        </span>
      </span>
    </span>
  );
}

/** A single tier glyph by level, or nothing when unranked. Handy for chips. */
export function TierGlyph({
  level,
  ...props
}: { level: number | string | null | undefined } & BadgeProps) {
  const tier = tierForLevel(level);
  if (!tier) return null;
  const Badge = BADGE_BY_TIER[tier.id];
  return <Badge {...props} />;
}

/**
 * Subtle "Unranked — book your assessment" chip linking to booking. Shown w
 * wherever a player has no coach-assigned level yet. 44px min touch target.
 */
export function UnrankedChip({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/assessment/book"
      className={`inline-flex min-h-[44px] items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 text-sm font-medium text-white/70 transition hover:border-[#B4E655]/50 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B4E655]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#061427] ${className}`}
    >
      <span
        aria-hidden="true"
        className="inline-block h-2 w-2 rounded-full bg-white/30"
      />
      Unranked — book your assessment
    </Link>
  );
}

/**
 * Header decision: the labeled `TierBadge` when a level is set, otherwise the
 * `UnrankedChip`. This is the shared treatment for the profile and dashboard
 * headers — one call, so both stay identical.
 */
export function TierStatus({
  level,
  badgeSize = 40,
  className = "",
}: {
  level: number | string | null | undefined;
  badgeSize?: number;
  className?: string;
}) {
  const tier = tierForLevel(level);
  return tier ? (
    <TierBadge level={level} size={badgeSize} className={className} />
  ) : (
    <UnrankedChip className={className} />
  );
}

/** Small tier chip for dense rows (admin bookings): glyph + name. */
export function TierChip({
  level,
  className = "",
}: {
  level: number | string | null | undefined;
  className?: string;
}) {
  const tier = tierForLevel(level);
  if (!tier) return null;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full bg-[#B4E655]/10 px-2 py-0.5 text-[11px] font-semibold text-[#B4E655] ${className}`}
    >
      <TierGlyph level={level} size={16} decorative className="shrink-0" />
      {tier.name}
    </span>
  );
}

/**
 * A cohort's tier band as badges — "Deuce" for a single-tier band, both ends
 * for a spread ("Deuce – Break"). Derived from the numeric level_min/level_max
 * via tierForLevel; renders nothing when the cohort isn't tier-gated.
 */
export function TierRangeBadges({
  levelMin,
  levelMax,
  className = "",
}: {
  levelMin: number | string | null | undefined;
  levelMax: number | string | null | undefined;
  className?: string;
}) {
  const range = tierRangeForLevels(levelMin, levelMax);
  if (!range) return null;
  const MinBadge = BADGE_BY_TIER[range.min.id];
  const MaxBadge = BADGE_BY_TIER[range.max.id];
  const single = range.min.id === range.max.id;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full bg-[#B4E655]/10 px-2.5 py-1 text-[11px] font-semibold text-[#B4E655] ${className}`}
    >
      <MinBadge size={16} decorative className="shrink-0" />
      {single ? (
        range.min.name
      ) : (
        <>
          {range.min.name}
          <span aria-hidden="true" className="text-white/40">
            –
          </span>
          <MaxBadge size={16} decorative className="shrink-0" />
          {range.max.name}
        </>
      )}
    </span>
  );
}

/**
 * Compact ladder strip: all seven tiers with mini badges, low to high, so a
 * prospect sees the progression they're joining. Scrolls horizontally on small
 * screens; the whole row is one accessible list.
 */
export function TierLadder({ className = "" }: { className?: string }) {
  return (
    <ul
      className={`flex snap-x gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:justify-center ${className}`}
      aria-label="The seven tiers, from Love to Grand Slam"
    >
      {TIERS.map((tier) => {
        const Badge = BADGE_BY_TIER[tier.id];
        return (
          <li
            key={tier.id}
            className="flex w-[76px] shrink-0 snap-start flex-col items-center gap-2 text-center"
          >
            <Badge size={44} decorative />
            <span className="text-xs font-semibold leading-tight text-white">
              {tier.name}
            </span>
            <span className="text-[10px] leading-none text-white/40">
              {tier.band}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
