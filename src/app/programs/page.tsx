import type { Metadata } from "next";
import {
  COHORT_LENGTH,
  COHORT_LENGTH_ADJ,
  SESSION_MINUTES,
  SESSION_PRICE_LABEL,
  listedPrograms,
} from "@/content/programs";
import { ProgramsGrid } from "@/components/sections/ProgramsGrid";
import { ProgramComingSoonBand } from "@/components/sections/ProgramComingSoonBand";
import { EmailCapture } from "@/components/sections/EmailCapture";
import { QuizBand } from "@/components/sections/QuizBand";
import { Container } from "@/components/layout/Container";
import { PageStack } from "@/components/layout/PageStack";
import { Heading } from "@/components/ui/Heading";
import { TrackedButton } from "@/components/ui/TrackedButton";
import { TierLine } from "@/components/tiers";
import { QUIZ_CTA_LABEL } from "@/lib/quizBar";

// Incremental static regeneration (audit M39): the program grid's "next
// cohort" line is rebuilt at most once a minute, and at once when an admin
// changes a cohort (src/lib/cohortRevalidate.ts), instead of being frozen at
// build time.
export const revalidate = 60;

export const metadata: Metadata = {
  title: "Programs",
  description:
    `Weekend tennis classes in Toronto: Youth Programs, High Performance and Adult Bootcamps. Once a week, 60 minutes, ${COHORT_LENGTH_ADJ} cohorts, ${SESSION_PRICE_LABEL} a session.`,
  alternates: { canonical: "/programs" },
};

export default function ProgramsPage() {
  const weekendClasses = listedPrograms.filter((p) => !p.comingSoon);
  const comingSoon = listedPrograms.filter((p) => p.comingSoon);

  return (
    <main>
      {/* Header band (audit H2, H7): the H1, the intro, the primary CTA, and
          the tier legend beside them so the Level rows below read at once. */}
      <div className="tb-gradient">
        <Container className="py-14 md:py-20">
          <div className="lg:grid lg:grid-cols-[1.1fr_1fr] lg:items-center lg:gap-12">
            <div>
              <Heading as="h1">Our Programs</Heading>
              {/* No self-enrollment: Sina places every player (audit M3). */}
              <p className="mt-3 max-w-2xl text-pretty text-base text-white/75">
                Weekend classes for juniors, teens and adults. Each cohort is a fixed
                group that trains together for {COHORT_LENGTH}, one {SESSION_MINUTES}-minute
                class a week. Take the 2-minute quiz and Sina places you by level and
                schedule.
              </p>
              <TrackedButton
                variant="primary"
                href="/intake"
                track="quiz"
                source="programs-header"
                className="mt-6 w-full sm:w-auto"
                data-quiz-cta
              >
                {QUIZ_CTA_LABEL}
              </TrackedButton>
            </div>

            <section
              aria-labelledby="levels"
              className="mt-10 rounded-2xl border border-white/10 bg-white/[0.03] p-5 md:p-6 lg:mt-0"
            >
              <h2 id="levels" className="text-xs font-semibold uppercase tracking-[0.12em] text-[#B4E655]">
                Levels
              </h2>
              <p className="mt-2 text-sm text-white/75">
                Seven tiers, Love to Grand Slam. Each program shows the tiers it is
                built for, and Sina places every player on the ladder.
              </p>
              <TierLine variant="ladder" orientation="responsive" density="compact" className="mt-5" />
            </section>
          </div>
        </Container>
      </div>

      {/* The catalog sits inside the page Container (audit H2): no second
          "Programs" heading under the H1, no link to the page it is on, and
          the newsletter last, after the quiz band (M12, M13). */}
      <PageStack>
        <section aria-labelledby="weekend-classes">
          <Heading id="weekend-classes">Weekend classes</Heading>
          <p className="mt-2 text-sm text-white/60">
            Saturdays and Sundays · {SESSION_MINUTES} minutes · {COHORT_LENGTH_ADJ} cohorts
          </p>
          <div className="mt-6">
            <ProgramsGrid programs={weekendClasses} title={null} browseLink={false} layout="rows" />
          </div>
        </section>

        {comingSoon.length > 0 && (
          <section aria-labelledby="coming-soon">
            <Heading id="coming-soon">Coming soon</Heading>
            <div className="mt-6 space-y-4">
              {comingSoon.map((p) => (
                <ProgramComingSoonBand key={p.id} program={p} />
              ))}
            </div>
          </section>
        )}

        <QuizBand source="programs-closing" />
        <EmailCapture source="programs_email_capture" />
      </PageStack>
    </main>
  );
}
