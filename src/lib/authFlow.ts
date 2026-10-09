// The sign-in contract shared by the login page, the auth callback and every
// page that sends a signed-out visitor to /login (audit M20, L21). Pure and
// client-safe — the login page is a client component — and pinned by
// src/scripts/test-enroll-access.ts.

/** Where a sign-in lands when nothing asked for a specific page. */
export const AFTER_LOGIN_DEFAULT = "/dashboard";

/**
 * The one `?next=` a sign-in may follow: a site-relative path. Another
 * origin, a scheme, a protocol-relative `//host`, a backslash, whitespace or
 * control characters, or a page that would only send the player round again
 * (/login, /auth/*) all fall back to the dashboard — a crafted link can never
 * walk a signed-in player off the site or into a loop.
 */
export function safeNextPath(raw: string | null | undefined): string {
  const value = (raw ?? "").trim();
  if (!value.startsWith("/")) return AFTER_LOGIN_DEFAULT;
  if (value.startsWith("//") || value.startsWith("/\\")) return AFTER_LOGIN_DEFAULT;
  if (/[\s\\\u0000-\u001f\u007f]/.test(value)) return AFTER_LOGIN_DEFAULT;
  if (/^\/login(?:[/?#]|$)/.test(value) || value.startsWith("/auth/")) {
    return AFTER_LOGIN_DEFAULT;
  }
  return value;
}

/**
 * The login URL a protected page redirects to, remembering where the visitor
 * was going. The default destination needs no parameter.
 */
export function loginHref(next?: string | null): string {
  const path = safeNextPath(next);
  return path === AFTER_LOGIN_DEFAULT ? "/login" : `/login?next=${encodeURIComponent(path)}`;
}

// ─── Auth callback → /login?error=<code> ─────────────────────────────────────
// The callback never forwards Supabase's own message: a code goes in the URL
// and the login page owns the words.

export type CallbackError = "link_expired" | "link_failed";

export const CALLBACK_ERROR_COPY: Record<CallbackError, string> = {
  /** verifyOtp refused the token: the link was used, or its window closed. */
  link_expired: "That link has expired or was already used. Send yourself a new one.",
  /** The PKCE exchange (or an unknown failure) did not produce a session. */
  link_failed:
    "That link didn't sign you in. Send yourself a new one, or email info@tennisbootcamp.ca.",
};

export function isCallbackError(code: string): code is CallbackError {
  return code === "link_expired" || code === "link_failed";
}

/**
 * The code the callback sends for a Supabase refusal. verifyOtp answers a
 * used or stale token with 403 and "Token has expired or is invalid"; the
 * verify endpoint's wording is "Email link is invalid or has expired". Those
 * are the expired case. Anything else — a 5xx, a PKCE exchange that produced
 * no session, a misconfiguration such as "Invalid API key" or "invalid JWT"
 * — is reported as a failed link, so "expired" is never claimed for an
 * outage. The wording match is exact phrases, not loose words: "invalid" on
 * its own would turn a bad key into "that link has expired".
 */
export function callbackErrorFor(error: {
  status?: number | null;
  message?: string | null;
}): CallbackError {
  if (error.status === 403) return "link_expired";
  if (/token has expired|invalid or has expired|already (been )?used/i.test(error.message ?? "")) {
    return "link_expired";
  }
  return "link_failed";
}

/**
 * The notice the login page shows for `?error=`: the code's copy, the
 * generic line for anything unrecognised (never the raw value), nothing when
 * the parameter is absent or blank.
 */
export function callbackNotice(code: string | null | undefined): string | null {
  const value = (code ?? "").trim();
  if (!value) return null;
  return isCallbackError(value) ? CALLBACK_ERROR_COPY[value] : CALLBACK_ERROR_COPY.link_failed;
}

// ─── Sign-in errors → plain copy ─────────────────────────────────────────────
// Supabase's messages ("Invalid login credentials") name the mechanism, not
// the way out. Each one maps to what is wrong and the one thing to do next,
// with the inbox as the human fallback (voice.md: every submit failure
// offers info@); the mismatch line's way out is "Forgot password?", which
// the inbox cannot improve on. Anything unrecognised gets the generic line,
// never the raw text.

export const LOGIN_ERROR_COPY = {
  credentials:
    "That email and password don't match. Check both, or use “Forgot password?” to set a new one.",
  unconfirmed:
    "That email isn't confirmed yet. Use “Forgot password?” and we'll send you a fresh link, or email info@tennisbootcamp.ca.",
  rateLimited:
    "Too many tries in a row. Wait a minute, then try again, or email info@tennisbootcamp.ca.",
  network:
    "Couldn't reach the sign-in service. Check your connection and try again, or email info@tennisbootcamp.ca.",
  generic: "Couldn't sign you in. Try again, or email info@tennisbootcamp.ca.",
} as const;

export function loginErrorMessage(raw: string | null | undefined): string {
  const message = (raw ?? "").trim();
  if (/invalid login credentials|invalid_credentials|invalid credentials/i.test(message)) {
    return LOGIN_ERROR_COPY.credentials;
  }
  if (/email not confirmed|email_not_confirmed/i.test(message)) {
    return LOGIN_ERROR_COPY.unconfirmed;
  }
  if (/too many|rate limit|over_request_rate_limit|\b429\b/i.test(message)) {
    return LOGIN_ERROR_COPY.rateLimited;
  }
  if (/failed to fetch|network|fetch failed|load failed/i.test(message)) {
    return LOGIN_ERROR_COPY.network;
  }
  return LOGIN_ERROR_COPY.generic;
}
