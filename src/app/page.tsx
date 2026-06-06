import type { Metadata } from "next";
import { Hero } from "@/components/sections/Hero";
import { TrustBar } from "@/components/sections/TrustBar";
import { EmailCapture } from "@/components/sections/EmailCapture";
import { ProgramsGrid } from "@/components/sections/ProgramsGrid";
import { Coaches } from "@/components/sections/Coaches";
import { EventsList } from "@/components/sections/EventsList";
import { LocationsGrid } from "@/components/sections/LocationsGrid";

import { programs } from "@/content/programs";
import { coaches } from "@/content/coaches";
import { events } from "@/content/events";
import { locations } from "@/content/locations";




import { Testimonials } from "@/components/sections/Testimonials";
import { PageStack } from "@/components/layout/PageStack";

export const metadata: Metadata = {
  title: { absolute: "Tennis Bootcamp — Where Athletes Evolve!" },
  description:
    "Elite tennis coaching for competitive players in Toronto. Complete our intake form to secure priority placement in our next program.",
};

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#061427] text-white">
      <Hero />

      <TrustBar />

      <Testimonials />

      <section className="mx-auto max-w-6xl px-6 -mt-10">
        <EmailCapture />
      </section>

      <PageStack>
        <ProgramsGrid programs={programs.slice(0, 3)} title="Our Programs" />
        <Coaches coaches={coaches} title="Meet the Coaches" />
        <EventsList events={events} title="Upcoming Events" />
        <LocationsGrid locations={locations} title="Our Locations" />
      </PageStack>
    </main>
  );
}
