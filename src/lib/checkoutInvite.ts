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
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    // A malformed escape (`/enroll/%ZZ/confirmed`) is not a success return;
    // the middleware must never throw over it.
    return null;
  }
}

/** What the enroll page's token gate reported, as far as checkout cares. */
export type CheckoutInviteLookup =
  | { state: "valid"; invite: { id: string } }
  | { state: "expired" | "invalid" };

/** The invite row a token resolves to, whatever its status. */
export type CheckoutInviteRow = { id: string; status: string };

/** Sent back with a 409 when the token belongs to a declined invite. */
export const DECLINED_INVITE_ERROR =
  "That invite was declined — email info@tennisbootcamp.ca for a fresh one.";

export type CheckoutInviteDecision =
  | { kind: "refuse"; status: 409; error: string }
  | { kind: "proceed"; inviteId?: string; setResumeCookie: boolean };

/**
 * What the checkout route does with the token it was sent: refuse, or send
 * Stripe an id and maybe set the browser a cookie.
 *
 * A declined invite is refused before any Stripe session exists (backlog
 * #34): no money is taken, and nothing can settle through the email fallback
 * onto a sibling's live invite. Otherwise the metadata id comes from the
 * token + cohort lookup for any status but declined: an invite that expires
 * between page load and paying must still settle onto its own row, not fall
 * back to the editable email. The cancel-return cookie is only worth setting
 * while the gate would still admit the token, so it needs the lookup to be
 * `valid`.
 */
export function checkoutInviteLink(params: {
  lookup: CheckoutInviteLookup | null;
  rowByToken: CheckoutInviteRow | null;
}): CheckoutInviteDecision {
  const { lookup, rowByToken } = params;
  if (rowByToken?.status === "declined") {
    return { kind: "refuse", status: 409, error: DECLINED_INVITE_ERROR };
  }
  const inviteId =
    lookup?.state === "valid" ? lookup.invite.id : rowByToken?.id ?? undefined;
  return {
    kind: "proceed",
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
