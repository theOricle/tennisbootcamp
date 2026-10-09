import type { Metadata } from "next";
import { EmailCapture } from "@/components/sections/EmailCapture";

// No event is scheduled (audit M6, owner default D24): the page stays out of
// the nav, the home page and the sitemap, carries noindex, and promises
// nothing. It returns to the nav with the first real entry in
// src/content/events.ts.
export const metadata: Metadata = {
  title: "Events",
  description:
    "No Tennis Bootcamp events are scheduled right now. Join the email list and you'll hear when one is.",
  alternates: { canonical: "/events" },
  robots: { index: false, follow: true },
};

export default function EventsPage() {
  return (
    <main>
      <div className="tb-gradient">
        <div className="mx-auto max-w-6xl px-6 py-14">
          <h1 className="text-3xl font-semibold text-white">Events</h1>
          <p className="mt-3 max-w-2xl text-white/70">
            No events are scheduled right now. Training runs as weekend
            classes; join the email list below and you&apos;ll hear when an
            event is added.
          </p>
        </div>
      </div>

      <EmailCapture />
    </main>
  );
}
