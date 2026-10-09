// The tier line (audit H6, M36; design specs §3.3) — the one line used
// everywhere a rank or a span is shown.
//
// `rail`: seven tier groups of thirteen pips that step up in height and
// colour, Love to Grand Slam — the game-rank meter. It shows a player's
// position (lit up to the current pip, a caret above it), a provisional
// estimate (the likely tier outlined), a span (lit inside the band), a span
// with a named marker, or nothing (ghost). It never scrolls: every pip stays
// at least 14px wide at 272px.
//
// `ladder`: the seven emblems on a connected line, horizontal (seven
// columns) or vertical (Grand Slam on top, DOM order Love-first), with node
// states for a level or a span and blurbs when asked. Never a horizontal
// scroller — any md+ surface narrower than 480px uses `vertical` or the rail.
//
// Colour never carries the rank alone: the tier name is in text beside every
// rail, or in the line's accessible name.

import {
  TIERS,
  TIER_COUNT,
  LEVEL_STEPS,
  formatLevelNumber,
  levelNumber,
  tierForLevel,
  tierIdsInRange,
  tierProgress,
  tierRangeForLevels,
  type Tier,
  type TierId,
} from "@/lib/tiers";
import { PIP_UNLIT, TIER_PIP, TIER_PIP_OUTLINE } from "@/lib/tierStyle";
import { TierEmblem } from "./badges";
import type { EmblemState } from "./emblemGeometry";

export type TierLineSpan = {
  min?: number | string | null;
  max?: number | string | null;
};

export type TierLineProps = {
  variant: "rail" | "ladder";
  /** The player's level: "you are here". */
  level?: number | string | null;
  /** The level is a quiz estimate, not a coach-set level. */
  provisional?: boolean;
  /** A cohort's or program's level band. */
  span?: TierLineSpan | null;
  /** A named player marker on a span rail ("You", "Maya"). */
  marker?: { level: number; label: string } | null;
  /** Rail: pip heights. */
  size?: "xs" | "sm" | "md";
  /** Ladder: `responsive` is vertical below md, horizontal at md and up. */
  orientation?: "horizontal" | "vertical" | "responsive";
  /** Ladder: smaller emblems and cells. */
  density?: "default" | "compact";
  /** Ladder: each tier's one-line blurb. */
  showBlurbs?: boolean;
  /** Rail: text labels. `all` collapses to `ends` below md. */
  labels?: "none" | "ends" | "all";
  className?: string;
};

type Mode = "position" | "span" | "ghost";

function resolveMode(props: TierLineProps): Mode {
  if (levelNumber(props.level) !== null) return "position";
  if (props.span && tierRangeForLevels(props.span.min, props.span.max)) return "span";
  return "ghost";
}

/** The index of a level on the thirteen-step grid, clamped. */
function stepIndex(level: number): number {
  const clamped = Math.min(7, Math.max(1, level));
  return Math.round((clamped - 1) * 2);
}

const LIME = "bg-[#B4E655]";
const CONNECTOR_OFF = "bg-white/15";

// ─── Rail ─────────────────────────────────────────────────────────────────────

/** Pip height per tier group and size, as complete class literals. */
const RAIL_HEIGHT: Record<"xs" | "sm" | "md", Record<TierId, string>> = {
  xs: { 1: "h-[3px]", 2: "h-[3px]", 3: "h-[3px]", 4: "h-[3px]", 5: "h-[3px]", 6: "h-[3px]", 7: "h-[3px]" },
  sm: { 1: "h-[4px]", 2: "h-[5px]", 3: "h-[6px]", 4: "h-[7px]", 5: "h-[8px]", 6: "h-[9px]", 7: "h-[10px]" },
  md: { 1: "h-[6px]", 2: "h-[8px]", 3: "h-[10px]", 4: "h-[12px]", 5: "h-[14px]", 6: "h-[16px]", 7: "h-[18px]" },
};

