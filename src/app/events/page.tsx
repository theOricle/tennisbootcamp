import type { Metadata } from "next";
import { EmailCapture } from "@/components/sections/EmailCapture";

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
            Bootcamps, camps, and special training sessions. More dates will be
            posted soon.
          </p>
        </div>
      </div>

      {/* Coming-soon block */}
      <section className="mx-auto max-w-6xl px-6 py-20 text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-[#B4E655]">
          Coming up
        </p>
        <h2 className="mt-3 text-3xl font-semibold text-white">
          Next events drop this summer
        </h2>
        <p className="mx-auto mt-4 max-w-md text-white/60">
          We&apos;re finalising the schedule for our summer bootcamps and camps.
          Drop your email and we&apos;ll notify you the moment spots open.
        </p>
      </section>

      <EmailCapture />
    </main>
  );
}
