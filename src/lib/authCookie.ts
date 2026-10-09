// Signed-in hint for the site chrome without the Supabase SDK (audit M40).
//
// @supabase/ssr keeps the session in a readable cookie named
// `sb-<project-ref>-auth-token`, split into `.0`, `.1`… once it grows. Its
// presence is enough for the header to choose Dashboard over the quiz CTA on
// first paint; the SDK is then loaded lazily, only for a visitor who has the
// cookie, to confirm the session and read the role. A signed-out visitor
// never downloads the SDK at all. The PKCE `-code-verifier` cookie is not a
// session and never counts.

const AUTH_COOKIE = /(?:^|;\s*)sb-[^=;\s]+-auth-token(?:\.\d+)?=([^;]*)/;

/** True when the cookie string carries a non-empty Supabase session cookie. */
export function hasAuthCookie(cookieString: string): boolean {
  const match = AUTH_COOKIE.exec(cookieString);
  return Boolean(match && match[1].trim().length > 0);
}