function Caret({ dashed }: { dashed: boolean }) {
  return (
    <svg
      viewBox="0 0 8 5"
      width={8}
      height={5}
      aria-hidden="true"
      className="absolute -top-[8px] left-1/2 -translate-x-1/2"
    >
      {dashed ? (
        <path d="M0.8 0.6 H7.2 L4 4.2 Z" fill="none" stroke="#FFFFFF" strokeWidth={0.9} strokeDasharray="1.6 1.1" />
      ) : (
        <path d="M0 0 H8 L4 5 Z" fill="#FFFFFF" />
      )}
    </svg>
  );
}

function Rail(props: TierLineProps) {
  const { size = "sm", labels = "none", provisional = false, marker = null, className = "" } = props;
  const mode = resolveMode(props);
  const level = levelNumber(props.level);
  const tier = tierForLevel(level);
  const progress = tierProgress(level);
  const range = mode === "span" && props.span ? tierRangeForLevels(props.span.min, props.span.max) : null;
  const spanMin = range ? levelNumber(props.span?.min ?? props.span?.max) : null;
  const spanMax = range ? levelNumber(props.span?.max ?? props.span?.min) : null;
  const lo = spanMin !== null && spanMax !== null ? Math.min(spanMin, spanMax) : null;
  const hi = spanMin !== null && spanMax !== null ? Math.max(spanMin, spanMax) : null;

  const current = mode === "position" && level !== null ? stepIndex(level) : -1;
  const markerIndex = mode === "span" && marker ? stepIndex(marker.level) : -1;
  const markerTier = mode === "span" && marker ? tierForLevel(marker.level) : null;
  const markerInRange =
    markerTier !== null && range !== null && markerTier.id >= range.min.id && markerTier.id <= range.max.id;

  // Room above the pips for a caret, and for a marker's label.
  const headroom = markerIndex >= 0 ? "pt-7" : current >= 0 ? "pt-2.5" : "";

  function pipClass(t: Tier, index: number): string {
    if (mode === "position" && tier) {
      if (provisional) return t.id === tier.id ? TIER_PIP_OUTLINE[t.id] : PIP_UNLIT;
      if (index < current) return `${TIER_PIP[t.id]} forced-colors:bg-[color:Highlight]`;
      if (index === current) return `${TIER_PIP[t.id]} ring-[1.5px] ring-white forced-colors:bg-[color:Highlight]`;
      return PIP_UNLIT;
    }
    if (mode === "span" && lo !== null && hi !== null) {
      const step = LEVEL_STEPS[index];
      return step >= lo && step <= hi ? `${TIER_PIP[t.id]} forced-colors:bg-[color:Highlight]` : PIP_UNLIT;
    }
    return PIP_UNLIT;
  }

  // Accessible name for the track; the pips themselves are hidden.
  let a11y: Record<string, string | number>;
  if (mode === "position" && tier && progress) {
    a11y = provisional
      ? {
          role: "img",
          "aria-label": `Likely ${tier.name}, provisional. Tier ${tier.id} of ${TIER_COUNT}.`,
        }
      : {
          role: "meter",
          "aria-label": "Tier",
          "aria-valuemin": 1,
          "aria-valuemax": TIER_COUNT,
          "aria-valuenow": tier.id,
          "aria-valuetext": `${tier.name}, level ${formatLevelNumber(level)}, tier ${tier.id} of ${TIER_COUNT}. ${progress.caption}`,
        };
  } else if (mode === "span" && range && lo !== null && hi !== null) {
    const who = range.min.id === range.max.id ? range.min.name : `${range.min.name} to ${range.max.name}`;
    a11y = {
      role: "img",
      "aria-label": `Built for ${who}, levels ${lo.toFixed(1)} to ${hi.toFixed(1)}`,
    };
  } else {
    a11y = { role: "img", "aria-label": "Unranked. Seven tiers, Love to Grand Slam." };
  }

  // Which names light up under the groups.
  function nameLit(t: Tier): boolean {
    if (mode === "position" && tier) return provisional ? t.id === tier.id : t.id <= tier.id;
    if (mode === "span" && range) return t.id >= range.min.id && t.id <= range.max.id;
    return false;
  }

  const ends = (() => {
    if (mode === "position" && tier && progress) {
      const left = provisional
        ? `Likely ${tier.name}`
        : `${tier.name} · Level ${formatLevelNumber(level)}`;
      const right = progress.next
        ? `${progress.next.name} ${progress.nextLevel?.toFixed(1)}`
        : "Top of the ladder";
      return { left, right };
    }
    if (mode === "span" && range && lo !== null && hi !== null) {
      if (range.min.id === range.max.id) {
        return { left: `${range.min.name} · ${lo.toFixed(1)}–${hi.toFixed(1)}`, right: "" };
      }
      return { left: `${range.min.name} ${lo.toFixed(1)}`, right: `${range.max.name} ${hi.toFixed(1)}` };
    }
    return { left: "Love", right: "Grand Slam" };
  })();

  const endsRow = (
    <div className="mt-1.5 flex items-baseline justify-between gap-3 text-xs">
      <span className="font-semibold text-white">{ends.left}</span>
      {ends.right && <span className="text-white/60">{ends.right}</span>}
    </div>
  );

  return (
    <div className={`min-w-0 ${className}`.trim()}>
      <div {...a11y} className={`relative ${headroom}`}>
        <div
          aria-hidden="true"
          className="flex items-end gap-1.5 forced-colors:border forced-colors:border-[color:CanvasText]"
        >
          {TIERS.map((t) => {
            const indices = LEVEL_STEPS.map((_, i) => i).filter(
              (i) => Math.min(7, Math.floor(LEVEL_STEPS[i])) === t.id
            );
            return (
              <div key={t.id} className="flex flex-1 items-end gap-[2px]">
                {indices.map((i) => (
                  <div
                    key={i}
                    className={`relative flex-1 rounded-[1px] ${RAIL_HEIGHT[size][t.id]} ${pipClass(t, i)}`}
                  >
                    {i === current && <Caret dashed={provisional} />}
                    {i === markerIndex && marker && (
                      <>
                        <Caret dashed={false} />
                        <span className="absolute -top-[26px] left-1/2 -translate-x-1/2 whitespace-nowrap text-xs font-semibold text-white">
                          {marker.label}
                        </span>
                      </>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
        {marker && markerTier && mode === "span" && (
          <span className="sr-only">
            {marker.label === "You" ? "Your tier" : `${marker.label}'s tier`}, {markerTier.name},{" "}
            {markerInRange ? "is in this range." : "is outside this range."}
          </span>
        )}
      </div>
      {labels === "ends" && endsRow}
      {labels === "all" && (
        <>
          <div className="md:hidden">{endsRow}</div>
          <div className="mt-1.5 hidden gap-1.5 text-center text-xs md:grid md:grid-cols-7">
            {TIERS.map((t) => (
              <span
                key={t.id}
                className={nameLit(t) ? "font-semibold text-white" : "text-white/55"}
              >
                {t.name}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Ladder ───────────────────────────────────────────────────────────────────

type NodeInfo = {
  tier: Tier;
  state: EmblemState;
  current: boolean;
  /** Reached, or inside the span: the connector towards the next node is lime when both are. */
  lit: boolean;
  suffix: string;
};

function ladderNodes(props: TierLineProps): NodeInfo[] {
  const mode = resolveMode(props);
  const level = levelNumber(props.level);
  const currentTier = mode === "position" ? tierForLevel(level) : null;
  const inSpan = mode === "span" && props.span ? tierIdsInRange(props.span.min, props.span.max) : [];
  return TIERS.map((tier) => {
    if (mode === "position" && currentTier) {
      if (tier.id < currentTier.id) return { tier, state: "earned", current: false, lit: true, suffix: " (reached)" };
      if (tier.id === currentTier.id) {
        return props.provisional
          ? { tier, state: "provisional", current: true, lit: true, suffix: " (likely tier, provisional)" }
          : { tier, state: "earned", current: true, lit: true, suffix: " (your tier)" };
      }
      return { tier, state: "future", current: false, lit: false, suffix: "" };
    }
    if (mode === "span") {
      const inside = inSpan.includes(tier.id);
      return inside
        ? { tier, state: "earned", current: false, lit: true, suffix: " (in this program)" }
        : { tier, state: "future", current: false, lit: false, suffix: "" };
    }
    return { tier, state: "earned", current: false, lit: true, suffix: "" };
  });
}

/** Node sizes as complete class literals: base + (id − 1) × 2, current +8. */
const NODE_DEFAULT: Record<TierId, string> = {
  1: "h-[32px] w-[32px]", 2: "h-[34px] w-[34px]", 3: "h-[36px] w-[36px]", 4: "h-[38px] w-[38px]",
  5: "h-[40px] w-[40px]", 6: "h-[42px] w-[42px]", 7: "h-[44px] w-[44px]",
};
const NODE_DEFAULT_CURRENT: Record<TierId, string> = {
  1: "h-[40px] w-[40px]", 2: "h-[42px] w-[42px]", 3: "h-[44px] w-[44px]", 4: "h-[46px] w-[46px]",
  5: "h-[48px] w-[48px]", 6: "h-[50px] w-[50px]", 7: "h-[52px] w-[52px]",
};
const NODE_COMPACT: Record<TierId, string> = {
  1: "h-[28px] w-[28px] md:h-[40px] md:w-[40px]", 2: "h-[30px] w-[30px] md:h-[42px] md:w-[42px]",
  3: "h-[32px] w-[32px] md:h-[44px] md:w-[44px]", 4: "h-[34px] w-[34px] md:h-[46px] md:w-[46px]",
  5: "h-[36px] w-[36px] md:h-[48px] md:w-[48px]", 6: "h-[38px] w-[38px] md:h-[50px] md:w-[50px]",
  7: "h-[40px] w-[40px] md:h-[52px] md:w-[52px]",
};
const NODE_COMPACT_CURRENT: Record<TierId, string> = {
  1: "h-[36px] w-[36px] md:h-[48px] md:w-[48px]", 2: "h-[38px] w-[38px] md:h-[50px] md:w-[50px]",
  3: "h-[40px] w-[40px] md:h-[52px] md:w-[52px]", 4: "h-[42px] w-[42px] md:h-[54px] md:w-[54px]",
  5: "h-[44px] w-[44px] md:h-[56px] md:w-[56px]", 6: "h-[46px] w-[46px] md:h-[58px] md:w-[58px]",
  7: "h-[48px] w-[48px] md:h-[60px] md:w-[60px]",
};

const LADDER_LABEL = "The seven tiers, Love (lowest) to Grand Slam (highest)";

function HorizontalLadder({
  nodes,
  compact,
  showBlurbs,
  level,
  className,
}: {
  nodes: NodeInfo[];
  compact: boolean;
  showBlurbs: boolean;
  level: number | null;
  className: string;
}) {
  const cell = compact ? "h-10 md:h-12" : "h-14";
  return (
    <ol aria-label={LADDER_LABEL} className={`grid grid-cols-7 gap-x-1 ${className}`.trim()}>
      {nodes.map((n, i) => {
        const prev = nodes[i - 1];
        const next = nodes[i + 1];
        const leftOn = prev ? prev.lit && n.lit : false;
        const rightOn = next ? next.lit && n.lit : false;
        const sizeClass = compact
          ? (n.current ? NODE_COMPACT_CURRENT : NODE_COMPACT)[n.tier.id]
          : (n.current ? NODE_DEFAULT_CURRENT : NODE_DEFAULT)[n.tier.id];
        return (
          <li
            key={n.tier.id}
            aria-current={n.current ? "step" : undefined}
            className="flex min-w-0 flex-col items-center text-center"
          >
            <div className={`relative flex w-full items-center justify-center ${cell}`}>
              {prev && (
                <span
                  aria-hidden="true"
                  className={`absolute left-0 right-1/2 top-1/2 h-0.5 -translate-y-1/2 ${leftOn ? LIME : CONNECTOR_OFF}`}
                />
              )}
              {next && (
                <span
                  aria-hidden="true"
                  className={`absolute left-1/2 right-0 top-1/2 h-0.5 -translate-y-1/2 ${rightOn ? LIME : CONNECTOR_OFF}`}
                />
              )}
              <span className={`relative block shrink-0 ${sizeClass}`}>
                <TierEmblem tier={n.tier.id} state={n.state} fluid decorative />
              </span>
            </div>
            <span className="mt-1.5 text-xs font-semibold leading-tight text-white sm:text-sm">
              {n.tier.name}
              <span className="sr-only">{n.suffix}</span>
            </span>
            {n.current && level !== null && n.state !== "provisional" ? (
              <span className="mt-0.5 text-xs font-medium tabular-nums text-[#B4E655]">
                Level {formatLevelNumber(level)}
              </span>
            ) : (
              <span className="mt-0.5 text-xs tabular-nums text-white/60">{n.tier.band}</span>
            )}
            {showBlurbs && (
              <span className="mt-1.5 text-pretty text-xs leading-snug text-white/60">{n.tier.blurb}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function VerticalLadder({
  nodes,
  compact,
  showBlurbs,
  level,
  className,
}: {
  nodes: NodeInfo[];
  compact: boolean;
  showBlurbs: boolean;
  level: number | null;
  className: string;
}) {
  const size = compact ? 32 : 40;
  return (
    <ol aria-label={LADDER_LABEL} className={`flex flex-col-reverse ${className}`.trim()}>
      {nodes.map((n, i) => {
        const prev = nodes[i - 1];
        const next = nodes[i + 1];
        // Visually the next tier sits above this row, the previous below.
        const upOn = next ? next.lit && n.lit : false;
        const downOn = prev ? prev.lit && n.lit : false;
        const px = n.current ? size + 8 : size;
        return (
          <li
            key={n.tier.id}
            aria-current={n.current ? "step" : undefined}
            className="grid min-h-[52px] grid-cols-[48px_1fr] items-center gap-4 py-2"
          >
            <div className="relative flex h-full min-h-[44px] items-center justify-center">
              {next && (
                <span
                  aria-hidden="true"
                  className={`absolute bottom-1/2 left-1/2 top-0 w-0.5 -translate-x-1/2 ${upOn ? LIME : CONNECTOR_OFF}`}
                />
              )}
              {prev && (
                <span
                  aria-hidden="true"
                  className={`absolute bottom-0 left-1/2 top-1/2 w-0.5 -translate-x-1/2 ${downOn ? LIME : CONNECTOR_OFF}`}
                />
              )}
              <TierEmblem tier={n.tier.id} state={n.state} size={px} decorative className="relative shrink-0" />
            </div>
            <div className="min-w-0">
              <p className="text-base font-semibold leading-snug text-white">
                {n.tier.name}
                <span className="sr-only">{n.suffix}</span>
                <span aria-hidden="true" className="text-white/60"> · </span>
                {n.current && level !== null && n.state !== "provisional" ? (
                  <span className="text-sm font-medium tabular-nums text-[#B4E655]">
                    Level {formatLevelNumber(level)}
                  </span>
                ) : (
                  <span className="text-sm font-normal tabular-nums text-white/60">{n.tier.band}</span>
                )}
              </p>
              {showBlurbs && <p className="mt-0.5 text-sm text-white/70">{n.tier.blurb}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Ladder(props: TierLineProps) {
  const { orientation = "horizontal", density = "default", showBlurbs = false, className = "" } = props;
  const nodes = ladderNodes(props);
  const compact = density === "compact";
  const level = resolveMode(props) === "position" ? levelNumber(props.level) : null;
  if (orientation === "horizontal") {
    return <HorizontalLadder nodes={nodes} compact={compact} showBlurbs={showBlurbs} level={level} className={className} />;
  }
  if (orientation === "vertical") {
    return <VerticalLadder nodes={nodes} compact={compact} showBlurbs={showBlurbs} level={level} className={className} />;
  }
  return (
    <>
      <VerticalLadder nodes={nodes} compact={compact} showBlurbs={showBlurbs} level={level} className={`md:hidden ${className}`} />
      <HorizontalLadder nodes={nodes} compact={compact} showBlurbs={showBlurbs} level={level} className={`hidden md:grid ${className}`} />
    </>
  );
}

export function TierLine(props: TierLineProps) {
  return props.variant === "ladder" ? <Ladder {...props} /> : <Rail {...props} />;
}
