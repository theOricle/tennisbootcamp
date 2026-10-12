// Has this person taken the 2-minute quiz? (owner, 2026-10-12: "once someone
// has taken the quiz, the site stops prompting them to take it").
//
// One rule, two sources:
//   • Signed in: the account's own data, read through src/lib/players.ts —
//     any player on the account with a quiz answer on file (a self-estimate
//     or an age band from migration 0009), a week of availability the quiz
//     wrote, or a coach level (they were placed, so they are past the quiz).
//     Before 0009 runs the answer columns are null and the other two still
//     decide. A shared family device signed in as someone else reads that
//     account, never the device.
//   • Signed out: a first-party, functional cookie plus a localStorage
//     mirror, set by /api/intake on a submission it accepted and wrote (never
//     on a bot drop or a failed submit). Cleared cookies with no account to
//     fall back on read as "new", which is the honest answer for a device we
//     cannot recognise.
//
// Pure and client-safe: the hook (src/lib/useQuizStatus.ts), the route
// (src/app/api/quiz-status/route.ts) and src/scripts/test-quiz-state.ts all
// read this one file. Nothing here touches React, Next or Supabase.

import { AGE_BAND_QUERIES } from "@/lib/programFilters";
import { isAgeBand, type AgeBand } from "@/lib/ageBand";
import { hasAnyAvailability } from "@/lib/availability";
import { hasLevel, TIERS } from "@/lib/tiers";
import { provisionalTierFor } from "@/lib/level";
import { defaultLocation } from "@/content/locations";

/** The device flag's cookie, also its localStorage key. First-party, functional. */
export const QUIZ_FLAG_COOKIE = "tb_quiz";

/** About a year: long enough that a returning visitor is not asked twice. */
export const QUIZ_FLAG_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/** The labels every quiz-taker surface shares (voice.md rule 7: one name per thing). */
export const SEE_GROUPS_LABEL = "See your groups";
export const OPEN_DASHBOARD_LABEL = "Open your dashboard";
export const RETAKE_QUIZ_LABEL = "Retake the quiz";

/**
 * The link under "Retake the quiz": the quiz with `?retake=1`, which skips
 * the already-taken panel, so a taker opens the first step at once instead
 * of being told they took it and pressing Retake a second time. Keeps any
 * query the surface passes (`/intake?program=bootcamps`); idempotent.
 */
export function retakeQuizHref(href: string = "/intake"): string {
  if (/[?&]retake=/.test(href)) return href;
  return `${href}${href.includes("?") ? "&" : "?"}retake=1`;
}
export const ADD_PLAYER_LABEL = "Add another player";

/** What the device remembers about the quiz: enough to link to the matched groups, no name, no email. */
export type QuizFlag = {
  /** How many players the quiz was about. */
  playerCount: number;
  /** The first player's age band, when one was answered. */
  ageBand: AgeBand | null;
  /** The first player's provisional tier (its slug), when the quiz could name one. */
  tierSlug: string | null;
};

/**
 * The cookie value: `v1.<count>.<age>.<tier>` with blanks for what is not
 * known, e.g. `v1.1.junior.novice` or `v1.2..`. Only vocabulary words and
 * a count ever go in, so a tampered value decodes to "taken" at most.
 */
export function encodeQuizFlag(flag: QuizFlag): string {
  const count = Number.isInteger(flag.playerCount) && flag.playerCount > 0 ? flag.playerCount : 1;
  const age = flag.ageBand && isAgeBand(flag.ageBand) ? flag.ageBand : "";
  const tier = flag.tierSlug && TIERS.some((t) => t.slug === flag.tierSlug) ? flag.tierSlug : "";
  return `v1.${Math.min(count, 12)}.${age}.${tier}`;
}

/**
 * The flag a stored value describes, or null for anything that is not one
 * of ours: every part must be blank or a vocabulary word, so a tampered
 * value reads as "new", never as a half-trusted "taken".
 */
