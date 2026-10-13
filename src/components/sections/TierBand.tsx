import Link from "next/link";
import { TierLine } from "@/components/tiers";
import { TEXT_LINK_LIME } from "@/components/ui/TextLink";
import { TIERS, TIER_COUNT_WORD, TOP_TIER } from "@/lib/tiers";

/** "Five" — the tier count, capitalised for the heading. */
const COUNT = TIER_COUNT_WORD.charAt(0).toUpperCase() + TIER_COUNT_WORD.slice(1);

/**
 * The home tier band (audit M36, design specs §3.7): the five tiers, named
 * and drawn. A compact secondary section under the programs and the location
 * (owner, 2026-10-13: programs come first, never the tier list), so it sets
 * no padding, border or max-width of its own: the page's Container and rhythm
 * do (audit H2). No new button: the one link goes to the ladder on /assessment.
 */
export function TierBand() {
  return (
    <section aria-labelledby="tier-band-title">
      {/* Two columns only from lg: at md the 7fr column would be ~390px, under the ladder's 480px floor (specs §3.3). */}
      <div className="lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-center lg:gap-12">
        <div className="max-w-xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#B4E655]">
            Levels
          </p>
          <h2
            id="tier-band-title"
            className="mt-3 text-2xl font-semibold tracking-tight text-white md:text-3xl"
          >
            {/* The name never breaks inside "High Performance": on a phone the
                line wraps before it instead, so the span reads "Beginner to /
                High Performance." and nothing clips. */}
            {COUNT} tiers. {TIERS[0].name} to <span className="whitespace-nowrap">{TOP_TIER.name}.</span>
          </h2>
          <p className="mt-3 text-pretty text-base text-white/75">
            Every player trains at a tier. Our coaches place you from your
            quiz answers, or on court if you book the optional 20-minute
            assessment.
          </p>
          <Link href="/assessment#ladder" className={`mt-2 ${TEXT_LINK_LIME}`}>
            How tiers work →
          </Link>
        </div>
        <div className="mt-8 min-w-0 lg:mt-0">
          {/* Vertical on phones: "High Performance" and "Intermediate" do not fit five ~65px columns (specs §3.3). */}
          <TierLine variant="ladder" orientation="responsive" density="compact" />
        </div>
      </div>
    </section>
  );
}
