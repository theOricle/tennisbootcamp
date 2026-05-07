import type { Metadata } from "next";
import { events } from "@/content/events";
import { EventsList } from "@/components/sections/EventsList";

export const metadata: Metadata = {
  title: "Events",
  description: "Upcoming Tennis Bootcamp training sessions and events in Toronto.",
};

export default function EventsPage() {
  return (
    <main>
      <div className="tb-gradient">
        <div className="mx-auto max-w-6xl px-6 py-14">
          <h1 className="text-3xl font-semibold text-white">Events</h1>
          <p className="mt-3 max-w-2xl text-white/70">
            Bootcamps, camps, and special training sessions. More dates will be posted soon.
          </p>
        </div>
      </div>

      <EventsList events={events} title="Upcoming events" />
    </main>
  );
}
