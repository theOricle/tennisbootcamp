// What actually happened to an email, in words a human can act on.
//
// The Resend SDK resolves with `{ data, error }` — a rejected send does NOT
// throw (see src/lib/email.ts). Everything here is pure so the admin screen
// and src/scripts/test-invite-delivery.ts can share one source of truth for
// what the coach is told after pressing "Send invites".

export type ResendErrorLike = {
  name?: string | null;
  statusCode?: number | null;
  message?: string | null;
};

/** One line naming the provider's refusal, for a log or an admin notice. */
export function formatResendError(error: ResendErrorLike | null | undefined): string {
  if (!error) return "unknown error";
  const parts = [error.name?.trim(), error.statusCode != null ? `HTTP ${error.statusCode}` : ""]
    .filter((p): p is string => Boolean(p))
    .join(" ");
  const message = error.message?.trim();
  if (parts && message) return `${parts}: ${message}`;
  return message || parts || "unknown error";
}

export type InviteOutcome = {
  /** Invite rows written (a seat is held for each). */
  created: number;
  /** Of those, how many the provider actually accepted. */
  emailed: number;
  errors: string[];
};

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * The notice under the invite box. It must never claim an email went out that
 * didn't — that was the bug: every send reported success, so a cohort could
 * sit "invited" with nobody having heard from us.
 */
export function inviteNotice(outcome: InviteOutcome): string {
  const { created, emailed, errors } = outcome;
  const tail = errors.length > 0 ? ` ${errors.join(" ")}` : "";

  if (created === 0) {
    return `No invites went out.${tail}`.trim();
  }
  if (emailed === created && errors.length === 0) {
    return `Sent ${plural(created, "invite", "invites")}.`;
  }
  if (emailed === 0) {
    return (
      `Held ${plural(created, "spot", "spots")}, but no email went out.` + tail
    ).trim();
  }
  return (
    `Held ${plural(created, "spot", "spots")} · emailed ${emailed}.` + tail
  ).trim();
}
