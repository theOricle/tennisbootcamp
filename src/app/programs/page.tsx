import type { Metadata } from "next";
import {
  COHORT_LENGTH,
  COHORT_LENGTH_ADJ,
  SESSION_MINUTES,
  SESSION_PRICE_LABEL,
  listedPrograms,
  programGroups,
} from "@/content/programs";
import type { Cohort } from "@/types/cohort";
import { getPublicCohorts } from "@/lib/cohortsDb";
import { nextCohortForGroup } from "@/lib/programCatalog";
import { ProgramCatalog, type CatalogProgram } from "@/components/sections/ProgramCatalog";
import { LocationChoice, type LocationOption } from "@/components/locations/LocationChoice";
import { locations } from "@/content/locations";
import { locationProgramsLine } from "@/lib/locationCatalog";
import { EmailCapture } from "@/components/sections/EmailCapture";
import { HowJoiningWorks } from "@/components/sections/HowJoiningWorks";
import { QuizBand } from "@/components/sections/QuizBand";
import { Container } from "@/components/layout/Container";
import { PageStack } from "@/components/layout/PageStack";
import { Heading } from "@/components/ui/Heading";
import { TrackedButton } from "@/components/ui/TrackedButton";
import { TierLine } from "@/components/tiers";
import { TIER_COUNT_WORD, TIER_LADDER_SPAN } from "@/lib/tiers";
import { QUIZ_CTA_LABEL } from "@/lib/quizBar";

// Incremental static regeneration (audit M39): each group's "next cohort"
// chip is rebuilt at most once a minute, and at once when an admin changes a
// cohort (src/lib/cohortRevalidate.ts), instead of being frozen at build
// time. The age and level filters live in the URL and are applied in the
// browser, so a filtered link never bypasses the cache.
export const revalidate = 60;

export const metadata: Metadata = {
  title: "Programs",
  description:
    `Tennis in Toronto for every age and level: Youth Bootcamps on Saturdays, Adult Bootcamps on Sundays, private lessons by arrangement. ${SESSION_PRICE_LABEL} a session in ${COHORT_LENGTH_ADJ} cohorts.`,
  alternates: { canonical: "/programs" },
};

export default async function ProgramsPage() {
  const publicCohorts = await getPublicCohorts();
  const nextCohorts: Record<string, Cohort> = {};
  for (const g of programGroups) {
    const next = nextCohortForGroup(publicCohorts, g);
    if (next) nextCohorts[g.id] = next;
  }
  const catalogPrograms: CatalogProgram[] = listedPrograms.map((p) => ({
    slug: p.slug,
    title: p.title,
    type: p.type,
    description: p.description,
    photo: p.photo,
    ageBands: p.ageBands,
    timetable: p.timetable,
    schedule: p.schedule,
  }));
  const locationOptions: LocationOption[] = locations.map((location) => ({
    location,
    summary: locationProgramsLine(location),
  }));

  return (
    <main>
      {/* Header band (audit H2, H7): the H1, the intro, the primary CTA, and
          the tier legend beside them so the Level rows below read at once. */}
      <div className="tb-gradient">
        <Container className="py-14 md:py-20">
          <div className="lg:grid lg:grid-cols-[1.1fr_1fr] lg:items-center lg:gap-12">
            <div>
              <Heading as="h1">Our Programs</Heading>
              {/* Open to join (joining flow, owner 2026-10-12), with no
                  self-serve enroll yet (audit M3, backlog #16): a visitor picks
                  a group, the quiz asks for the spot, our coaches invite. */}
              <p className="mt-3 max-w-2xl text-pretty text-base text-white/75">
                Three programs: Youth Bootcamps on Saturdays, Adult Bootcamps on Sundays, and
                private lessons by arrangement. Each cohort is a fixed group that trains together
                for {COHORT_LENGTH}, one {SESSION_MINUTES}-minute class a week, and every group is
                built for an age range and one level. Pick the group that fits, or take the
                2-minute quiz and our coaches place you.
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
                {TIER_COUNT_WORD.charAt(0).toUpperCase() + TIER_COUNT_WORD.slice(1)} tiers, {TIER_LADDER_SPAN}. Each group
                carries one level, and our coaches place every player on the ladder.
              </p>
              <TierLine variant="ladder" orientation="responsive" density="compact" className="mt-5" />
            </section>
          </div>
        </Container>
      </div>

      {/* The page opens on the location (owner, 2026-10-12: "People need to
          choose location first"): one club today, preselected. How joining
          works follows, above the age and level filters (joining flow, owner
          2026-10-12). The catalog sits inside the page Container (audit H2):
          every group at the chosen location under its program, with the
          filters; then the quiz band, and the newsletter last (M12, M13). */}
      <PageStack>
        <LocationChoice options={locationOptions} />
        <HowJoiningWorks source="programs-joining" showApproval />
        <ProgramCatalog programs={catalogPrograms} groups={programGroups} nextCohorts={nextCohorts} />
        <QuizBand source="programs-closing" />
        <EmailCapture source="programs_email_capture" />
      </PageStack>
    </main>
  );
}
