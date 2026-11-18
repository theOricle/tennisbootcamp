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

// The main action (owner, 2026-11-16): the lime "Join a bootcamp" button, then
// the quiz as a side line, "Not sure which group? Take the 2-minute quiz".
// One component, so the hero, the closing, the 404 and the pages that end on
// it always say the same two things in the same order.

/**
 * How a lime link inside a sentence reads. It never breaks inside itself, so
 * a line break falls between the sentence and the link, never after
 * "2-minute".
 */
const LIME_LINK_TEXT = "whitespace-nowrap rounded font-semibold text-[#B4E655] underline-offset-[3px] hover:underline";

/** The lime link inside a sentence. */
export const INLINE_LIME_LINK = `${LIME_LINK_TEXT} ${FOCUS_RING}`;

/**
 * A 44px target on an inline link (WCAG 2.5.8). The padding is on an inline
 * box: it grows the area that takes a tap, and leaves the line, and
 * everything around it, where it was. The focus ring is the one ring, drawn
 * on a pseudo-element inset by that padding, so it hugs the words instead of
 * crossing the line above or below. The quiz side line and the program
 * titles on /programs use it.
 */
export const PADDED_INLINE_LINK =
  "relative py-[13px] focus:outline-none " +
  "after:pointer-events-none after:absolute after:inset-x-0 after:inset-y-[13px] after:rounded after:content-[''] " +
  "focus-visible:after:ring-2 focus-visible:after:ring-[#B4E655]/50 " +
  "focus-visible:after:ring-offset-2 focus-visible:after:ring-offset-[#061427]";

/** The side line's link is the line's one action, so it is a 44px target. */
const SIDE_LINE_LINK = `${LIME_LINK_TEXT} ${PADDED_INLINE_LINK}`;

/**
 * The quiz as a side line. A signed-in account with quiz answers on file is
 * not asked again (owner, 2026-10-12): the line says their answers are in,
 * and the link is their next step, "Open your dashboard" (TrackedLink swaps
 * it once the account has answered). Signed out, every visitor reads the new
 * visitor's line (owner, 2026-11-18): a browser cannot tell who is at it.
 * The server render is that line too, so a static page never flashes.
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
    <TrackedLink href={quizHref} track="quiz" source={source} className={SIDE_LINE_LINK}>
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
