// A player's rank (design specs §3.6): the tier emblem, "Tier 2 of 7", the
// name, the level, a rail with the player's position, and what comes next.
// The tier-colour top rule is the only block of colour on the card. Three
// states: ranked, unranked (the ghost, no pitch), and placed (a quiz-placed
// player in a banded cohort, owner D6-B). The dashboard and /profile mount it
// in PR-H; /admin/tiers shows the fixtures.

import type { PlayerRecord } from "@/lib/players";
import {
  TIER_RERATE_LINE,
  formatLevelNumber,
  formatTierSpan,
  tierForLevel,
  tierOrdinal,
  tierProgress,
  tierRangeForLevels,
} from "@/lib/tiers";
import { TIER_RULE } from "@/lib/tierStyle";
import { Button } from "@/components/ui/Button";
import { TierEmblem } from "./badges";
import { TierLine } from "./TierLine";

export type RankCardPlayer = Pick<
  PlayerRecord,
  "id" | "full_name" | "relationship" | "is_minor" | "level" | "level_assessed_at" | "level_notes"
>;

export type RankCardProps = {
  player: RankCardPlayer;
  layout: "wide" | "compact";
  /** The account holder looking at their own rank ("Your tier"). */
  isSelf: boolean;
  /** A quiz-placed player's cohort band (owner D6-B): the Placed state. */
  placedSpan?: { min: number | null; max: number | null } | null;
  /** Show the coach's note (owner D14, default off). */
  showNote?: boolean;
  /** /profile only, when the account has no enrollments: a secondary "Book Your Assessment". */
  assessmentLink?: boolean;
  headingLevel?: "h2" | "h3";
  className?: string;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Oct 4" from an ISO timestamp, with a fixed month list so server and client agree. */
export function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

function firstName(full: string | null): string {
  return (full ?? "").trim().split(/\s+/)[0] || "";
}

/** The eyebrow: "Your tier", or "{First} · Child · Under 18". */
function eyebrowFor(player: RankCardPlayer, isSelf: boolean): string {
  if (isSelf) return "Your tier";
  const parts = [firstName(player.full_name) || "Player"];
  if (player.relationship === "child") parts.push("Child");
  else if (player.relationship === "spouse") parts.push("Partner");
  if (player.is_minor) parts.push("Under 18");
  return parts.join(" · ");
}

const SHELL = "rounded-2xl border border-white/10 bg-white/5 p-5 md:p-6";
const EYEBROW = "text-xs font-semibold uppercase tracking-[0.12em] text-[#B4E655]";

export function RankCard({
  player,
  layout,
  isSelf,
  placedSpan = null,
  showNote = false,
  assessmentLink = false,
  headingLevel = "h3",
  className = "",
}: RankCardProps) {
  const Heading = headingLevel;
  const tier = tierForLevel(player.level);
  const progress = tierProgress(player.level);
  const name = firstName(player.full_name);
  const eyebrow = eyebrowFor(player, isSelf);

  // ── Ranked ──────────────────────────────────────────────────────────────
  if (tier && progress) {
    const setBy = player.level_assessed_at
      ? `Set by Sina · ${formatShortDate(player.level_assessed_at)}`
      : "";
    const footer = (
      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
        <p className="text-white/70">{progress.caption}</p>
        {setBy && <p className="text-xs text-white/60">{setBy}</p>}
      </div>
    );
    const extras = (
      <>
        {TIER_RERATE_LINE && <p className="mt-2 text-sm text-white/70">{TIER_RERATE_LINE}</p>}
        {showNote && player.level_notes && (
          <details className="mt-3 border-t border-white/10 pt-1">
            <summary className="flex min-h-[44px] cursor-pointer list-none items-center text-sm font-semibold text-white/80 hover:text-white [&::-webkit-details-marker]:hidden">
              Sina&apos;s note
            </summary>
            <p className="pb-2 text-sm text-white/70">{player.level_notes}</p>
          </details>
        )}
      </>
    );

    if (layout === "wide") {
      return (
        <section className={`${SHELL} ${TIER_RULE[tier.id]} ${className}`.trim()}>
          <div className="md:flex md:items-start md:gap-8">
            <div className="flex items-start gap-5 md:w-[280px] md:shrink-0">
              <TierEmblem tier={tier.id} size={80} decorative className="shrink-0" />
              <div className="min-w-0">
                <p className={EYEBROW}>{eyebrow}</p>
                <p className="mt-1 text-xs text-white/60">{tierOrdinal(tier)}</p>
                <Heading className="text-2xl font-semibold tracking-tight text-white">{tier.name}</Heading>
                <p className="text-sm tabular-nums text-[#B4E655]">Level {formatLevelNumber(player.level)}</p>
                <p className="mt-2 text-sm text-white/70">{tier.blurb}</p>
              </div>
            </div>
            <div className="mt-5 min-w-0 flex-1 md:mt-0">
              <TierLine variant="ladder" orientation="horizontal" density="compact" level={player.level} className="hidden md:grid" />
              <TierLine variant="rail" size="md" level={player.level} labels="ends" className="md:hidden" />
            </div>
          </div>
          {footer}
          {extras}
        </section>
      );
    }

    return (
      <section className={`${SHELL} ${TIER_RULE[tier.id]} ${className}`.trim()}>
        <div className="flex items-start gap-4">
          <TierEmblem tier={tier.id} size={64} decorative className="shrink-0" />
          <div className="min-w-0">
            <p className={EYEBROW}>{eyebrow}</p>
            <p className="mt-1 text-xs text-white/60">{tierOrdinal(tier)}</p>
            <Heading className="text-2xl font-semibold tracking-tight text-white">{tier.name}</Heading>
            <p className="text-sm tabular-nums text-[#B4E655]">Level {formatLevelNumber(player.level)}</p>
          </div>
        </div>
        <TierLine variant="rail" size="md" level={player.level} labels="ends" className="mt-5" />
        {footer}
        {extras}
      </section>
    );
  }

  // ── Placed (owner D6-B): a quiz-placed player in a banded cohort ─────────
  const placed = placedSpan ? tierRangeForLevels(placedSpan.min, placedSpan.max) : null;
  if (placed) {
    const group = `${formatTierSpan(placedSpan?.min, placedSpan?.max)} group`;
    const body = isSelf
      ? `You train in a ${group}. Sina sets your exact level once he has seen you play.`
      : `${name || "This player"} trains in a ${group}. Sina sets their exact level once he has seen them play.`;
    return (
      <section className={`${SHELL} ${TIER_RULE[placed.min.id]} ${className}`.trim()}>
        <div className="flex items-start gap-4">
          <TierEmblem tier={placed.min.id} state="provisional" size={64} decorative className="shrink-0" />
          <div className="min-w-0">
            <p className={EYEBROW}>{eyebrow}</p>
            <p className="mt-1 text-xs text-white/60">Placed</p>
            <Heading className="text-2xl font-semibold tracking-tight text-white">{group}</Heading>
          </div>
        </div>
        <TierLine variant="rail" size="md" span={{ min: placedSpan?.min, max: placedSpan?.max }} labels="ends" className="mt-5" />
        <p className="mt-4 text-sm text-white/70">{body}</p>
      </section>
    );
  }

  // ── Unranked ────────────────────────────────────────────────────────────
  const unrankedBody = isSelf
    ? "Your tier shows here once Sina sets your level."
    : `${name || "This player"}'s tier shows here once Sina sets their level.`;
  return (
    <section className={`${SHELL} border-t-2 border-t-white/15 ${className}`.trim()}>
      <div className="flex items-start gap-4">
        <TierEmblem tier={null} size={64} decorative className="shrink-0" />
        <div className="min-w-0">
          <p className={EYEBROW}>{eyebrow}</p>
          <Heading className="mt-1 text-2xl font-semibold tracking-tight text-white">Unranked</Heading>
        </div>
      </div>
      <TierLine variant="rail" size="md" labels="ends" className="mt-5" />
      <p className="mt-4 text-sm text-white/70">{unrankedBody}</p>
      {assessmentLink && (
        <div className="mt-4">
          <p className="text-sm text-white/70">
            The assessment is $20 — enroll in a program afterward and that $20 comes off the price.
          </p>
          <Button variant="secondary" href="/assessment/book" className="mt-3">
            Book Your Assessment
          </Button>
        </div>
      )}
      {TIER_RERATE_LINE && (
        <p className="mt-2 text-sm text-white/70">{TIER_RERATE_LINE}</p>
      )}
    </section>
  );
}
