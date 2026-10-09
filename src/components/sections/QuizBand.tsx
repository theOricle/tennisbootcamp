"use client";

import { Button } from "@/components/ui/Button";
import { Heading } from "@/components/ui/Heading";
import { trackQuizCtaClick } from "@/lib/analytics";
import { QUIZ_CTA_LABEL } from "@/lib/quizBar";

/**
 * The closing band (audit M13): a page ends on the primary CTA, never on a
 * dead end. Lime-tint highlight, one lime button. Sets no horizontal padding
 * or max-width: the page's Container does (audit H2).
 */
export function QuizBand({
  href = "/intake",
  source,
}: {
  /** The quiz link; a program page passes `/intake?program={slug}`. */
  href?: string;
  /** Analytics source for the click, e.g. "home-closing". */
  source: string;
}) {
  return (
    <section
      aria-labelledby="quiz-band-title"
      className="rounded-2xl border border-[#B4E655]/20 bg-[#B4E655]/5 p-6 md:flex md:items-center md:justify-between md:gap-8 md:p-8"
    >
      <div className="min-w-0">
        <Heading id="quiz-band-title">
          Not sure which group fits?
        </Heading>
        <p className="mt-2 max-w-2xl text-pretty text-sm text-white/75 md:text-base">
          Tell us each player&apos;s age, level and free time. Sina places them in the class that fits.
        </p>
      </div>
      <Button
        variant="primary"
        href={href}
        onClick={() => trackQuizCtaClick(source)}
        className="mt-5 w-full shrink-0 whitespace-nowrap md:mt-0 md:w-auto"
        data-quiz-cta
      >
        {QUIZ_CTA_LABEL}
      </Button>
    </section>
  );
}
