"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useAuthState } from "@/lib/useAuthState";
import {
  QUIZ_FLAG_COOKIE,
  QUIZ_FLAG_MAX_AGE_SECONDS,
  decodeQuizFlag,
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
 * the two sources to React:
 *
 *   • the device flag (cookie, mirrored in localStorage) through
 *     useSyncExternalStore, whose server snapshot is "not asked yet", so a
 *     static or ISR page renders the ordinary quiz CTA and switches once the
 *     browser has read the flag — no flash of the wrong CTA, no layout shift
 *     (the two labels sit in the same button);
 *   • the account, through /api/quiz-status, read once per page and shared by
 *     every island on it, only when the session cookie says someone is
 *     signed in (the SDK stays off the critical path, audit M40).
 *
 * Signed in, the device flag is ignored: on a shared family device the
 * account at the keyboard decides.
 */

const listeners = new Set<() => void>();

function notify() {
  for (const fn of listeners) fn();
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("focus", onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("focus", onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** The raw stored value (cookie first, then the mirror), so equal reads share a snapshot. */
function rawDeviceFlag(): string {
  let value = "";
  try {
    for (const part of document.cookie.split(";")) {
      const [name, ...rest] = part.split("=");
      if (name.trim() === QUIZ_FLAG_COOKIE) value = rest.join("=").trim();
    }
  } catch {
    // No cookie access: fall through to the mirror.
  }
  if (!value) {
    try {
      value = window.localStorage.getItem(QUIZ_FLAG_COOKIE) ?? "";
    } catch {
      // Storage blocked: the visitor reads as new, which is the honest answer.
    }
  }
  return value;
}

function serverSnapshot(): string | undefined {
  return undefined;
}

/** The device flag, or null when none; undefined on the server render. */
function useDeviceFlag(): QuizFlag | null | undefined {
  const raw = useSyncExternalStore(subscribe, rawDeviceFlag, serverSnapshot);
  if (raw === undefined) return undefined;
  return decodeQuizFlag(raw);
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
  const device = useDeviceFlag();
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

  return quizView({ signedIn, account: signedIn ? account : null, device });
}

/**
 * Remember on this device that the quiz was taken. Called by the quiz once
 * /api/intake has answered ok: the route already set the cookie on a
 * submission it wrote, so this mirrors it into localStorage and wakes every
 * island on the page. A submission the route dropped set no cookie, and then
 * nothing is remembered here either — unless `flag` is given, which only the
 * quiz page does after reading the cookie back.
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
    // Cookie blocked: the mirror below still answers on this device.
  }
  try {
    window.localStorage.setItem(QUIZ_FLAG_COOKIE, encoded);
  } catch {
    // Storage blocked: the cookie alone carries the flag.
  }
  resetAccountStatus();
  notify();
}
