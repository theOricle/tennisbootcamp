import type { Metadata } from "next";
import { JsonLd } from "@/components/JsonLd";
import { organizationJsonLd } from "@/lib/structuredData";
import { Hero } from "@/components/sections/Hero";
import { TrustBar } from "@/components/sections/TrustBar";
import { TierBand } from "@/components/sections/TierBand";
import { EmailCapture } from "@/components/sections/EmailCapture";
import { ProgramsGrid } from "@/components/sections/ProgramsGrid";
import { Coaches } from "@/components/sections/Coaches";
import { EventsList } from "@/components/sections/EventsList";
import { QuizBand } from "@/components/sections/QuizBand";
import { PageStack } from "@/components/layout/PageStack";

import { programs } from "@/content/programs";
import { coaches } from "@/content/coaches";
import { events } from "@/content/events";
import { SITE_DESCRIPTION } from "@/content/site";

// Incremental static regeneration (audit M39): the program grid's "next
// cohort" line is rebuilt at most once a minute, and at once when an admin
// changes a cohort (src/lib/cohortRevalidate.ts), instead of being frozen at
// build time.
export const revalidate = 60;

export const metadata: Metadata = {
  title: { absolute: "Tennis Bootcamp — Where Athletes Evolve!" },
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/" },
};

export default function HomePage() {
  // No section for events that don't exist yet (audit M6): it returns with
  // the first real entry in src/content/events.ts.
  const hasRealEvents = events.some((e) => !e.placeholder);

  return (
    <main className="min-h-screen bg-[#061427] text-white">
      <JsonLd data={organizationJsonLd()} />
      <Hero />

      <TrustBar />

      {/* The seven tiers, where a visitor first weighs up the level system
          (audit M36, H6). */}
      <TierBand />

      {/* One Container, one rhythm (audit H2). Programs come first; the page
          closes on the quiz, then the newsletter, the tertiary CTA (M12, M13). */}
      <PageStack>
        <ProgramsGrid programs={programs.slice(0, 3)} title="Our Programs" />
        <Coaches coaches={coaches} />
        {hasRealEvents && <EventsList events={events} title="Upcoming Events" />}
        <QuizBand source="home-closing" />
        <EmailCapture source="homepage_email_capture" />
      </PageStack>
    </main>
  );
}
