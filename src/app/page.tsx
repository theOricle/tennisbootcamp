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

export const metadata: Metadata = {
  title: { absolute: "Tennis Bootcamp — Where Athletes Evolve!" },
  description:
    "Weekend group tennis classes in Toronto for juniors, teens and adults. Take the 2-minute quiz and Sina places you in a group; the 20-minute assessment is optional.",
  alternates: { canonical: "/" },
};

export default function HomePage() {
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
        <Coaches coaches={coaches} title="Meet the Coaches" />
        <EventsList events={events} title="Upcoming Events" />
      </PageStack>
    </main>
  );
}