export function decodeQuizFlag(value: string | null | undefined): QuizFlag | null {
  if (!value) return null;
  const parts = value.trim().split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return null;
  const count = Number(parts[1]);
  if (!/^\d{1,2}$/.test(parts[1]) || !Number.isInteger(count) || count < 1 || count > 12) return null;
  if (parts[2] !== "" && !isAgeBand(parts[2])) return null;
  if (parts[3] !== "" && !TIERS.some((t) => t.slug === parts[3])) return null;
  return {
    playerCount: count,
    ageBand: parts[2] ? (parts[2] as AgeBand) : null,
    tierSlug: parts[3] || null,
  };
}

/** The flag the quiz writes for a submission: the first player's band and likely tier. */
export function quizFlagFor(input: {
  playerCount: number;
  ageBand?: unknown;
  /** The first player's self-estimate ("new", "rally", …), as the Sheet stores it. */
  selfLevel?: unknown;
}): QuizFlag {
  return {
    playerCount: Math.max(1, input.playerCount),
    ageBand: isAgeBand(input.ageBand) ? input.ageBand : null,
    tierSlug: provisionalTierFor(typeof input.selfLevel === "string" ? input.selfLevel : null)?.slug ?? null,
  };
}

/** The `Set-Cookie` the quiz route answers with (never HttpOnly: the page reads it). */
export function quizFlagCookie(flag: QuizFlag, opts: { secure: boolean }): {
  name: string;
  value: string;
  path: "/";
  maxAge: number;
  sameSite: "lax";
  secure: boolean;
  httpOnly: false;
} {
  return {
    name: QUIZ_FLAG_COOKIE,
    value: encodeQuizFlag(flag),
    path: "/",
    maxAge: QUIZ_FLAG_MAX_AGE_SECONDS,
    sameSite: "lax",
    secure: opts.secure,
    httpOnly: false,
  };
}

/** The flag inside a `document.cookie` string, or null. */
export function readQuizFlagFromCookies(cookieHeader: string | null | undefined): QuizFlag | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rest] = part.split("=");
    if (rawName.trim() !== QUIZ_FLAG_COOKIE) continue;
    const raw = rest.join("=").trim();
    let value = raw;
    try {
      value = decodeURIComponent(raw);
    } catch {
      // Not encoded; read as is.
    }
    return decodeQuizFlag(value);
  }
  return null;
}

// ─── Signed in: the account's own data ───────────────────────────────────────

/** The slice of a player row the account rule reads (src/lib/players.ts PlayerRecord). */
export type QuizEvidencePlayer = {
  level?: number | string | null;
  self_level?: string | null;
  age_band?: string | null;
  availability?: unknown;
  availability_source?: string | null;
};

/**
 * True when this player has been through the quiz, or past it: a quiz answer
 * on file (self-estimate or age band, migration 0009), availability the quiz
 * wrote, or a coach level (placed players are never asked again). A
 * self-estimate of "" ("Prefer not to say") is still an answer; null means
 * never asked.
 */
export function playerTookQuiz(p: QuizEvidencePlayer): boolean {
  if (hasLevel(p.level)) return true;
  if (p.self_level !== null && p.self_level !== undefined) return true;
  if (p.age_band) return true;
  if (p.availability_source === "intake" && hasAnyAvailability(p.availability)) return true;
  return false;
}

export type QuizStatus = {
  taken: boolean;
  /** Players the account (or the device flag) knows about. */
  playerCount: number;
  /** Where "See your groups" lands: the catalog filtered to the player, or the whole catalog. */
  matchedHref: string;
};

/**
 * The quiz status of a signed-in account: taken if the holder or any
 * participant has been through the quiz (a quiz taken for a child only still
 * counts for the household). The matched link follows the first player with
 * a band: a household with mixed ages gets the whole catalog.
 */
