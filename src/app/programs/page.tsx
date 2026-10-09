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
import { Container } from "@/components/layout/Container";
import { PageStack } from "@/components/layout/PageStack";
import { Heading } from "@/components/ui/Heading";

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
        <Container className="pb-2 pt-14 md:pb-4 md:pt-16">
          <Heading as="h1">Our Programs</Heading>
          {/* No self-enrollment: Sina places every player (audit M3). */}
          <p className="mt-3 max-w-2xl text-white/70">
            Weekend classes for juniors, teens and adults. Each cohort is a fixed
            group that trains together for {COHORT_LENGTH}, one {SESSION_MINUTES}-minute
            class a week. Take the 2-minute quiz and Sina places you by level and
            schedule.
          </p>
        </Container>
      </div>

      {/* The grid sits inside the page Container (audit H2): no second
          "Programs" heading under the H1, no link to the page it is on, and
          the newsletter after the catalog, not before it (M12). */}
      <PageStack>
        <ProgramsGrid programs={listedPrograms} title={null} browseLink={false} />
        <EmailCapture source="programs_email_capture" />
      </PageStack>
    </main>
  );
}
