// The second step of the coach's sign-in (backlog #92): a 6-digit code from an
// authenticator app (Supabase MFA, TOTP). Pure and client-safe: the rules, the
// paths, the field's rule, the words and the two small flows the pages run.
// Pinned by src/scripts/test-sign-in-code.ts.
//
// The admin account opens every admin page (players' details, bookings,
// payment marks), so it counts as an admin only on a session that has passed
// the code (AAL2). Players and parents hold no factor and see no change.

import { AFTER_LOGIN_DEFAULT, loginHref, safeNextPath } from "@/lib/authFlow";

// ─── Paths ───────────────────────────────────────────────────────────────────

/** The code page: one field, for a session that still owes its code. */
export const CODE_PATH = "/login/code";
/** The one-time set-up page, for an admin with no authenticator app yet. */
export const CODE_SETUP_PATH = "/login/code/setup";
/** Where a finished set-up lands when nothing asked for a specific page. */
export const AFTER_SETUP_DEFAULT = "/admin";

/** The code page's URL, remembering where the visitor was going. */
export function codeHref(next?: string | null): string {
  const path = safeNextPath(next);
  return path === AFTER_LOGIN_DEFAULT ? CODE_PATH : `${CODE_PATH}?next=${encodeURIComponent(path)}`;
}

/** The `next` the set-up page follows: a safe site path, or the admin home. */
export function setupNextPath(raw: string | null | undefined): string {
  return (raw ?? "").trim() ? safeNextPath(raw) : AFTER_SETUP_DEFAULT;
}

/** The set-up page's URL, remembering where the visitor was going. */
export function setupHref(next?: string | null): string {
  const path = setupNextPath(next);
  return path === AFTER_SETUP_DEFAULT
    ? CODE_SETUP_PATH
    : `${CODE_SETUP_PATH}?next=${encodeURIComponent(path)}`;
}

// ─── The rules ───────────────────────────────────────────────────────────────

export type AssuranceLevel = "aal1" | "aal2";

/** The part of a Supabase factor the rules read. */
export type FactorLike = {
  id: string;
  factor_type?: string | null;
  status?: string | null;
};

/** The authenticator-app factor that has been confirmed with a code, if any. */
export function verifiedTotpFactor(
  factors: readonly FactorLike[] | null | undefined
): FactorLike | null {
  return (
    (factors ?? []).find((f) => f.factor_type === "totp" && f.status === "verified") ?? null
  );
}

/** Factors left over from a set-up that was started and never finished. */
export function unverifiedFactorIds(factors: readonly FactorLike[] | null | undefined): string[] {
  return (factors ?? []).filter((f) => f.status !== "verified").map((f) => f.id);
}

export type AdminGate = "ok" | "needs_code" | "needs_setup" | "refused";

/**
 * The one decision behind every admin page and admin API.
 *
 *   refused      not an admin: nothing here is theirs, whatever the session.
 *   needs_setup  an admin with no confirmed authenticator app.
 *   needs_code   an admin with one, on a session that has not passed it.
 *   ok           an admin with one, on a session that has (AAL2).
 *
 * Only "ok" is an admin. A level that could not be read counts as not passed,
 * and an AAL2 claim with no confirmed factor behind it (the factor was
 * removed after the code was entered) is sent to set-up, never let through.
 */
export function adminGate(input: {
  role: string | null | undefined;
  aal: AssuranceLevel | null | undefined;
  hasVerifiedTotp: boolean;
}): AdminGate {
  if (input.role !== "admin") return "refused";
  if (!input.hasVerifiedTotp) return "needs_setup";
  return input.aal === "aal2" ? "ok" : "needs_code";
}

/**
 * Where a request the gate did not let through is sent, keeping the page it
 * asked for: signed out to /login, an admin who owes a code to the code page,
 * an admin with no authenticator app to the set-up page, and a signed-in
 * non-admin to the dashboard (never back to a sign-in they have already
 * done). "ok" has nowhere to be sent; it gets the dashboard, so a caller that
 * asks by mistake cannot be looped.
 */
