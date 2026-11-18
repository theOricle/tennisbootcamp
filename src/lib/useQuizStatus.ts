"use client";

import { useEffect, useState } from "react";
import { useAuthState } from "@/lib/useAuthState";
import {
  QUIZ_FLAG_COOKIE,
  QUIZ_FLAG_MAX_AGE_SECONDS,
  encodeQuizFlag,
  quizView,
  readQuizFlagFromCookies,
  type QuizFlag,
  type QuizStatus,
  type QuizView,
} from "@/lib/quizStatus";

/**
 * The quiz-taker's state for the site chrome and every quiz CTA (owner,
 * 2026-10-12). The rule lives in src/lib/quizStatus.ts; this hook only wires
 * its one source to React: the account, through /api/quiz-status, read once
 * per page and shared by every island on it, only when the session cookie
 * says someone is signed in (the SDK stays off the critical path, audit M40).
 *
 * Signed out, every visitor reads as new (owner, 2026-11-18): a browser
 * cannot tell who is at it, so the device flag is not read. The server
 * render and the first client render are the new visitor's, so a static or
 * ISR page never flashes the wrong words.
 */

const listeners = new Set<() => void>();

function notify() {
  for (const fn of listeners) fn();
}

// One read per page for the account's status, shared by every island.
let accountRequest: Promise<QuizStatus | null> | null = null;

function loadAccountStatus(): Promise<QuizStatus | null> {
  accountRequest ??= fetch("/api/quiz-status", { credentials: "same-origin" })
    .then((r) => (r.ok ? r.json() : null))
    .then((d): QuizStatus | null => {
      if (!d || !d.signedIn) return null;
      return {
        taken: Boolean(d.taken),
        playerCount: typeof d.playerCount === "number" ? d.playerCount : 0,
        matchedHref: typeof d.matchedHref === "string" ? d.matchedHref : "/programs",
      };
    })
    .catch((): QuizStatus | null => null);
  return accountRequest;
}

/** Forget the shared account read (after the quiz is sent while signed in). */
function resetAccountStatus() {
  accountRequest = null;
}

export function useQuizStatus(): QuizView {
  const { signedIn } = useAuthState();
  const [account, setAccount] = useState<QuizStatus | null>(null);
  // Bumped by rememberQuizTaken so a signed-in quiz-taker's islands re-read.
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    const bump = () => setGeneration((g) => g + 1);
    listeners.add(bump);
    return () => {
      listeners.delete(bump);
    };
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    loadAccountStatus().then((status) => {
      if (live) setAccount(status);
    });
    return () => {
      live = false;
    };
  }, [signedIn, generation]);

  return quizView({ signedIn, account: signedIn ? account : null });
}

/**
 * Called by the quiz once /api/intake has answered ok. The route already set
 * the device flag's cookie on a submission it wrote; this mirrors it into
 * localStorage (or writes the cookie itself when only `flag` is given, which
 * no caller does today) and wakes every island on the page, so a signed-in
 * quiz-taker's account is read again. A submission the route dropped set no
 * cookie, and then nothing happens here either.
 *
 * Nothing reads the flag to decide anything since 2026-11-18 (owner); its
 * writes stay until a later item removes them with the route's.
 */
export function rememberQuizTaken(flag?: QuizFlag | null): void {
  const fromCookie = readQuizFlagFromCookies(typeof document === "undefined" ? "" : document.cookie);
  const value = fromCookie ?? flag ?? null;
  if (!value) return;
  const encoded = encodeQuizFlag(value);
  try {
    if (!fromCookie) {
      const secure = window.location.protocol === "https:" ? "; Secure" : "";
      document.cookie = `${QUIZ_FLAG_COOKIE}=${encoded}; Path=/; Max-Age=${QUIZ_FLAG_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
    }
  } catch {
    // Cookie blocked: the mirror below is written anyway.
  }
  try {
    window.localStorage.setItem(QUIZ_FLAG_COOKIE, encoded);
  } catch {
    // Storage blocked: the cookie alone carries the flag.
  }
  resetAccountStatus();
  notify();
}
