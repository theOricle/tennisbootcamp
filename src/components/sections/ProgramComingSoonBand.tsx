import Link from "next/link";
import type { Program } from "@/types/program";
import { ageBandsLabel } from "@/lib/ageBand";
import { programEyebrow, programLevelRange } from "@/lib/programCatalog";
import { formatTierSpan } from "@/lib/tiers";
import { ProgramPlate } from "@/components/plates/ProgramPlate";
import { TierLine } from "@/components/tiers";
import { CHIP_COMING_SOON, CtaLine, EYEBROW_CLASS, STRETCHED_LINK } from "./ProgramCard";

/**
 * A coming-soon program on /programs (design specs §5.5): not a grid card
 * pretending to be enrollable, but a dashed band with the dashed plate as a
 * thumbnail, the eyebrow and chip, the title as the one stretched link, one
 * meta line (who, when, price) and the tier span when the program has one.
 * The same one-link, one-tab-stop rule as the card.
 */
export function ProgramComingSoonBand({ program: p }: { program: Program }) {
  const range = programLevelRange(p);
  const meta = [ageBandsLabel(p.ageBands), p.schedule, p.priceSummary].filter(Boolean).join(" · ");

  return (
    <article
      className={
        "group relative rounded-2xl border border-dashed border-white/20 p-5 md:flex md:items-center md:gap-6 " +
        "motion-safe:transition-colors motion-safe:duration-150 hover:border-white/35 " +
        "has-[a:focus-visible]:border-white/35 has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-[#B4E655]/50 " +
        "has-[a:focus-visible]:ring-offset-2 has-[a:focus-visible]:ring-offset-[#061427]"
      }
    >
      {/* The thumbnail box is not positioned, so the stretched link measures from the article. */}
      <div className="w-full overflow-hidden rounded-xl bg-[#061427] md:w-48 md:shrink-0">
        <div className="aspect-[2/1] w-full">
          <ProgramPlate plate={p.plate} frame="band" density="compact" comingSoon={p.comingSoon} interactive />
        </div>
      </div>

      <div className="mt-4 min-w-0 flex-1 md:mt-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <p className={EYEBROW_CLASS}>{programEyebrow(p)}</p>
          <span className={CHIP_COMING_SOON}>Coming Soon</span>
        </div>
        <h3 className="mt-2 text-lg font-semibold tracking-tight text-white">
          <Link href={p.ctaHref} className={STRETCHED_LINK}>
            {p.title}
          </Link>
        </h3>
        {meta && <p className="mt-1 text-sm text-white/75">{meta}</p>}
      </div>

      <div className="mt-4 md:mt-0 md:w-44 md:shrink-0">
        {range && (
          <>
            <p className="text-sm font-semibold text-white">{formatTierSpan(range.min, range.max)}</p>
            <TierLine variant="rail" size="sm" span={range} labels="none" className="mt-2" />
          </>
        )}
        <CtaLine text={p.ctaText} className={range ? "mt-3" : ""} />
      </div>
    </article>
  );
}