export function adminRefusedHref(gate: AdminGate | "signed_out", path: string): string {
  if (gate === "signed_out") return loginHref(path);
  if (gate === "needs_code") return codeHref(path);
  if (gate === "needs_setup") return setupHref(path);
  return AFTER_LOGIN_DEFAULT;
}

/**
 * A signed-in session owes its code when the account can reach AAL2 (it holds
 * a confirmed factor) and the session has not. An account with no factor
 * never does, so players and parents go straight through.
 */
export function needsCodeStep(
  levels:
    | { currentLevel?: string | null; nextLevel?: string | null }
    | null
    | undefined
): boolean {
  return levels?.nextLevel === "aal2" && levels.currentLevel !== "aal2";
}

/** Where a fresh sign-in goes: the code page first when the session owes it. */
export function afterSignInPath(
  levels: Parameters<typeof needsCodeStep>[0],
  next: string | null | undefined
): string {
  return needsCodeStep(levels) ? codeHref(next) : safeNextPath(next);
}

// ─── The 6-digit field ───────────────────────────────────────────────────────

export const CODE_LENGTH = 6;

/** What the field keeps of what was typed or pasted: digits only, six at most. */
export function cleanCode(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\D/g, "").slice(0, CODE_LENGTH);
}

/** Exactly six digits, nothing else. */
export function isCompleteCode(code: string | null | undefined): boolean {
  return /^\d{6}$/.test(code ?? "");
}

// ─── The words ───────────────────────────────────────────────────────────────

/** The name the authenticator app shows beside the code. */
export const CODE_ISSUER = "Tennis Bootcamp";

export const CODE_COPY = {
  codeTitle: "Enter your sign-in code",
  codeLine: "Open your authenticator app and enter the 6-digit code for Tennis Bootcamp.",
  codeButton: "Sign in",

  setupTitle: "Set up your sign-in code",
  setupLine: "You do this once. After that, each new sign-in takes your password and a code from the app.",
  setupScanStep: "Scan this with an authenticator app",
  setupKeyLine: "On your phone, or can't scan? Type this key into the app instead.",
  setupKeyLabel: "Set-up key",
  setupKeyHint:
    "Save this key in a password manager, or add it to a second device now. We won't show it again.",
  setupCodeStep: "Enter the 6-digit code the app shows",
  setupButton: "Finish set-up",
  setupStarting: "Getting your set-up ready…",
  setupQrAlt: "QR code to scan with your authenticator app",

  fieldLabel: "6-digit code",
  checking: "Checking…",
  tryAgain: "Try again",
  signInAgain: "Sign in again →",

  incomplete: "Enter the 6 digits from your app.",
  wrong: "That code didn't match. Enter the newest code from your app.",
  expired: "That code expired. Enter the newest code from your app.",
  rateLimited: "Too many tries in a row. Wait a minute, then try again, or email info@tennisbootcamp.ca.",
  signedOut: "Your sign-in timed out. Sign in again, or email info@tennisbootcamp.ca.",
  setupStale: "This set-up timed out. Start it again, or email info@tennisbootcamp.ca.",
  setupFailed: "Couldn't start the set-up. Try again, or email info@tennisbootcamp.ca.",
  generic: "Couldn't check the code. Try again, or email info@tennisbootcamp.ca.",
} as const;

export type CodeErrorKind =
  | "wrong"
  | "expired"
  | "rateLimited"
  | "signedOut"
  | "setupStale"
  | "generic";

export type MfaErrorLike = {
  code?: string | null;
  message?: string | null;
  status?: number | null;
} | null;

/**
 * Supabase's refusal as one of our kinds. Its own words never reach the page:
 * each kind has its line in CODE_COPY, and anything unrecognised is generic.
 */
export function codeErrorKind(error: MfaErrorLike): CodeErrorKind {
  const code = (error?.code ?? "").toLowerCase();
  const message = (error?.message ?? "").toLowerCase();
  if (code === "mfa_challenge_expired" || /challenge.*expired/.test(message)) return "expired";
  if (code === "mfa_verification_failed" || /invalid totp code/.test(message)) return "wrong";
  if (
    code === "over_request_rate_limit" ||
    error?.status === 429 ||
    /too many|rate limit/.test(message)
  ) {
    return "rateLimited";
  }
  if (code === "mfa_factor_not_found" || /factor not found/.test(message)) return "setupStale";
  if (
    code === "session_not_found" ||
    code === "session_expired" ||
    code === "no_authorization" ||
    code === "bad_jwt" ||
    /session missing|session.*expired|session.*not found/.test(message)
  ) {
    return "signedOut";
  }
  return "generic";
}

