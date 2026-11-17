import Link from "next/link";
import { LevelTag } from "@/components/tiers";
import { TEXT_LINK_LIME } from "@/components/ui/TextLink";
import { TIERS, TIER_COUNT_WORD } from "@/lib/tiers";

/** "Five": the tier count, capitalised to open the line. */
const COUNT = TIER_COUNT_WORD.charAt(0).toUpperCase() + TIER_COUNT_WORD.slice(1);

/**
 * The five levels as one slim strip (owner-approved design, 2026-11-17):
 * under the program cards on the home page, and under the filters on
 * /programs. One line, the five level tags low to high with their marks
 * (the names and the count come from src/lib/tiers.ts, never typed here),
 * hairlines joining them from md, and one link to the ladder on /assessment.
 * The tags name tiers, not groups: "High Performance" here is the top level.
 * It sets no gutter or page width; the page's Container does (audit H2).
 */
export function LevelsStrip({ className = "" }: { className?: string }) {
  const last = TIERS.length - 1;
  return (
    <div
      className={`grid gap-2.5 rounded-2xl border border-white/10 bg-white/[0.03] px-4 pb-0.5 pt-3.5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-x-6 md:gap-y-1 md:px-6 md:pb-5 md:pt-3 ${className}`.trim()}
    >
      <p className="text-[15px] text-white/75 md:text-base">
        <b className="font-semibold text-white">{COUNT} levels.</b> Each group trains at one.
      </p>
      <ul
        role="list"
        className="flex flex-wrap items-center gap-x-4 gap-y-2 md:col-span-2 md:row-start-2 md:flex-nowrap md:gap-0"
      >
        {TIERS.map((tier, i) => (
          // Every item but the last carries the hairline to the next one;
          // the items share the row's spare width, so the lines are equal.
          <li key={tier.id} className={`flex items-center ${i < last ? "md:flex-auto" : ""}`.trim()}>
            <LevelTag level={tier.id} plain className="whitespace-nowrap md:text-sm" />
            {i < last && (
              <span aria-hidden="true" className="mx-3.5 hidden h-px min-w-3 flex-1 bg-white/[0.18] md:block" />
            )}
          </li>
        ))}
      </ul>
      <Link
        href="/assessment#ladder"
        className={`${TEXT_LINK_LIME} justify-self-start whitespace-nowrap md:col-start-2 md:row-start-1 md:justify-self-end`}
      >
        How levels work
        <span aria-hidden="true" className="ml-1">
          →
        </span>
      </Link>
    </div>
  );
}
