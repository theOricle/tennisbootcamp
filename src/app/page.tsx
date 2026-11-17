import type { Metadata } from "next";
import { JsonLd } from "@/components/JsonLd";
import { organizationJsonLd } from "@/lib/structuredData";
import { Hero } from "@/components/sections/Hero";
import { BootcampClass } from "@/components/sections/BootcampClass";
import { ProgramsGrid } from "@/components/sections/ProgramsGrid";
import { HowJoiningWorks } from "@/components/sections/HowJoiningWorks";
import { WhereAndWho } from "@/components/sections/WhereAndWho";
import { EventsList } from "@/components/sections/EventsList";
import { JoinClosing } from "@/components/sections/JoinClosing";
import { Container } from "@/components/layout/Container";

import { listedPrograms } from "@/content/programs";
import { events } from "@/content/events";
import { SITE_DESCRIPTION } from "@/content/site";

// Incremental static regeneration (audit M39), at the catalog's cadence: the
// admin's cohort actions revalidate this page with /programs
// (src/lib/cohortRevalidate.ts), so a line that reads a cohort can return
// here without a second setting.
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

      {/* What every class is, straight under the hero (owner, 2026-11-17):
          tennis and fitness, how a class runs, how many players a group
          takes. A full-bleed band; it carries its own Container. */}
      <BootcampClass />

      {/* One Container, one rhythm (audit H2). The three programs as compact
          photo cards with the five levels as a strip under them (owner,
          2026-10-13: "people want to see the programs first"); how joining
          works, three steps; where we train and who coaches, two plain
          columns; then the closing, on the main action (audit M13). The
          newsletter is the line at the top of the footer, on every page. */}
      <Container className="space-y-10 pb-24 pt-10 md:space-y-[72px] md:pb-20 md:pt-14">
        <ProgramsGrid programs={listedPrograms} />
        <HowJoiningWorks />
        <WhereAndWho />
        {hasRealEvents && <EventsList events={events} title="Upcoming Events" />}
        <JoinClosing source="home-closing" />
      </Container>
    </main>
  );
}
