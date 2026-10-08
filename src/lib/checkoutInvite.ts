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
 * Backlog #34: the resume cookie is only for a *cancelled* checkout. Once
 * Stripe sends the player to the success page the token has done its job, so
 * the cookie is cleared there instead of lingering for the rest of its 24 h.
 * A browser only removes a cookie when name, path and flags match the one
 * that was set, so this mirrors `inviteResumeCookie` attribute for attribute
 * and expires it (`maxAge: 0`).
 */
export function inviteResumeClearCookie(
  cohortId: string,
  opts: { secure: boolean }
): ReturnType<typeof inviteResumeCookie> {
  return { ...inviteResumeCookie(cohortId, "", opts), maxAge: 0 };
}

/**
 * The cohort id when `pathname` is the Stripe success return
 * (`/enroll/<cohortId>/confirmed`), else null. Pages cannot set cookies, so
 * the middleware uses this to clear the resume cookie on that one path.
 */
export function enrollSuccessCohortId(pathname: string): string | null {
  const m = /^\/enroll\/([^/]+)\/confirmed\/?$/.exec(pathname);
  return m ? decodeURIComponent(m[1]) : null;
}

/**
 * Which invite row id may go into Stripe metadata for a token lookup
 * (backlog #34). A declined invite is never linked: the webhook would only
 * refuse it, so the payment instead settles through the email fallback onto
 * the email's live invite — the one sent after the decline. Invited, paid and
 * expired rows link by id as before (#30).
 */
export function inviteIdForStripe(
  row: { id: string; status: string } | null | undefined
): string | null {
  if (!row) return null;
  return row.status === "declined" ? null : row.id;
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
 * session created before the #30 deploy. A session lives 24 h and Stripe
 * retries a failed webhook delivery for up to ~3 days after that, so remove
 * the `legacyInviteToken` branch no earlier than 2026-10-12 (≥4 days after
 * the #30 deploy on 2026-10-08).
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
