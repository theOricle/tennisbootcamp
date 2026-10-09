// The tier QA gallery (design specs §3.7): every emblem in every state and
// size, the rail and the ladder in every mode, and the RankCard fixtures, so
// the whole system can be checked on one page. Behind the admin gate in
// page.tsx; no data, no DB.

import { TIERS, TIER_COUNT } from "@/lib/tiers";
import { TIER_FRAME } from "@/lib/tierStyle";
import {
  RankCard,
  TierChip,
  TierEmblem,
  TierLine,
  TierRangeBadges,
  UnrankedTag,
  type EmblemState,
  type RankCardPlayer,
} from "@/components/tiers";

const STATES: EmblemState[] = ["earned", "future", "provisional", "ghost"];
const SIZES = [20, 28, 40, 56, 64, 80, 128];

const H2 = "text-xl font-semibold tracking-tight text-white";
const H3 = "text-xs font-semibold uppercase tracking-[0.12em] text-white/60";
const CARD = "rounded-2xl border border-white/10 bg-white/[0.03] p-5";

function fixture(
  overrides: Partial<RankCardPlayer> & { id: string }
): RankCardPlayer {
  return {
    full_name: "Maya Chen",
    relationship: "self",
    is_minor: false,
    level: 2.5,
    level_assessed_at: "2026-10-04T15:00:00.000Z",
    level_notes: "Solid forehand. Work on the second serve and recovery after wide balls.",
    ...overrides,
  };
}

