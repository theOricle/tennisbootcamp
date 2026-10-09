// Tier style tokens (audit H6, design specs §2.2 and §3.2) — pure TS, no JSX.
//
// Every Tailwind class here is a complete literal, never interpolated, so the
// JIT keeps it (tailwind.config scans src/**/*.ts). The hex inside each class
// must equal TIERS[id].color; test-tiers.ts asserts it. Tier colours are for
// graphics only — pips, emblems, connectors, the RankCard rule — never text.

import { TIERS, tierForLevel, type TierId } from "@/lib/tiers";

/** A lit pip in the tier's colour. */
export const TIER_PIP: Record<TierId, string> = {
  1: "bg-[#7D8CA3]",
  2: "bg-[#AEBBCD]",
  3: "bg-[#8CC63F]",
  4: "bg-[#B4E655]",
  5: "bg-[#D2F28A]",
  6: "bg-[#E6EBF0]",
  7: "bg-[#E3C46F]",
};

/** A provisional pip: the tier's colour as an outline, nothing filled. */
export const TIER_PIP_OUTLINE: Record<TierId, string> = {
  1: "border border-[#7D8CA3] bg-transparent",
  2: "border border-[#AEBBCD] bg-transparent",
  3: "border border-[#8CC63F] bg-transparent",
  4: "border border-[#B4E655] bg-transparent",
  5: "border border-[#D2F28A] bg-transparent",
  6: "border border-[#E6EBF0] bg-transparent",
  7: "border border-[#E3C46F] bg-transparent",
};

/** The RankCard's top rule — the one block of tier colour on a card. */
export const TIER_RULE: Record<TierId, string> = {
  1: "border-t-2 border-t-[#7D8CA3]",
  2: "border-t-2 border-t-[#AEBBCD]",
  3: "border-t-2 border-t-[#8CC63F]",
  4: "border-t-2 border-t-[#B4E655]",
  5: "border-t-2 border-t-[#D2F28A]",
  6: "border-t-2 border-t-[#E6EBF0]",
  7: "border-t-2 border-t-[#E3C46F]",
};

/** An unlit pip: a rung above the player, or outside a span. */
export const PIP_UNLIT = "bg-white/[0.10]";

/** Future-state emblem ink (white/40 on navy, flattened). Graphics only. */
export const FUTURE_INK = "#6A727D";

/** The navy field. */
export const NAVY = "#061427";

/** Emblem field tints per hue family. */
export const FIELD_TINT = {
  empty: NAVY,
  lime: "#1E312D",
  platinum: "#253243",
  gold: "#E3C46F",
} as const;

/**
 * How the emblem frame escalates up the ladder (design specs §3.2). Every
 * adjacent pair differs in at least one feature, so the rank reads without
 * colour (test-tiers.ts pins the neighbour rule).
 */
export type TierFrame = {
  /** Outer ring stroke weight. */
  ring: 2 | 2.5 | 3;
  /** Six vertex studs. */
  studs: boolean;
  /** The inner ring: faint white, the tier colour at 1.5, or a navy hairline. */
  inner: "faint" | "tier" | "navy";
  /** Notched corners (the outer polygon is NOTCHED_HEX). */
  notched: boolean;
  /** A 1.5 bevel ring outside the outer ring. */
  bevel: boolean;
  /** The field fill. */
  field: keyof typeof FIELD_TINT;
  /** Motif ink: the tier colour, or navy on the solid gold field. */
  ink: "tier" | "navy";
  /** Hue family, for documentation and the gallery. */
  hue: "chalk" | "lime" | "platinum" | "gold";
};

export const TIER_FRAME: Record<TierId, TierFrame> = {
  1: { ring: 2, studs: false, inner: "faint", notched: false, bevel: false, field: "empty", ink: "tier", hue: "chalk" },
  2: { ring: 2.5, studs: true, inner: "faint", notched: false, bevel: false, field: "empty", ink: "tier", hue: "chalk" },
  3: { ring: 2.5, studs: true, inner: "faint", notched: false, bevel: false, field: "lime", ink: "tier", hue: "lime" },
  4: { ring: 2.5, studs: true, inner: "tier", notched: false, bevel: false, field: "lime", ink: "tier", hue: "lime" },
  5: { ring: 3, studs: false, inner: "tier", notched: true, bevel: false, field: "lime", ink: "tier", hue: "lime" },
  6: { ring: 3, studs: false, inner: "tier", notched: true, bevel: true, field: "platinum", ink: "tier", hue: "platinum" },
  7: { ring: 3, studs: false, inner: "navy", notched: true, bevel: true, field: "gold", ink: "navy", hue: "gold" },
};

/** The frame features that tell neighbours apart, as a comparable record. */
export function frameFeatures(id: TierId): Record<string, string | number | boolean> {
  const f = TIER_FRAME[id];
  return {
    ring: f.ring,
    studs: f.studs,
    inner: f.inner,
    notched: f.notched,
    bevel: f.bevel,
    field: f.field,
  };
}

export type TierStyle = {
  id: TierId;
  frame: TierFrame;
  hex: string;
  pip: string;
  pipOutline: string;
  rule: string;
};

/** Every style token for a level or tier id, or null when unranked. */
export function tierStyle(
  levelOrId: number | string | null | undefined
): TierStyle | null {
  const tier = tierForLevel(levelOrId);
  if (!tier) return null;
  return {
    id: tier.id,
    frame: TIER_FRAME[tier.id],
    hex: TIERS[tier.id - 1].color,
    pip: TIER_PIP[tier.id],
    pipOutline: TIER_PIP_OUTLINE[tier.id],
    rule: TIER_RULE[tier.id],
  };
}
