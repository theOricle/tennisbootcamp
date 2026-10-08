// Backlog #30: the invite token never leaves this origin for Stripe.
//
// Before, `cancel_url` carried `?invite=<token>` and the session metadata
// carried `inviteToken`, so the bearer secret for a private cohort sat in
// Stripe's dashboard, logs and webhook payloads. Now Stripe only ever sees the
// invite row id (a plain identifier that unlocks nothing on its own), and the
// token survives a cancelled checkout in a short-lived httpOnly cookie that
// the enroll page reads when the URL has no `?invite`.

/** Where Stripe sends the player back. Neither URL carries the token. */
export function enrollReturnUrls(params: {
  origin: string;
  cohortId: string;
  enrollmentRowNumber: number;
  playerCount: number;
  hasInvite: boolean;
}): { successUrl: string; cancelUrl: string } {
  const { origin, cohortId, enrollmentRowNumber, playerCount, hasInvite } = params;
  const successUrl =
    `${origin}/enroll/${cohortId}/confirmed?row=${enrollmentRowNumber}` +
    (playerCount > 1 ? `&players=${playerCount}` : "") +
    (hasInvite ? "&invite=1" : "");
  const cancelUrl = `${origin}/enroll/${cohortId}`;
  return { successUrl, cancelUrl };
}

/** The cookie that lets a cancelled checkout land back on the invited page. */
export const INVITE_RESUME_COOKIE = "tb_invite";

/** Stripe keeps a Checkout session open for 24 hours; the cookie matches. */
export const INVITE_RESUME_MAX_AGE_SECONDS = 24 * 60 * 60;

export function inviteResumeCookie(
  cohortId: string,
  token: string,
  opts: { secure: boolean }
): {
  name: string;
  value: string;
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: string;
  maxAge: number;
} {
  return {
    name: INVITE_RESUME_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: opts.secure,
    // Scoped to this cohort's enroll page only; the page still validates the
    // token against the cohort before admitting anyone.
    path: `/enroll/${cohortId}`,
    maxAge: INVITE_RESUME_MAX_AGE_SECONDS,
  };
}

/**
 * How the webhook finds the invite a payment belongs to. New sessions carry
 * `inviteId`; a session created before this deploy still carries the token
 * and settles the old way until it expires.
 */
export function inviteLinkFromMetadata(
  metadata: Record<string, string> | null | undefined
): { inviteId?: string; legacyInviteToken?: string } {
  const inviteId = (metadata?.inviteId ?? "").trim();
  if (inviteId) return { inviteId };
  const legacyInviteToken = (metadata?.inviteToken ?? "").trim();
  if (legacyInviteToken) return { legacyInviteToken };
  return {};
}
