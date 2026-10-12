"use client";

import type { ReactNode } from "react";
import { useQuizStatus } from "@/lib/useQuizStatus";
import { RETAKE_QUIZ_LABEL } from "@/lib/quizStatus";
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
 * opens the quiz, whatever the device remembers.
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
    <TrackedLink href={href} track="quiz" source={source} quizAware={false} className={className}>
      {children}
    </TrackedLink>
  );
}
