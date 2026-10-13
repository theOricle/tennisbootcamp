import type { ReactNode } from "react";
import {
  APPROVAL_LINE,
  ASSESSMENT_CERTAINTY_LINE,
  RIGHT_GROUP_PROMISE,
} from "@/content/programs";
import { QUIZ_CTA_LABEL } from "@/lib/quizBar";
import { TrackedLink } from "@/components/ui/TrackedButton";
import { QuizSwap } from "@/components/quiz/QuizSwap";
import { TEXT_LINK_LIME } from "@/components/ui/TextLink";
import { FOCUS_RING } from "@/components/ui/focus";

// How joining works (joining flow, owner 2026-10-12): three steps on /programs
// and on each program page with fixed classes. Groups are open to join for
// anyone whose age and level fit; the coach confirms the level on court in
// week one and moves the player, or refunds them in full when no group fits.
// The $20 assessment is offered once, as optional; High Performance is by
// approval. A real ordered list (role="list" keeps its semantics where the
// list style is removed); the big numerals are decoration, so a screen
// reader hears "1 of 3", not "1, 01". Server-rendered, no state; the two
// links are the only interactive elements, and neither is the page's
// primary: the lime quiz button stays the header's.

const INLINE_LINK = `rounded font-semibold text-[#B4E655] underline underline-offset-2 hover:no-underline ${FOCUS_RING}`;

export type HowJoiningWorksProps = {
  /** The quiz link; a program page passes `/intake?program={slug}`. */
  quizHref?: string;
  /** Analytics source for both links, e.g. "programs-joining". */
  source: string;
  /** Add the High Performance line (pages that list that group). */
  showApproval?: boolean;
  className?: string;
};

type Step = { title: string; body: ReactNode };

export function HowJoiningWorks({
  quizHref = "/intake",
  source,
  showApproval = false,
  className = "",
}: HowJoiningWorksProps) {
  const steps: Step[] = [
    {
      title: "Pick a group that fits your age and level",
      body: (
        // A quiz-taker is not asked again (owner, 2026-10-12): the step
        // points them at their groups, or their dashboard when signed in.
        <QuizSwap
          guest={
            <>
              Each group lists its ages and level band. Not sure which fits?{" "}
              <TrackedLink href={quizHref} track="quiz" source={source} className={INLINE_LINK}>
                {QUIZ_CTA_LABEL}
              </TrackedLink>{" "}
              and our coaches place you.
            </>
          }
          taken={
            <>
              Each group lists its ages and level band. You&apos;ve taken the quiz, so our
              coaches place you from your answers.{" "}
              <TrackedLink href={quizHref} track="quiz" source={source} className={INLINE_LINK}>
                {QUIZ_CTA_LABEL}
              </TrackedLink>
            </>
          }
        />
      ),
    },
    {
      title: "Reserve your spot",
      body: "The 2-minute quiz is how you ask for a spot. We email you an invitation with the group's dates and price, and hold your spot while you enroll.",
    },
    {
      title: "Your coach confirms your level",
      body: `On court, in week one. ${RIGHT_GROUP_PROMISE}`,
    },
  ];

  return (
    <section
      id="how-joining-works"
      aria-labelledby="how-joining-works-heading"
      className={`scroll-mt-24 rounded-2xl border border-white/10 bg-white/[0.03] p-5 md:p-8 ${className}`.trim()}
    >
      <h2
        id="how-joining-works-heading"
        className="text-xl font-semibold tracking-tight text-white md:text-2xl"
      >
        How joining works
      </h2>

      <ol role="list" className="mt-5 grid gap-5 md:mt-6 md:grid-cols-3 md:gap-8">
        {steps.map((step, i) => (
          <li
            key={step.title}
            className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-3 border-t border-white/10 pt-4 md:block"
          >
            <span
              aria-hidden="true"
              className="text-2xl font-semibold leading-none tabular-nums tracking-tight text-[#B4E655] md:text-3xl"
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            <div className="min-w-0 md:mt-4">
              <h3 className="text-base font-semibold leading-snug text-white">{step.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-white/70">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-6 space-y-3 border-t border-white/10 pt-5">
        {showApproval && (
          <p className="max-w-3xl text-sm leading-relaxed text-white/70">
            <span className="font-semibold text-white">The High Performance Youth Bootcamp is by approval.</span>{" "}
            {APPROVAL_LINE}
          </p>
        )}
        <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between md:gap-8">
          <p className="max-w-3xl text-sm leading-relaxed text-white/70">
            <span className="font-semibold text-white">Want certainty first?</span>{" "}
            {ASSESSMENT_CERTAINTY_LINE}
          </p>
          <TrackedLink
            href="/assessment/book"
            track="assessment"
            source={source}
            className={`${TEXT_LINK_LIME} shrink-0 self-start whitespace-nowrap md:self-auto`}
          >
            Book Your Assessment
            <span aria-hidden="true" className="ml-1.5">
              →
            </span>
          </TrackedLink>
        </div>
      </div>
    </section>
  );
}
