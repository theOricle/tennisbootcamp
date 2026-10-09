"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { Button } from "@/components/ui/Button";
import { trackAssessmentCtaClick, trackQuizCtaClick } from "@/lib/analytics";

type TrackedButtonProps = ComponentProps<typeof Button> & {
  /** Which funnel CTA this is: the quiz or the optional assessment. */
  track: "quiz" | "assessment";
  /** Where on the site, e.g. "program-detail" (audit L13). */
  source: string;
};

/**
 * A Button link that reports its click with a source tag (audit L13), so a
 * server page can carry a tracked CTA without becoming a client component.
 */
export function TrackedButton({ track, source, onClick, ...props }: TrackedButtonProps) {
  return (
    <Button
      {...props}
      onClick={(e) => {
        if (track === "quiz") trackQuizCtaClick(source);
        else trackAssessmentCtaClick(source);
        onClick?.(e);
      }}
    />
  );
}

type TrackedLinkProps = ComponentProps<typeof Link> & {
  track: "quiz" | "assessment";
  source: string;
};

/** A plain Link with the same source-tagged click event, for CTAs styled their own way. */
export function TrackedLink({ track, source, onClick, ...props }: TrackedLinkProps) {
  return (
    <Link
      {...props}
      onClick={(e) => {
        if (track === "quiz") trackQuizCtaClick(source);
        else trackAssessmentCtaClick(source);
        onClick?.(e);
      }}
    />
  );
}
