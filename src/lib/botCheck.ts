// Bot protection for the four public forms (backlog #25): /api/intake,
// /api/newsletter, /api/program-interest and /api/assessment/book.
//
// Two signals, no external service, no CAPTCHA:
//   • a honeypot — a visually hidden text field a person never sees or fills,
//     but a form-filling bot does;
//   • a minimum fill time — the form reports how long it has been on screen,
//     and anything under MIN_FILL_TIME_MS is not a person.
//
// A tripped check is a silent drop: the route answers exactly as it would for
// a real submission and writes and sends nothing. Pure module (no I/O, no
// Next.js imports) so src/scripts/test-bot-check.ts can pin every rule.

/** Request-body key of the honeypot. Named like a real field so bots fill it. */
export const HONEYPOT_FIELD = "website";

/** Request-body key of the fill time: milliseconds since the form rendered. */
export const FILL_TIME_FIELD = "fillTime";

/** A submission that arrives less than this long after render is a bot. */
export const MIN_FILL_TIME_MS = 2000;

/** Request bodies over this many bytes are refused with a 400. */
export const MAX_BODY_BYTES = 20 * 1024;

/** The 400 body for an oversized request. */
export const REQUEST_TOO_LARGE = "Request too large.";

export type BotReason = "honeypot" | "too_fast" | "no_fill_time";

export type BotVerdict = { bot: false } | { bot: true; reason: BotReason };

function asRecord(body: unknown): Record<string, unknown> {
  return body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};
}

/**
 * The bot decision, from nothing but the request body. No fill time at all
 * counts as a bot: a script posting raw JSON never sends one, and that script
 * is exactly what this guards against. Every form in the repo sends it.
 */
export function checkBot(body: unknown): BotVerdict {
  const b = asRecord(body);

  const honeypot = b[HONEYPOT_FIELD];
  if (typeof honeypot === "string" ? honeypot.trim() !== "" : honeypot != null) {
    return { bot: true, reason: "honeypot" };
  }

  const fillTime = b[FILL_TIME_FIELD];
  const ms = typeof fillTime === "number" ? fillTime : Number.NaN;
  if (!Number.isFinite(ms)) return { bot: true, reason: "no_fill_time" };
  if (ms < MIN_FILL_TIME_MS) return { bot: true, reason: "too_fast" };

  return { bot: false };
}

/**
 * The body without the two protection fields, so nothing downstream (the
 * Sheet row, the booking, the email) ever sees them. Every other key passes
 * through untouched.
 */
export function stripBotFields<T>(body: T): T {
  if (!body || typeof body !== "object" || Array.isArray(body)) return body;
  const rest = { ...(body as Record<string, unknown>) };
  delete rest[HONEYPOT_FIELD];
  delete rest[FILL_TIME_FIELD];
  return rest as T;
}

/** One log line per dropped submission. Never includes the body. */
export function logBotDrop(route: string, reason: BotReason): void {
  console.warn(`[bot-check] dropped ${route} submission (${reason})`);
}

/** True when a raw request body (or its declared length) exceeds the cap. */
export function bodyTooLarge(raw: string, contentLength?: string | null): boolean {
  const declared = contentLength == null ? Number.NaN : Number(contentLength);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return true;
  return new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES;
}

// ─── Input limits ─────────────────────────────────────────────────────────────

/** Caps for the free-text fields the four routes accept, in characters. */
export const TEXT_LIMITS = {
  name: 120,
  email: 254,
  phone: 40,
  short: 80, // who, level, source, program, relationship, age band, slot ids
  area: 200,
  note: 1000,
} as const;

/**
 * A string field trimmed and capped. Anything that is not a string comes back
 * unchanged, so a route's existing `?? ""` / `String(...)` handling still sees
 * exactly what it saw before.
 */
export function cleanText<T>(value: T, max: number): T | string {
  return typeof value === "string" ? value.trim().slice(0, max) : value;
}

/** Same rule the booking route and both wizards already use. */
export function isValidEmail(email: unknown): email is string {
  return (
    typeof email === "string" &&
    email.length <= TEXT_LIMITS.email &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  );
}
