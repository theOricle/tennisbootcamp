// Tier UI — the labeled badge, the chips, the line and the rank card. All
// derive from the numeric level via src/lib/tiers.ts; nothing here stores or
// mutates a level.
//
// One primitive per job (design specs §1.2): TierEmblem for a single tier,
// TierLine for the line, RankCard for a player's rank, TierChip and
// TierRangeBadges for inline tier text. The old TierLadder (a horizontal
// scroller that hid three tiers on phones, audit H6) is gone: use
// `<TierLine variant="ladder" />`. TierStatus and UnrankedChip ("Unranked —
// book your assessment", a purchase pitched as a rank) went in audit PR H:
// the dashboard and /profile mount the RankCard instead.

import {
  TIER_COUNT,
  tierForLevel,
  formatLevelNumber,
  formatTierSpan,
  tierRangeForLevels,
} from "@/lib/tiers";
import { BADGE_BY_TIER, TierEmblem, type BadgeProps } from "./badges";

export * from "./badges";
export { TierLine, type TierLineProps, type TierLineSpan } from "./TierLine";
export { RankCard, formatShortDate, type RankCardProps, type RankCardPlayer } from "./RankCard";
export {
  emblemSvgString,
  emblemLabel,
  type EmblemState,
  type EmblemVariant,
} from "./emblemGeometry";

/** The chip base (design-system.md): 12px is the floor, never smaller. */
const CHIP_BASE =
  "inline-flex min-h-6 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium";
const CHIP_NEUTRAL = "border border-white/15 bg-white/5 text-white/85";
const CHIP_DASHED = "border border-dashed border-white/30 bg-white/5 text-white/85";

/**
 * Labeled tier badge — emblem + tier name + numeric level ("Rally · 2.5").
 * Renders nothing when the level is unranked (callers show `UnrankedChip`).
 * The emblem is decorative because the text beside it already names the tier.
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
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <TierEmblem tier={tier.id} size={size} decorative className="shrink-0" />
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

/** A single tier emblem by level, or nothing when unranked. Handy for chips. */
export function TierGlyph({
  level,
  ...props
}: { level: number | string | null | undefined } & BadgeProps) {
  const tier = tierForLevel(level);
  if (!tier) return null;
  const Badge = BADGE_BY_TIER[tier.id];
  return <Badge {...props} />;
}

/** The no-level chip: a ghost mark and the one player-facing word, "Unranked". */
export function UnrankedTag({ className = "" }: { className?: string }) {
  return (
    <span className={`${CHIP_BASE} ${CHIP_DASHED} ${className}`.trim()}>
      <TierEmblem tier={null} size={20} decorative className="shrink-0" />
      Unranked
    </span>
  );
}

/**
 * Tier chip for dense rows (admin, dashboard lists): a 20px mark and the
 * name. `showLevel` adds "· 3.0"; `provisional` reads "Likely Rally" with a
 * dashed border. A null level renders the UnrankedTag.
 */
export function TierChip({
  level,
  showLevel = false,
  provisional = false,
  className = "",
}: {
  level: number | string | null | undefined;
  showLevel?: boolean;
  provisional?: boolean;
  className?: string;
}) {
  const tier = tierForLevel(level);
  if (!tier) return <UnrankedTag className={className} />;
  return (
    <span
      className={`${CHIP_BASE} ${provisional ? CHIP_DASHED : CHIP_NEUTRAL} ${className}`.trim()}
    >
      <TierEmblem
        tier={tier.id}
        state={provisional ? "provisional" : "earned"}
        size={20}
        decorative
        className="shrink-0"
      />
      <span>
        {provisional && <span className="text-white/70">Likely </span>}
        <span className="font-semibold text-white">{tier.name}</span>
        {showLevel && !provisional && (
          <span className="tabular-nums text-white/60"> · {formatLevelNumber(level)}</span>
        )}
      </span>
    </span>
  );
}

/**
 * A cohort's or program's tier band as a chip — the min mark, the span in
 * words ("Deuce", "Love – Rally", "Break and up", "All levels") and the max
 * mark when it differs. Renders nothing when the span is empty.
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
  const single = range.min.id === range.max.id;
  return (
    <span className={`${CHIP_BASE} ${CHIP_NEUTRAL} ${className}`.trim()}>
      <TierEmblem tier={range.min.id} size={20} decorative className="shrink-0" />
      <span className="font-semibold text-white">{formatTierSpan(levelMin, levelMax)}</span>
      {!single && <TierEmblem tier={range.max.id} size={20} decorative className="shrink-0" />}
      <span className="sr-only">
        {single
          ? `, tier ${range.min.id} of ${TIER_COUNT}`
          : `, tiers ${range.min.id} to ${range.max.id} of ${TIER_COUNT}`}
      </span>
    </span>
  );
}
