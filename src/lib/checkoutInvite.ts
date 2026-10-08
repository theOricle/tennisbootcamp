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

/** What the enroll page's token gate reported, as far as checkout cares. */
export type CheckoutInviteLookup =
  | { state: "valid"; invite: { id: string } }
  | { state: "expired" | "invalid" };

/**
 * What the checkout route sends Stripe and sets on the browser for an invite.
 *
 * The metadata id comes from the token + cohort lookup regardless of status
 * (`idByToken`): an invite that expires between page load and paying must
 * still settle onto its own row, not fall back to the editable email. The
 * cancel-return cookie is only worth setting while the gate would still admit
 * the token, so it needs the lookup to be `valid`.
 */
export function checkoutInviteLink(params: {
  lookup: CheckoutInviteLookup | null;
  idByToken: string | null;
}): { inviteId?: string; setResumeCookie: boolean } {
  const { lookup, idByToken } = params;
  const inviteId =
    lookup?.state === "valid" ? lookup.invite.id : idByToken ?? undefined;
  return {
    inviteId,
    setResumeCookie: lookup?.state === "valid",
  };
}

/**
 * How the webhook finds the invite a payment belongs to. New sessions carry
 * `inviteId`. The `inviteToken` read is legacy: it only serves a Stripe
 * session created before this deploy, and Stripe sessions live 24 h — remove
 * the `legacyInviteToken` branch after 2026-10-10 (24 h after deploy).
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