export function codeErrorMessage(kind: CodeErrorKind): string {
  return CODE_COPY[kind];
}

// ─── The set-up key and the QR ───────────────────────────────────────────────

/** The key in fours, so it can be read across to a phone without losing place. */
export function secretGroups(secret: string | null | undefined): string[] {
  const clean = (secret ?? "").replace(/\s+/g, "").toUpperCase();
  return clean.match(/.{1,4}/g) ?? [];
}

const SVG_DATA_PREFIX = "data:image/svg+xml;utf-8,";

/**
 * Supabase hands the QR over as an SVG data URL with the markup unescaped.
 * It is re-encoded so a "#" inside it can never cut the image short, and
 * anything that is not that SVG data URL is not drawn at all.
 */
export function qrImageSrc(qr: string | null | undefined): string | null {
  const value = qr ?? "";
  if (!value.startsWith(SVG_DATA_PREFIX)) return null;
  const svg = value.slice(SVG_DATA_PREFIX.length).trim();
  if (!svg.startsWith("<svg")) return null;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// ─── The two flows ───────────────────────────────────────────────────────────

/** The part of `supabase.auth.mfa` the pages use (a test passes its own). */
export interface MfaLike {
  listFactors(): Promise<{ data: { all: FactorLike[] } | null; error: MfaErrorLike }>;
  unenroll(params: { factorId: string }): Promise<{ error: MfaErrorLike }>;
  enroll(params: { factorType: "totp"; issuer?: string }): Promise<{
    data: { id: string; totp: { qr_code: string; secret: string } } | null;
    error: MfaErrorLike;
  }>;
  challenge(params: { factorId: string }): Promise<{
    data: { id: string } | null;
    error: MfaErrorLike;
  }>;
  verify(params: { factorId: string; challengeId: string; code: string }): Promise<{
    error: MfaErrorLike;
  }>;
}

export type SetupStart =
  | { ok: true; factorId: string; qr: string | null; secret: string }
  | { ok: false };

/**
 * Start a set-up: clear what an abandoned attempt left behind (a second
 * enrollment is refused while one is pending), then enroll a fresh factor.
 * A confirmed factor is never touched here.
 */
export async function startSetup(mfa: MfaLike): Promise<SetupStart> {
  try {
    const listed = await mfa.listFactors();
    if (listed.error || !listed.data) return { ok: false };
    for (const factorId of unverifiedFactorIds(listed.data.all)) {
      const removed = await mfa.unenroll({ factorId });
      if (removed.error) return { ok: false };
    }
    const enrolled = await mfa.enroll({ factorType: "totp", issuer: CODE_ISSUER });
    if (enrolled.error || !enrolled.data?.id || !enrolled.data.totp?.secret) return { ok: false };
    return {
      ok: true,
      factorId: enrolled.data.id,
      qr: qrImageSrc(enrolled.data.totp.qr_code),
      secret: enrolled.data.totp.secret,
    };
  } catch {
    return { ok: false };
  }
}

export type CodeResult = { ok: true } | { ok: false; kind: CodeErrorKind };

/**
 * Check one code against one factor: a fresh challenge, then the code. The
 * challenge is made at the moment of pressing the button, so it cannot go
 * stale while the page sits open. Only six digits are ever sent.
 */
export async function submitCode(mfa: MfaLike, factorId: string, code: string): Promise<CodeResult> {
  if (!isCompleteCode(code)) return { ok: false, kind: "wrong" };
  try {
    const challenge = await mfa.challenge({ factorId });
    if (challenge.error || !challenge.data?.id) {
      return { ok: false, kind: codeErrorKind(challenge.error) };
    }
    const verified = await mfa.verify({ factorId, challengeId: challenge.data.id, code });
    if (verified.error) return { ok: false, kind: codeErrorKind(verified.error) };
    return { ok: true };
  } catch {
    return { ok: false, kind: "generic" };
  }
}
