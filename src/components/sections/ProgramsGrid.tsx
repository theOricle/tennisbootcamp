import Link from "next/link";
import type { Program } from "@/types/program";
import { getPublicCohorts } from "@/lib/cohortsDb";
import type { ProgramFit } from "@/lib/programCatalog";
import { QUIZ_CTA_LABEL } from "@/lib/quizBar";
import { Heading } from "@/components/ui/Heading";
import { TrackedLink } from "@/components/ui/TrackedButton";
import { QuizSwap } from "@/components/quiz/QuizSwap";
import { ProgramCardList } from "./ProgramCard";

/** The inline quiz link under the grid; the same words on both lines. */
const QUIZ_LINE_LINK =
  "rounded font-semibold text-[#B4E655] underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B4E655]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#061427]";

type ProgramsGridProps = {
  programs: Program[];
  /** The section heading; null when the page's own H1 already names the list. */
  title?: string | null;
  /** "Browse Programs →" to /programs; off on /programs itself (audit H2). */
  browseLink?: boolean;
  /** Home: one line under the grid pointing to the quiz, where a visitor is still choosing. */
  quizLine?: boolean;
  /** Which ranked player each program fits, by program id (dashboard). */
  fits?: Record<string, ProgramFit>;
};

/**
 * The program card list with its heading: the three programs with their
 * photographs, three across from lg. It reads the public cohorts once (ISR,
 * audit M39) and sets no horizontal padding or max-width: the page puts it
 * inside its Container (audit H2). A read failure renders the cards with no
 * "Next cohort" chip, never an error.
 */
export async function ProgramsGrid({
  programs,
  title = "Our Programs",
  browseLink = true,
  quizLine = false,
  fits,
}: ProgramsGridProps) {
  const publicCohorts = await getPublicCohorts();
  const showHeader = title !== null || browseLink;

  return (
    <section aria-labelledby={title ? "programs-grid-title" : undefined}>
      {showHeader && (
        <div className="mb-6 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          {title ? <Heading id="programs-grid-title">{title}</Heading> : <span />}
          {browseLink && (
            <Link
              className="inline-flex min-h-[44px] items-center rounded text-sm font-semibold text-white/70 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B4E655]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#061427]"
              href="/programs"
            >
              Browse Programs →
            </Link>
          )}
        </div>
      )}

      <ProgramCardList programs={programs} publicCohorts={publicCohorts} fits={fits} />

      {quizLine && (
        <p className="mt-6 text-sm text-white/75">
          {/* A quiz-taker reads their next step here instead (owner, 2026-10-12). */}
          <QuizSwap
            guest={
              <>
                Not sure which fits?{" "}
                <TrackedLink href="/intake" track="quiz" source="home-programs" className={QUIZ_LINE_LINK}>
                  {QUIZ_CTA_LABEL}
                </TrackedLink>{" "}
                and our coaches place you by level and schedule.
              </>
            }
            taken={
              <>
                You&apos;ve taken the quiz: our coaches place you by level and schedule from your
                answers.{" "}
                <TrackedLink href="/intake" track="quiz" source="home-programs" className={QUIZ_LINE_LINK}>
                  {QUIZ_CTA_LABEL}
                </TrackedLink>
              </>
            }
          />
        </p>
      )}
    </section>
  );
}
