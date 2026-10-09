// Cohort variants of a plate (design specs §4.5): deterministic, no new art.
//
// A program-level plate (cards, detail page) uses the base composition. A
// cohort's plate can differ in three ways, all derived from data the cohort
// already carries: the side of the court (hashed from the cohort id), the
// signature flight's profile (from the cohort's level band: the higher the
// tier, the flatter and deeper the ball) and, for Adult Bootcamps, which of
// the three flights is the lime one (the class the cohort trains in). Age is
// never encoded in the art.

import type { Cohort } from "@/types/cohort";
import type { Program } from "@/types/program";
import { tierForLevel, type TierId } from "@/lib/tiers";
import type { PlateSide, TraceSpec, Vec2 } from "./geometry";
import { type PlateId, type PlateSpec, plateSpec } from "./specs";

export type { PlateSide };

export type PlateVariant = {
  side: PlateSide;
  /** The tier the signature flight is profiled for; null without a band. */
  profileTier: TierId | null;
  /** Adult Bootcamps only: the index of the lime flight (0 newer, 1 intermediate, 2 advanced). */
  emphasis: number | null;
};

/** 32-bit FNV-1a, so the same cohort id always lands on the same side. */
export function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export type PlateVariantInput = {
  plate: PlateId | string;
  levelMin?: number | string | null;
  levelMax?: number | string | null;
  /** Usually the cohort id. */
  seed?: string | null;
  focusSlot?: number | null;
};

export function plateVariant(input: PlateVariantInput): PlateVariant {
  const side: PlateSide = input.seed ? (fnv1a32(input.seed) % 2 ? "ad" : "deuce") : "deuce";
  const hasBand =
    (input.levelMin !== null && input.levelMin !== undefined && input.levelMin !== "") ||
    (input.levelMax !== null && input.levelMax !== undefined && input.levelMax !== "");
  const profileTier = hasBand ? tierForLevel(input.levelMin ?? input.levelMax)?.id ?? null : null;
  let emphasis: number | null = null;
  if (input.plate === "bootcamps") {
    if (typeof input.focusSlot === "number" && input.focusSlot >= 0 && input.focusSlot <= 2) {
      emphasis = input.focusSlot;
    } else if (profileTier !== null) {
      emphasis = profileTier <= 2 ? 0 : profileTier === 3 ? 1 : 2;
    }
  }
  return { side, profileTier, emphasis };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerp2 = (a: Vec2, b: Vec2, t: number): Vec2 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Youth and fallback: the signature lands deeper and flies flatter as the tier rises. */
const YOUTH_LANDING_LOW: Vec2 = [7.4, 2.0];
const YOUTH_LANDING_HIGH: Vec2 = [10.9, 3.4];
const YOUTH_ECHO_OFFSETS: readonly { shift: Vec2; apex: number }[] = [
  { shift: [-2.2, -1.6], apex: -0.4 },
  { shift: [-1.0, -0.7], apex: -0.2 },
];

/**
 * The composition a cohort's plate draws: the base spec with the profile and
 * the emphasis applied. The side is a projection option, not a data change,
 * so it is left to the renderer.
 */
export function resolvePlateSpec(id: PlateId | string, variant: PlateVariant): PlateSpec {
  const base = plateSpec(id);
  const p = variant.profileTier === null ? null : (variant.profileTier - 1) / 6;

  if ((base.id === "youth-programs" || base.id === "court") && p !== null) {
    const landing = lerp2(YOUTH_LANDING_LOW, YOUTH_LANDING_HIGH, p);
    const apex = lerp(3.4, 1.8, p);
    let echo = 0;
    const traces = base.traces.map((t): TraceSpec => {
      if (t.role === "signature") return { ...t, to: landing, apex };
      if (t.role === "echo") {
        const o = YOUTH_ECHO_OFFSETS[Math.min(echo++, YOUTH_ECHO_OFFSETS.length - 1)];
        return { ...t, to: [landing[0] + o.shift[0], landing[1] + o.shift[1]], apex: apex + o.apex };
      }
      return t;
    });
    return { ...base, traces };
  }

  if (base.id === "high-performance" && variant.profileTier !== null) {
    const apex = lerp(2.2, 1.5, clamp01((variant.profileTier - 4) / 3));
    return {
      ...base,
      traces: base.traces.map((t) => (t.role === "signature" ? { ...t, apex } : t)),
    };
  }

  if (base.id === "bootcamps" && variant.emphasis !== null) {
    const focus = variant.emphasis;
    // The others step down to @0.40 (the nearer class) and @0.20 (the farther).
    const others = base.traces
      .map((_, i) => i)
      .filter((i) => i !== focus)
      .sort((a, b) => Math.abs(a - focus) - Math.abs(b - focus));
    const traces = base.traces.map((t, i): TraceSpec => {
      if (i === focus) {
        return { role: "signature", from: t.from, to: t.to, apex: t.apex, kick: t.kick, ring: true };
      }
      const rank = others.indexOf(i);
      return {
        role: "support",
        from: t.from,
        to: t.to,
        apex: t.apex,
        kick: t.kick,
        color: "white",
        opacity: rank === 0 ? 0.4 : 0.2,
      };
    });
    return { ...base, traces };
  }

  return base;
}

/** "16:00" → "4:00": the class start as the timetable states it, no suffix. */
function twelveHour(start: string): string {
  const [h, m] = start.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return start;
  return `${h % 12 || 12}:${String(m).padStart(2, "0")}`;
}

/**
 * Which Adult Bootcamps class a cohort trains in, as the index into the
 * program's timetable (Sun 16:00, 17:00 and 18:00 give 0, 1 and 2), or null
 * when nothing matches or the plate is not bootcamps.
 */
export function artFocusForCohort(program: Program, cohort: Pick<Cohort, "sessions">): number | null {
  if (program.plate !== "bootcamps") return null;
  const session = cohort.sessions[0];
  if (!session) return null;
  const start = twelveHour(session.start);
  const index = (program.timetable ?? []).findIndex(
    (slot) => slot.day.slice(0, 3) === session.day && slot.time.split("–")[0] === start
  );
  return index === -1 ? null : index;
}
