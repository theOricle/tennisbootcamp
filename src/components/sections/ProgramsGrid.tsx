import type { Program } from "@/types/program";
import { COHORT_LENGTH_ADJ, SESSION_MINUTES } from "@/content/programs";
import { Heading } from "@/components/ui/Heading";
import { LevelsStrip } from "./LevelsStrip";
import { ProgramCardList } from "./ProgramCard";

/**
 * "Our Programs" on the home page (owner-approved design, 2026-11-17): the
 * heading, one line on how a group bootcamp runs (the class length and the
 * cohort length from the constants), the listed programs as compact photo
 * cards, three across from md, and the five levels as one slim strip under
 * them. It reads nothing from the database and sets no horizontal padding
 * or max-width: the page puts it inside its Container (audit H2).
 */
export function ProgramsGrid({ programs }: { programs: Program[] }) {
  return (
    <section aria-labelledby="programs-grid-title">
      <Heading id="programs-grid-title">Our Programs</Heading>
      <p className="mt-2 max-w-xl text-[15px] text-white/75">
        Group bootcamps run one {SESSION_MINUTES}-minute class a week, in {COHORT_LENGTH_ADJ} cohorts.
      </p>
      <div className="mt-[18px] md:mt-6">
        <ProgramCardList programs={programs} variant="compact" />
      </div>
      <LevelsStrip className="mt-3 md:mt-5" />
    </section>
  );
}
