import type { Metadata } from "next";
import { COHORT_LENGTH_ADJ, listedPrograms, programGroups } from "@/content/programs";
import { PROGRAMS_DESCRIPTION } from "@/content/site";
import { getPublicCohorts } from "@/lib/cohortsDb";
import { readBlockSeats } from "@/lib/groupSeats";
import { groupCards } from "@/lib/groupBlocks";
import { ProgramCatalog, type CatalogProgram } from "@/components/sections/ProgramCatalog";
import { GoodToKnow } from "@/components/sections/GoodToKnow";
import { LevelsStrip } from "@/components/sections/LevelsStrip";
import { Container } from "@/components/layout/Container";
import { Heading } from "@/components/ui/Heading";

// Incremental static regeneration (audit M39): the open blocks, their dates
// and their seats are rebuilt at most once a minute, and at once when an
// admin changes a cohort (src/lib/cohortRevalidate.ts), instead of being
// frozen at build time. The location, age and level filters live in the URL and are applied
// in the browser, so a filtered link never bypasses the cache.
export const revalidate = 60;

export const metadata: Metadata = {
  title: "Programs",
  description: PROGRAMS_DESCRIPTION,
  alternates: { canonical: "/programs" },
};

export default async function ProgramsPage() {
  const publicCohorts = await getPublicCohorts();
  // Seats for the open blocks: one read per render, none while no block is
  // open. Display only.
  const seats = await readBlockSeats(publicCohorts);
  // One card per open block, and one per planned group with none (owner,
  // 2026-11-19; src/lib/groupBlocks.ts).
  const cards = groupCards(programGroups, publicCohorts, seats);
  const catalogPrograms: CatalogProgram[] = listedPrograms.map((p) => ({ slug: p.slug, title: p.title }));

  return (
    <main>
      {/* The page (owner-approved design, 2026-11-17): a header band with the
          title, one lead, the three dropdowns (location first; owner
          2026-10-12), the five levels as a strip and the quiz as a side
          line; every group under its program; then what is good to know,
          said once. The band and the groups are the catalog's, since the
          dropdowns filter the groups; the title, the lead and the strip are
          rendered here and passed in. No lime button in the band: the main
          button is the header's, and each group has its own. */}
      <ProgramCatalog
        programs={catalogPrograms}
        cards={cards}
        header={
          <>
            <Heading as="h1">Our Programs</Heading>
            {/* What every group is and how long a cohort runs (the length
                from the setting). No class length and no classes a week
                (owner, 2026-11-17): each group card carries its own time. */}
            <p className="mt-2.5 max-w-[40rem] text-pretty text-base text-white/75">
              Every group is a bootcamp: tennis and fitness in every class, in {COHORT_LENGTH_ADJ} cohorts.
              Pick your group and join.
            </p>
          </>
        }
        levels={<LevelsStrip className="mt-4 md:mt-[22px]" />}
      />

      <Container className="pb-12 pt-10 md:pb-20 md:pt-[72px]">
        <GoodToKnow
          source="programs-good-to-know"
          approvalGroup={programGroups.find((g) => g.joining === "approval")?.name}
        />
      </Container>
    </main>
  );
}
