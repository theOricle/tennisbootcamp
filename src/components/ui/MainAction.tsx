import { Button } from "@/components/ui/Button";
import { TrackedLink } from "@/components/ui/TrackedButton";
import { FOCUS_RING } from "@/components/ui/focus";
import { QuizSwap } from "@/components/quiz/QuizSwap";
import {
  JOIN_CTA_HREF,
  JOIN_CTA_LABEL,
  QUIZ_CTA_LABEL,
  QUIZ_SIDE_LEAD,
  QUIZ_TAKEN_LEAD,
} from "@/lib/mainAction";

// The main action (owner, 2026-11-16): the lime "Join a group" button, then
// the quiz as a side line, "Not sure which group? Take the 2-minute quiz".
// One component, so the hero, the closing, the 404 and the pages that end on
// it always say the same two things in the same order.

/** The lime link inside a sentence. */
export const INLINE_LIME_LINK = `rounded font-semibold text-[#B4E655] underline-offset-[3px] hover:underline ${FOCUS_RING}`;

/**
 * The quiz as a side line. A visitor who has taken the quiz is not asked
 * again (owner, 2026-10-12): the line says their answers are in, and the
 * link is their next step ("See your groups", or "Open your dashboard" when
 * signed in; TrackedLink swaps it once the browser knows). The server render
 * is the new visitor's line, so a static page never flashes the wrong words.
 */
export function QuizSideLine({
  source,
  quizHref = "/intake",
  className = "",
}: {
  /** Analytics source for the quiz link, e.g. "hero". */
  source: string;
  /** The quiz link; a program page passes `/intake?program={slug}`. */
  quizHref?: string;
  className?: string;
}) {
  const link = (
    <TrackedLink href={quizHref} track="quiz" source={source} className={INLINE_LIME_LINK}>
      {QUIZ_CTA_LABEL}
    </TrackedLink>
  );
  return (
    <p className={`text-sm text-white/70 ${className}`.trim()}>
      <QuizSwap
        guest={
          <>
            {QUIZ_SIDE_LEAD} {link}
          </>
        }
        taken={
          <>
            {QUIZ_TAKEN_LEAD} {link}
          </>
        }
      />
    </p>
  );
}

/**
 * The main button with the quiz side line after it: side by side where there
 * is room, the line under the button on a phone. The button is marked
 * (`data-main-cta`) so the phone bar stays away while it is on screen.
 */
export function MainAction({
  source,
  quizHref,
  href = JOIN_CTA_HREF,
  className = "",
}: {
  source: string;
  quizHref?: string;
  /** Where the button goes; a page that lists groups passes its own list's anchor. */
  href?: string;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap items-center gap-x-5 gap-y-3 ${className}`.trim()}>
      <Button variant="primary" href={href} className="whitespace-nowrap" data-main-cta>
        {JOIN_CTA_LABEL}
      </Button>
      <QuizSideLine source={source} quizHref={quizHref} />
    </div>
  );
}
