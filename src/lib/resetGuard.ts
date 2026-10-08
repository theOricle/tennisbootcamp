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
// No per-address cooldown. Vercel runs this route as a serverless function,
// so an in-memory map lives and dies with one instance and a burst spreads
// across many — it would cost code and give nothing. A cooldown that works
// needs shared state (a table or KV), which is out of scope here; Supabase
// Auth's own `recovery_sent_at` is the cheap place to put one later.
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
