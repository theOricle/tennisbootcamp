import Link from "next/link";
import { Container } from "@/components/layout/Container";
import { TierLine } from "@/components/tiers";
import { TEXT_LINK_LIME } from "@/components/ui/TextLink";

/**
 * The home tier band (audit M36, design specs §3.7): the seven tiers, named
 * and drawn, where a visitor first decides whether this is for them. A
 * full-bleed band after the TrustBar with a Container inside (audit H2). No
 * new button: the one link goes to the ladder on /assessment.
 */
export function TierBand() {
  return (
    <section aria-labelledby="tier-band-title" className="border-b border-white/10">
      <Container className="py-12 md:py-16">
        <div className="md:grid md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:items-center md:gap-12">
          <div className="max-w-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#B4E655]">
              Levels
            </p>
            <h2
              id="tier-band-title"
              className="mt-3 text-2xl font-semibold tracking-tight text-white md:text-3xl"
            >
              Seven tiers. Love to Grand Slam.
            </h2>
            <p className="mt-3 text-pretty text-base text-white/75">
              Every player trains at a tier. Sina places you from your quiz
              answers, or on court if you book the optional 20-minute
              assessment.
            </p>
            <Link href="/assessment#ladder" className={`mt-2 ${TEXT_LINK_LIME}`}>
              How tiers work →
            </Link>
          </div>
          <div className="mt-8 min-w-0 md:mt-0">
            <TierLine variant="ladder" orientation="horizontal" density="compact" />
          </div>
        </div>
      </Container>
    </section>
  );
}
