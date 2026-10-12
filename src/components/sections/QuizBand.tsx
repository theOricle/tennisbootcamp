"use client";

import { TrackedButton } from "@/components/ui/TrackedButton";
import { RetakeQuizLink } from "@/components/quiz/QuizSwap";
import { Heading } from "@/components/ui/Heading";
import { QUIZ_CTA_LABEL } from "@/lib/quizBar";
import { useQuizStatus } from "@/lib/useQuizStatus";

/**
 * The closing band (audit M13): a page ends on the primary CTA, never on a
 * dead end. Lime-tint highlight, one lime button. Sets no horizontal padding
 * or max-width: the page's Container does (audit H2).
 *
 * A quiz-taker is not asked again (owner, 2026-10-12): the band says their
 * answers are in, the one button reads "See your groups" (or "Open your
 * dashboard" when signed in; TrackedButton swaps it), and a small "Retake
 * the quiz" link stays for anyone whose answers changed. The server render
 * is the visitor's band, so a static page never flashes the wrong words.
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
  const quiz = useQuizStatus();
  const taken = quiz.state === "taken";
  return (
    <section
      aria-labelledby="quiz-band-title"
      className="rounded-2xl border border-[#B4E655]/20 bg-[#B4E655]/5 p-6 md:flex md:items-center md:justify-between md:gap-8 md:p-8"
    >
      <div className="min-w-0">
        <Heading id="quiz-band-title">
          {taken ? "Your quiz answers are in." : "Not sure which program fits?"}
        </Heading>
        <p className="mt-2 max-w-2xl text-pretty text-sm text-white/75 md:text-base">
          {taken ? (
            <>
              Our coaches place each player by level and schedule from them. Answers changed?{" "}
              <RetakeQuizLink
                href={href}
                source={source}
                className="rounded font-semibold text-[#B4E655] underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B4E655]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#061427]"
              />
              .
            </>
          ) : (
            <>Tell us each player&apos;s age, level and free time. Our coaches place them in the class that fits.</>
          )}
        </p>
      </div>
      <TrackedButton
        variant="primary"
        href={href}
        track="quiz"
        source={source}
        className="mt-5 w-full shrink-0 whitespace-nowrap md:mt-0 md:w-auto"
        data-quiz-cta
      >
        {QUIZ_CTA_LABEL}
      </TrackedButton>
    </section>
  );
}
