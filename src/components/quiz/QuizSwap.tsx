"use client";

import type { ReactNode } from "react";
import { useQuizStatus } from "@/lib/useQuizStatus";

/**
 * A sentence that changes once the visitor has taken the quiz (owner,
 * 2026-10-12). `guest` renders for every visitor who is signed out (a
 * browser cannot tell who is at it, owner 2026-11-18), on the server, and
 * until the account has answered; `member`, or `taken` when it is absent,
 * for a signed-in account with quiz answers on file. A server page can pass
 * them as JSX; the quiz-aware links inside them (TrackedLink with
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
