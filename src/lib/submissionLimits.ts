// Limits on repeated submissions to the public forms (backlog #84, part 6;
// audit follow-up, owner 2026-11-14).
//
// The bot check (src/lib/botCheck.ts) trusts the browser: a script that sends
// an empty honeypot and a fill time passes it. These limits count what
// actually arrived, per network address and per email, so a script cannot
// fill the Sheet, hold every slot or spend the day's 100 transactional
// emails, and nobody can bury one inbox.
//
// The numbers, and why (stated in the pull request too):
//   - per address, per form: 10 an hour, 30 a day;
//   - per email, per form: 5 an hour, 10 a day;
//   - across the three forms that send our email (the quiz, the booking, the
//     e-transfer), 12 a day per address and 12 a day per email.
// A family entering two children separately on every form and retrying each
// once sends 4 per form: inside every limit, the 12 a day across the email
// forms included. A script on one address gets 12 email-sending submissions
// a day, at most 3 emails each: 36, well under the 100.
//
// Pure: the counting and the hashing. The table reads and writes live in
// src/lib/submissionLimitsDb.ts; src/scripts/test-submission-limits.ts pins
// the rules.

import { createHmac } from "node:crypto";

export const LIMIT_SCOPES = [
  "intake",
  "book",
  "enroll",
  "checkout",
  "etransfer",
  "newsletter",
  "interest",
] as const;
export type LimitScope = (typeof LIMIT_SCOPES)[number];

/** The forms whose submissions send our own (transactional) email. */
export const MAIL_SCOPES: readonly LimitScope[] = ["intake", "book", "etransfer"];

export const LIMITS = {
  perAddress: { hour: 10, day: 30 },
  perEmail: { hour: 5, day: 10 },
  mail: { addressDay: 12, emailDay: 12 },
} as const;

const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

/**
 * The 429 a refused submission answers: what to do, and the inbox — never
 * which limit, how many, or when it lifts.
 */
export const SUBMISSION_LIMIT_ERROR =
  "Too many tries in a short time. Please wait a while and try again, or email info@tennisbootcamp.ca.";

/** One counted submission, as stored: a keyed hash, the form, the time. */
export type LimitHit = { keyHash: string; scope: LimitScope | string; createdAt: string };

/**
 * The keyed hash stored for a network address or an email: HMAC-SHA256 with
 * a secret the server already holds, over the kind and the value. Neither the
 * address nor the email is ever stored; the same value always gives the same
 * hash, so it can be counted.
 */
export function limitKeyHash(secret: string, kind: "address" | "email", value: string): string {
  return createHmac("sha256", secret).update(`tb-submission-limits:v1:${kind}:${value}`).digest("hex");
}

/**
 * The client's network address as Vercel reports it: the first entry of
 * x-forwarded-for (Vercel sets it from the connection), else x-real-ip, else
 * "unknown" — every such request then shares one bucket.
 */
export function clientAddress(headers: { get(name: string): string | null }): string {
  const forwarded = (headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim();
  if (forwarded) return forwarded.toLowerCase();
  const real = (headers.get("x-real-ip") ?? "").trim();
  return real ? real.toLowerCase() : "unknown";
}

/**
 * Whether one more submission to `scope` fits, given the hits recorded for
 * its two keys over the last day. A refusal is never recorded, so retrying
 * while refused never pushes the end of the wait further out.
 */
export function limitVerdict(input: {
  scope: LimitScope;
  addressHash: string;
  emailHash: string | null;
  hits: readonly LimitHit[];
  now: number;
}): { allowed: boolean } {
  const hourAgo = input.now - HOUR_MS;
  const dayAgo = input.now - DAY_MS;
  const count = (hash: string, scopes: readonly string[], since: number) =>
    input.hits.filter(
      (h) => h.keyHash === hash && scopes.includes(h.scope) && Date.parse(h.createdAt) > since
    ).length;

  const own = [input.scope];
  if (count(input.addressHash, own, hourAgo) >= LIMITS.perAddress.hour) return { allowed: false };
  if (count(input.addressHash, own, dayAgo) >= LIMITS.perAddress.day) return { allowed: false };
  if (input.emailHash) {
    if (count(input.emailHash, own, hourAgo) >= LIMITS.perEmail.hour) return { allowed: false };
    if (count(input.emailHash, own, dayAgo) >= LIMITS.perEmail.day) return { allowed: false };
  }
  if (MAIL_SCOPES.includes(input.scope)) {
    if (count(input.addressHash, MAIL_SCOPES, dayAgo) >= LIMITS.mail.addressDay) return { allowed: false };
    if (input.emailHash && count(input.emailHash, MAIL_SCOPES, dayAgo) >= LIMITS.mail.emailDay) {
      return { allowed: false };
    }
  }
  return { allowed: true };
}

/** The table is not there yet: migration 0011 has not run. */
export function isMissingTable(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!error) return false;
  return error.code === "PGRST205" || error.code === "42P01";
}
