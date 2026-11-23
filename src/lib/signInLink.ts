// The sign-in link a signed-in account asks for when an assessment booked
// under its address is not on the account yet (backlog #84, safety review).
//
// A booking made signed out links to its account only when the address owner
// signs in through an emailed link, which proves the mailbox. A password
// session does not, so the dashboard and the sign-up page name the waiting
// $20 and offer this link; opening it links the booking, and the credit then
// applies whatever name was typed on the booking.
//
// The link goes to the account's own address and to nothing typed. It is sent
// only while a credit waits, at most once a minute and five times a day.
//
// Pure and client-safe: the words the note shows, and the send rule. The
// route is src/app/api/auth/sign-in-link/route.ts.

/** Why the $20 is not on the account yet. */
export const CREDIT_WAITING_LEAD =
  "Your $20 assessment was booked with this email while you were signed out, so it isn't on your account yet.";

/** What to do about it, by page: the dashboard, and the sign-up page's price. */
export const CREDIT_WAITING_STEP = {
  dashboard:
    "Open a sign-in link from your inbox and that $20 comes off the price when you enroll in a program.",
  enroll: "Open a sign-in link from your inbox and that $20 comes off this price at payment.",
} as const;

export type CreditWaitingPage = keyof typeof CREDIT_WAITING_STEP;

/** The button that sends the link. */
export const SIGN_IN_LINK_BUTTON = "Email me the sign-in link";

/** What the note says once the link is on its way. */
export const SIGN_IN_LINK_SENT = "Link sent. Open it from your inbox.";

/** What the note says when the send failed. */
export const SIGN_IN_LINK_FAILED =
  "Couldn't send the link. Try again, or email info@tennisbootcamp.ca.";

/** The email's subject; its body is the plain link email, with "sign in". */
export const SIGN_IN_LINK_SUBJECT = "Your Tennis Bootcamp sign-in link";

/** Where the sends are recorded, on the user's own metadata. */
export const SIGN_IN_LINK_META_KEY = "tb_signin_links";

/** At most one link a minute. */
export const SIGN_IN_LINK_COOLDOWN_MS = 60_000;

/** At most this many links a day (UTC). */
export const SIGN_IN_LINK_DAILY_CAP = 5;

type SendRecord = { day: string; count: number; at: string };

function sendRecord(meta: Record<string, unknown> | null | undefined): SendRecord | null {
  const raw = meta?.[SIGN_IN_LINK_META_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const { day, count, at } = raw as Record<string, unknown>;
  if (typeof day !== "string" || typeof at !== "string" || typeof count !== "number") return null;
  return { day, count, at };
}

const utcDay = (now: number) => new Date(now).toISOString().slice(0, 10);

/**
 * Whether one more link may go out now: not inside a minute of the last one,
 * and under the day's cap. A record that cannot be read allows the send, so
 * an account is never locked out by its own metadata. A stamp ahead of `now`
 * (clock skew) counts as inside the minute.
 */
export function signInLinkAllowed(
  meta: Record<string, unknown> | null | undefined,
  now: number
): boolean {
  const record = sendRecord(meta);
  if (!record) return true;
  const last = Date.parse(record.at);
  if (!Number.isNaN(last) && now - last < SIGN_IN_LINK_COOLDOWN_MS) return false;
  return record.day !== utcDay(now) || record.count < SIGN_IN_LINK_DAILY_CAP;
}

/** The metadata patch that records this send. */
export function recordSignInLink(
  meta: Record<string, unknown> | null | undefined,
  now: number
): Record<string, unknown> {
  const record = sendRecord(meta);
  const day = utcDay(now);
  const count = record && record.day === day ? record.count + 1 : 1;
  return { [SIGN_IN_LINK_META_KEY]: { day, count, at: new Date(now).toISOString() } };
}