export function accountQuizStatus(players: readonly QuizEvidencePlayer[]): QuizStatus {
  const takers = players.filter(playerTookQuiz);
  if (takers.length === 0) {
    return { taken: false, playerCount: players.length, matchedHref: matchedGroupsHref(null, null) };
  }
  const bands = new Set(takers.map((p) => p.age_band).filter(isAgeBand));
  const first = takers.find((p) => isAgeBand(p.age_band));
  const ageBand = bands.size === 1 && first ? (first.age_band as AgeBand) : null;
  const tierSlug =
    takers.length === 1 && first?.self_level ? provisionalTierFor(first.self_level)?.slug ?? null : null;
  return { taken: true, playerCount: players.length, matchedHref: matchedGroupsHref(ageBand, tierSlug) };
}

// ─── Signed out: the device flag ─────────────────────────────────────────────

/** The status a device flag describes; a missing flag is "new". */
export function deviceQuizStatus(flag: QuizFlag | null): QuizStatus {
  if (!flag) return { taken: false, playerCount: 0, matchedHref: matchedGroupsHref(null, null) };
  // A household's first player carries the band; two or more players with
  // one band would still share it, so the link is only narrowed for one.
  const age = flag.playerCount === 1 ? flag.ageBand : null;
  const tier = flag.playerCount === 1 ? flag.tierSlug : null;
  return { taken: true, playerCount: flag.playerCount, matchedHref: matchedGroupsHref(age, tier) };
}

// ─── Where a quiz-taker goes next ────────────────────────────────────────────

/**
 * The catalog filtered to the player's age band and likely tier, with the
 * location named (item N: "quiz-taken 'matched groups' links should include
 * ?location=newtonbrook"). /programs itself stays canonical for everyone
 * else; this link is a personal one.
 */
export function matchedGroupsHref(ageBand: AgeBand | null, tierSlug: string | null): string {
  const params = new URLSearchParams();
  const location = defaultLocation();
  if (location) params.set("location", location.id);
  if (ageBand) params.set("age", AGE_BAND_QUERIES[ageBand].value);
  if (tierSlug && TIERS.some((t) => t.slug === tierSlug)) params.set("level", tierSlug);
  const qs = params.toString();
  return qs ? `/programs?${qs}` : "/programs";
}

export type QuizNextStep = { href: string; label: string };

/**
 * The next step that replaces a quiz prompt: a signed-in quiz-taker's
 * dashboard, a signed-out one's matched groups. Only for someone who has
 * taken it — a new visitor keeps the quiz.
 */
export function quizNextStep(status: QuizStatus, signedIn: boolean): QuizNextStep {
  if (signedIn) return { href: "/dashboard", label: OPEN_DASHBOARD_LABEL };
  return { href: status.matchedHref, label: SEE_GROUPS_LABEL };
}

/** The quiz-taker's state as the chrome needs it, from whichever source answered. */
export type QuizView =
  | { state: "unknown"; signedIn: boolean }
  | { state: "new"; signedIn: boolean }
  | ({ state: "taken"; signedIn: boolean; next: QuizNextStep } & QuizStatus);

/**
 * Fold the sources into one view. Signed in, only the account answers (a
 * device flag left by someone else in the family is ignored); signed out,
 * the device flag. `null` for a source means it has not answered yet.
 */
export function quizView(input: {
  signedIn: boolean;
  /** The account's status, null while the read is in flight or when signed out. */
  account: QuizStatus | null;
  /** The device flag, null before the browser has been asked (the server render). */
  device: QuizFlag | null | undefined;
}): QuizView {
  const { signedIn } = input;
  if (signedIn) {
    if (!input.account) return { state: "unknown", signedIn };
    return input.account.taken
      ? { state: "taken", signedIn, ...input.account, next: quizNextStep(input.account, true) }
      : { state: "new", signedIn };
  }
  if (input.device === undefined) return { state: "unknown", signedIn };
  const status = deviceQuizStatus(input.device);
  return status.taken
    ? { state: "taken", signedIn, ...status, next: quizNextStep(status, false) }
    : { state: "new", signedIn };
}
