import type { Metadata } from "next";
import {
  COHORT_LENGTH,
  COHORT_LENGTH_ADJ,
  SESSION_MINUTES,
  SESSION_PRICE_LABEL,
  listedPrograms,
} from "@/content/programs";
import { ProgramsGrid } from "@/components/sections/ProgramsGrid";
import { EmailCapture } from "@/components/sections/EmailCapture";

export const metadata: Metadata = {
  title: "Programs",
  description:
    `Weekend tennis classes in Toronto: Youth Programs, High Performance and Adult Bootcamps. Once a week, 60 minutes, ${COHORT_LENGTH_ADJ} cohorts, ${SESSION_PRICE_LABEL} a session.`,
  alternates: { canonical: "/programs" },
};

export default function ProgramsPage() {
  return (
    <main>
      <div className="tb-gradient">
        <div className="mx-auto max-w-6xl px-6 py-14">
          <h1 className="text-3xl font-semibold text-white">Our Programs</h1>
          {/* No self-enrollment: Sina places every player (audit M3). */}
          <p className="mt-3 max-w-2xl text-white/70">
            Weekend classes for juniors, teens and adults. Each cohort is a fixed
            group that trains together for {COHORT_LENGTH}, one {SESSION_MINUTES}-minute
            class a week. Take the 2-minute quiz and Sina places you by level and
            schedule.
          </p>
        </div>
      </div>

      <EmailCapture />
      <ProgramsGrid programs={listedPrograms} title="Programs" />
    </main>
  );
}
