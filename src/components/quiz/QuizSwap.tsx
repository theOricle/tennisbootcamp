"use client";

import type { ReactNode } from "react";
import { useQuizStatus } from "@/lib/useQuizStatus";
import { RETAKE_QUIZ_LABEL, retakeQuizHref } from "@/lib/quizStatus";
import { TrackedLink } from "@/components/ui/TrackedButton";

/**
 * A sentence that changes once the visitor has taken the quiz (owner,
 * 2026-10-12). `guest` renders for a new visitor, on the server, and until
 * the browser knows; `taken` for a quiz-taker who is signed out; `member`
 * (or `taken` when absent) for a signed-in quiz-taker. A server page can
 * pass the three as JSX; the quiz-aware links inside them (TrackedLink with
 * track="quiz") already point at the taker's next step.
 */
export function QuizSwap({
  guest,
  taken,
  member,
}: {
  guest: ReactNode;
  taken: ReactNode;
  member?: ReactNode;
}) {
  const quiz = useQuizStatus();
  if (quiz.state !== "taken") return <>{guest}</>;
  if (quiz.signedIn && member !== undefined) return <>{member}</>;
  return <>{taken}</>;
}

/**
 * The small secondary link a quiz-taker keeps (never the primary): it always
 * opens the quiz, whatever the device remembers — on its first step, since
 * `?retake=1` skips the already-taken panel (the hero's and the closing
 * band's links went to plain /intake, where a taker met the panel again and
 * had to press Retake twice). `href` is the quiz link the surface uses,
 * query and all; the retake flag is added here.
 */
export function RetakeQuizLink({
  href = "/intake",
  source,
  className,
  children = RETAKE_QUIZ_LABEL,
}: {
  href?: string;
  source: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <TrackedLink
      href={retakeQuizHref(href)}
      track="quiz"
      source={source}
      quizAware={false}
      className={className}
    >
      {children}
    </TrackedLink>
  );
}
