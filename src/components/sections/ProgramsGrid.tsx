import type { Program } from "@/types/program";
import { Heading } from "@/components/ui/Heading";
import { LevelsStrip } from "./LevelsStrip";
import { ProgramCardList } from "./ProgramCard";

/**
 * "Our Programs" on the home page (owner-approved design, 2026-11-17): the
 * heading, the listed programs as compact photo cards, three across from
 * md, and the five levels as one slim strip under them. No line under the
 * heading (owner, 2026-11-17): the three points above the section say what
 * a bootcamp is, and the site makes no general claim about how long a class
 * is or how often it runs. It reads nothing from the database and sets no
 * horizontal padding or max-width: the page puts it inside its Container
 * (audit H2).
 */
export function ProgramsGrid({ programs }: { programs: Program[] }) {
  return (
    <section aria-labelledby="programs-grid-title">
      <Heading id="programs-grid-title">Our Programs</Heading>
      <div className="mt-[18px] md:mt-6">
        <ProgramCardList programs={programs} variant="compact" />
      </div>
      <LevelsStrip className="mt-3 md:mt-5" />
    </section>
  );
}
