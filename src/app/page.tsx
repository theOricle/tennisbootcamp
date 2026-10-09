import type { Metadata } from "next";
import { JsonLd } from "@/components/JsonLd";
import { organizationJsonLd } from "@/lib/structuredData";
import { Hero } from "@/components/sections/Hero";
import { TrustBar } from "@/components/sections/TrustBar";
import { EmailCapture } from "@/components/sections/EmailCapture";
import { ProgramsGrid } from "@/components/sections/ProgramsGrid";
import { Coaches } from "@/components/sections/Coaches";
import { EventsList } from "@/components/sections/EventsList";
import { PageStack } from "@/components/layout/PageStack";

import { programs } from "@/content/programs";
import { coaches } from "@/content/coaches";
import { events } from "@/content/events";
import { SITE_DESCRIPTION } from "@/content/site";

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

      <section className="mx-auto max-w-6xl px-6">
        <EmailCapture />
      </section>

      <PageStack>
        <ProgramsGrid programs={programs.slice(0, 3)} title="Our Programs" />
        <Coaches coaches={coaches} />
        {hasRealEvents && <EventsList events={events} title="Upcoming Events" />}
      </PageStack>
    </main>
  );
}
