// The /api/auth/reset-password gate (backlog #29): one pure decision the
// route makes before it asks Supabase for a recovery link or Resend to send
// it. Same shape as src/lib/intakeGuard.ts.
//
//   drop    → a bot. The route answers RESET_RESPONSE and does nothing else.
//   reject  → a malformed request (no usable email). The route answers 400.
//   accept  → a real request; `email` is trimmed, capped and format-checked.
//
// The route's answer never depends on whether an account exists: a known
// address, an unknown address, a Supabase error, a Resend error and a bot
// all get the same RESET_RESPONSE. Only the request's *shape* can earn a 400,
// and the form's `type="email" required` input never produces one.
//
// Timing (backlog #36): the route answers RESET_RESPONSE *before* it looks
// the address up, asks Supabase for a link or sends anything — that work runs
// in Next's `after()` once the response is out. A known address used to wait
// on generateLink plus the Resend send while an unknown one returned as soon
// as generateLink failed, which made the response time an account-existence
// oracle. Now every non-400 path returns in comparable time.
//
// Per-address cooldown (backlog #36): Supabase Auth stamps
// `auth.users.recovery_sent_at` whenever a recovery link is generated, and
// the admin API returns it on the user. Inside RESET_COOLDOWN_MS of that
// stamp the route skips the send and says nothing — the response is the
// same RESET_RESPONSE either way. No table, no KV, no in-memory map (which a
// serverless burst would spread across instances anyway). The cooldown only
// ever *skips* a send: a lookup that errors or finds no user falls through
// to generateLink exactly as before, so a real reset is never lost to it.
//
// Pure (no I/O, no Next.js imports) so src/scripts/test-reset-guard.ts can
// pin every rule.

import {
  checkBot,
  cleanText,
  isValidEmail,
  TEXT_LIMITS,
  type BotReason,
} from "@/lib/botCheck";

/** The one body every non-400 path answers with, success and drop alike. */
export const RESET_RESPONSE = { ok: true } as const;

/** The 400 message when the body carries no usable email. */
export const RESET_INVALID_EMAIL = "Please provide a valid email.";

/** The route's logs name a reason, never an address. */
export const RESET_LOG_ROUTE = "reset-password";

export type ResetDecision =
  | { action: "drop"; reason: BotReason }
  | { action: "reject"; status: 400; error: string }
  | { action: "accept"; email: string };

/**
 * The bot check decides first — a script posting `{ email }` with no fill
 * time is dropped, never told its email was fine or not — then the email's
 * shape. A drop or an accept carries no field a log line could leak.
 */
export function decideReset(body: unknown): ResetDecision {
  const verdict = checkBot(body);
  if (verdict.bot) return { action: "drop", reason: verdict.reason };

  const raw =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>).email
      : undefined;
  const email = cleanText(raw, TEXT_LIMITS.email);
  if (!isValidEmail(email)) {
    return { action: "reject", status: 400, error: RESET_INVALID_EMAIL };
  }
  return { action: "accept", email };
}

// ─── Cooldown (backlog #36) ──────────────────────────────────────────────────

/** How long after a recovery link was last generated the route stays quiet. */
export const RESET_COOLDOWN_MS = 60_000;

/**
 * True when `recoverySentAt` (Supabase's ISO stamp, or nothing) is less than
 * RESET_COOLDOWN_MS before `now`. Missing or unparseable → false, so an
 * account that was never sent a link, or a shape we don't recognise, is
 * never silently skipped. A stamp *ahead* of `now` (clock skew) counts as
 * inside the window — it cannot have been a minute ago.
 */
export function withinResetCooldown(
  recoverySentAt: string | null | undefined,
  now: number = Date.now()
): boolean {
  if (typeof recoverySentAt !== "string" || recoverySentAt === "") return false;
  const sent = Date.parse(recoverySentAt);
  if (Number.isNaN(sent)) return false;
  return now - sent < RESET_COOLDOWN_MS;
}

/**
 * The user in `users` whose email matches `email` (trimmed, case-insensitive
 * — the same rule as findAuthUserByEmail in src/lib/supabase/adminUsers.ts,
 * which the route itself now uses so the match pages past 200 users), or
 * undefined.
 */
export function findUserByEmail<T extends { email?: string | null }>(
  users: readonly T[],
  email: string
): T | undefined {
  const target = email.trim().toLowerCase();
  if (!target) return undefined;
  return users.find((u) => (u.email ?? "").trim().toLowerCase() === target);
}
