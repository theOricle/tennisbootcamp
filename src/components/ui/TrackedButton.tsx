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
   * A quiz CTA becomes the quiz-taker's next step once the browser knows
   * they have taken it (owner, 2026-10-12): "See your groups" to the catalog
   * filtered to their answers, or "Open your dashboard" when signed in. Pass
   * false for a link that must always open the quiz ("Retake the quiz").
   * The server render, and the first client render, keep the quiz, so a
   * static page never flashes the wrong label.
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
  quizAware?: boolean;
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
      {swap ? quiz.next.label : children}
    </Link>
  );
}
