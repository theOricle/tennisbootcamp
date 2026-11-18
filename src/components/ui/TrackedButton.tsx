"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { Button } from "@/components/ui/Button";
import { trackAssessmentCtaClick, trackQuizCtaClick } from "@/lib/analytics";
import { useQuizStatus } from "@/lib/useQuizStatus";

type TrackedButtonProps = ComponentProps<typeof Button> & {
  /** Which funnel CTA this is: the quiz or the optional assessment. */
  track: "quiz" | "assessment";
  /** Where on the site, e.g. "program-detail" (audit L13). */
  source: string;
  /**
   * A quiz CTA becomes the quiz-taker's next step once the account says they
   * have taken it (owner, 2026-10-12): "Open your dashboard". Only a
   * signed-in account is ever a quiz-taker; signed out, every visitor keeps
   * the quiz (owner, 2026-11-18). Pass false for a link that must always
   * open the quiz ("Ask about lessons"). The server render, and the first
   * client render, keep the quiz, so a static page never flashes the wrong
   * label.
   */
  quizAware?: boolean;
};

/**
 * A Button link that reports its click with a source tag (audit L13), so a
 * server page can carry a tracked CTA without becoming a client component.
 */
export function TrackedButton({ track, source, onClick, quizAware, href, children, ...props }: TrackedButtonProps) {
  const quiz = useQuizStatus();
  const swap = track === "quiz" && quizAware !== false && quiz.state === "taken";
  return (
    <Button
      {...props}
      href={swap ? quiz.next.href : href}
      onClick={(e) => {
        if (track === "quiz") trackQuizCtaClick(swap ? `${source}-taken` : source);
        else trackAssessmentCtaClick(source);
        onClick?.(e);
      }}
    >
      {swap ? quiz.next.label : children}
    </Button>
  );
}

type TrackedLinkProps = ComponentProps<typeof Link> & {
  track: "quiz" | "assessment";
  source: string;
  /**
   * As TrackedButton's, plus "href": the link keeps its own words and only
   * where it goes follows the quiz-taker to their next step. A group card's
   * "Ask to join" reads the same for everyone, and takes a signed-in account
   * with quiz answers on file to its dashboard instead of back to the quiz
   * (owner, 2026-11-18).
   */
  quizAware?: boolean | "href";
};

/** A plain Link with the same source-tagged click event, for CTAs styled their own way. */
export function TrackedLink({ track, source, onClick, quizAware, href, children, ...props }: TrackedLinkProps) {
  const quiz = useQuizStatus();
  const swap = track === "quiz" && quizAware !== false && quiz.state === "taken";
  return (
    <Link
      {...props}
      href={swap ? quiz.next.href : href}
      onClick={(e) => {
        if (track === "quiz") trackQuizCtaClick(swap ? `${source}-taken` : source);
        else trackAssessmentCtaClick(source);
        onClick?.(e);
      }}
    >
      {swap && quizAware !== "href" ? quiz.next.label : children}
    </Link>
  );
}