export function TierGallery() {
  return (
    <div className="space-y-14">
      {/* ── Emblems ──────────────────────────────────────────────────────── */}
      <section className="space-y-6">
        <h2 className={H2}>Emblems</h2>
        <p className="text-sm text-white/70">
          Seven tiers × four states. The frame escalates (ring, studs, inner
          ring, notched corners, bevel, field); below 28px only the mark
          renders.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-white/70">
            <thead>
              <tr>
                <th className="pb-3 pr-4 font-semibold text-white/60">Tier</th>
                {STATES.map((s) => (
                  <th key={s} className="pb-3 pr-4 font-semibold capitalize text-white/60">
                    {s}
                  </th>
                ))}
                <th className="pb-3 font-semibold text-white/60">Frame</th>
              </tr>
            </thead>
            <tbody>
              {TIERS.map((t) => {
                const f = TIER_FRAME[t.id];
                return (
                  <tr key={t.id} className="border-t border-white/10">
                    <td className="py-3 pr-4 align-middle">
                      <span className="block text-sm font-semibold text-white">{t.name}</span>
                      <span className="block tabular-nums">{t.band}</span>
                      <span className="block font-mono text-white/60">{t.color}</span>
                    </td>
                    {STATES.map((s) => (
                      <td key={s} className="py-3 pr-4 align-middle">
                        <TierEmblem tier={s === "ghost" ? null : t.id} state={s} size={64} />
                      </td>
                    ))}
                    <td className="py-3 align-middle text-white/60">
                      ring {f.ring}
                      {f.studs ? " · studs" : ""}
                      {` · inner ${f.inner}`}
                      {f.notched ? " · notched" : ""}
                      {f.bevel ? " · bevel" : ""}
                      {` · ${f.field} field`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div>
          <h3 className={H3}>Sizes (Deuce)</h3>
          <div className="mt-3 flex flex-wrap items-end gap-5">
            {SIZES.map((px) => (
              <div key={px} className="flex flex-col items-center gap-1.5">
                <TierEmblem tier={3} size={px} decorative />
                <span className="text-xs tabular-nums text-white/60">{px}px</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h3 className={H3}>Marks (20px) beside the name</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {TIERS.map((t) => (
              <TierChip key={t.id} level={t.id} showLevel />
            ))}
            <TierChip level={2} provisional />
            <UnrankedTag />
          </div>
        </div>
      </section>

      {/* ── Rail ─────────────────────────────────────────────────────────── */}
      <section className="space-y-6">
        <h2 className={H2}>Rail</h2>
        <div className="grid gap-5 md:grid-cols-2">
          <div className={CARD}>
            <h3 className={H3}>Position · md · labels all</h3>
            <TierLine variant="rail" size="md" level={2.5} labels="all" className="mt-4" />
          </div>
          <div className={CARD}>
            <h3 className={H3}>Position · md · ends · 7.0</h3>
            <TierLine variant="rail" size="md" level={7} labels="ends" className="mt-4" />
          </div>
          <div className={CARD}>
            <h3 className={H3}>Provisional · md · ends</h3>
            <TierLine variant="rail" size="md" level={2} provisional labels="ends" className="mt-4" />
          </div>
          <div className={CARD}>
            <h3 className={H3}>Span · sm · ends · 3.0–4.5</h3>
            <TierLine variant="rail" size="sm" span={{ min: 3, max: 4.5 }} labels="ends" className="mt-4" />
          </div>
          <div className={CARD}>
            <h3 className={H3}>Span with marker · md · 1.0–5.5, Maya at 2.5</h3>
            <TierLine
              variant="rail"
              size="md"
              span={{ min: 1, max: 5.5 }}
              marker={{ level: 2.5, label: "Maya" }}
              labels="all"
              className="mt-4"
            />
          </div>
          <div className={CARD}>
            <h3 className={H3}>Span with marker outside · sm · 3.0–3.5, You at 5.0</h3>
            <TierLine
              variant="rail"
              size="sm"
              span={{ min: 3, max: 3.5 }}
              marker={{ level: 5, label: "You" }}
              labels="ends"
              className="mt-4"
            />
          </div>
          <div className={CARD}>
            <h3 className={H3}>Ghost · sm · ends</h3>
            <TierLine variant="rail" size="sm" labels="ends" className="mt-4" />
          </div>
          <div className={CARD}>
            <h3 className={H3}>Ghost · xs · no labels (admin rows)</h3>
            <TierLine variant="rail" size="xs" className="mt-4" />
            <TierLine variant="rail" size="xs" span={{ min: 1, max: 7 }} className="mt-3" />
          </div>
        </div>
        <div className={`${CARD} max-w-[272px]`}>
          <h3 className={H3}>At 272px (never scrolls)</h3>
          <TierLine variant="rail" size="md" level={4} labels="ends" className="mt-4" />
        </div>
      </section>

      {/* ── Ladder ───────────────────────────────────────────────────────── */}
      <section className="space-y-6">
        <h2 className={H2}>Ladder</h2>
        <div className={CARD}>
          <h3 className={H3}>Showcase · horizontal</h3>
          <TierLine variant="ladder" orientation="horizontal" className="mt-4" />
        </div>
        <div className={CARD}>
          <h3 className={H3}>Showcase · horizontal · compact · blurbs</h3>
          <TierLine variant="ladder" orientation="horizontal" density="compact" showBlurbs className="mt-4" />
        </div>
        <div className={CARD}>
          <h3 className={H3}>Position 2.5 · horizontal</h3>
          <TierLine variant="ladder" orientation="horizontal" level={2.5} className="mt-4" />
        </div>
        <div className={CARD}>
          <h3 className={H3}>Provisional Rally · horizontal · compact</h3>
          <TierLine variant="ladder" orientation="horizontal" density="compact" level={2} provisional className="mt-4" />
        </div>
        <div className={CARD}>
          <h3 className={H3}>Span 3.0–7.0 · horizontal</h3>
          <TierLine variant="ladder" orientation="horizontal" span={{ min: 3, max: 7 }} className="mt-4" />
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          <div className={CARD}>
            <h3 className={H3}>Showcase · vertical · blurbs</h3>
            <TierLine variant="ladder" orientation="vertical" showBlurbs className="mt-4" />
          </div>
          <div className={CARD}>
            <h3 className={H3}>Position 4.0 · vertical · compact</h3>
            <TierLine variant="ladder" orientation="vertical" density="compact" level={4} className="mt-4" />
          </div>
        </div>
      </section>

      {/* ── Chips ────────────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className={H2}>Range chips</h2>
        <div className="flex flex-wrap gap-2">
          <TierRangeBadges levelMin={3} levelMax={3.5} />
          <TierRangeBadges levelMin={1} levelMax={2.5} />
          <TierRangeBadges levelMin={4} levelMax={7} />
          <TierRangeBadges levelMin={1} levelMax={7} />
          <TierRangeBadges levelMin={null} levelMax={null} />
        </div>
      </section>

      {/* ── RankCard ─────────────────────────────────────────────────────── */}
      <section className="space-y-6">
        <h2 className={H2}>RankCard</h2>
        <RankCard player={fixture({ id: "wide" })} layout="wide" isSelf />
        <div className="grid gap-5 md:grid-cols-2">
          <RankCard player={fixture({ id: "c1", level: 2.5 })} layout="compact" isSelf showNote />
          <RankCard
            player={fixture({ id: "c2", full_name: "Leo Chen", relationship: "child", is_minor: true, level: 4 })}
            layout="compact"
            isSelf={false}
          />
          <RankCard player={fixture({ id: "c3", level: 7, level_assessed_at: null })} layout="compact" isSelf />
          <RankCard player={fixture({ id: "u1", level: null, level_assessed_at: null })} layout="compact" isSelf />
          <RankCard
            player={fixture({ id: "u2", full_name: "Leo Chen", relationship: "child", is_minor: true, level: null, level_assessed_at: null })}
            layout="compact"
            isSelf={false}
          />
          <RankCard
            player={fixture({ id: "u3", level: null, level_assessed_at: null })}
            layout="compact"
            isSelf
            assessmentLink
          />
          <RankCard
            player={fixture({ id: "p1", level: null, level_assessed_at: null })}
            layout="compact"
            isSelf
            placedSpan={{ min: 3, max: 3.5 }}
          />
        </div>
      </section>

      <p className="text-xs text-white/60">
        {TIER_COUNT} tiers · colours from src/lib/tiers.ts · class literals from src/lib/tierStyle.ts
      </p>
    </div>
  );
}
