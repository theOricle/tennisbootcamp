import "server-only";
import { Resend } from "resend";
import type { Recommendation } from "@/lib/recommend";
import { formatResendError } from "@/lib/emailResult";
import { CONTACT_EMAIL } from "@/content/business";
import {
  buildLinkEmail,
  buildRecommendationEmail,
  buildBookingConfirmationEmail,
  buildAssessmentRequestReceivedEmail,
  buildAssessmentRequestAdminEmail,
  buildCohortInviteEmail,
  cohortInviteSubject,
  buildCohortConfirmedEmail,
  buildSessionCancelledEmail,
  buildAssessmentCompleteEmail,
  buildEtransferInstructionsEmail,
  buildPaymentReceivedEmail,
  buildEtransferPendingAdminEmail,
  moneyCAD,
  type CohortInviteParams,
} from "@/lib/emailBodies";

export type { Subject } from "@/lib/emailBodies";

// Bodies live in emailBodies.ts (pure, rendered by test-privacy.ts); this
// file only sends them.
const FROM = "Tennis Bootcamp <noreply@send.tennisbootcamp.ca>";
const INBOX = "info@tennisbootcamp.ca";

// ─── Delivery ─────────────────────────────────────────────────────────────────

/**
 * Is Resend configured? Without a key every send below logs a stub and
 * returns, which is right for local dev but must never be reported to a coach
 * as a delivered email — callers that tell a human what happened check this.
 */
export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

/** A send the provider refused. Carries the provider's own words. */
export class EmailSendError extends Error {
  constructor(recipient: string, reason: string) {
    super(`Resend refused the message to ${recipient}: ${reason}`);
    this.name = "EmailSendError";
  }
}

/**
 * The one place a message leaves the app.
 *
 * `resend.emails.send()` RESOLVES with `{ data, error }` on an API failure —
 * it does not reject. Awaiting it without reading `error` therefore succeeds
 * whatever happened, which is why invite emails could silently never arrive
 * while the admin screen reported them sent. Read the error, raise it.
 */
async function deliver(params: {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Where a reply lands; FROM is a no-reply address. */
  replyTo?: string;
}): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    // Callers stub out before reaching here; this is the safety net.
    throw new EmailSendError(params.to, "RESEND_API_KEY is not set");
  }
  const resend = new Resend(key);
  const { error } = await resend.emails.send({ from: FROM, ...params });
  if (error) throw new EmailSendError(params.to, formatResendError(error));
}

// ─── Player emails ────────────────────────────────────────────────────────────
// Every email to a player except the link email carries the CASL sender and
// unsubscribe lines. Replies reach the inbox (FROM is no-reply), so "reply to
// this email" is a working opt-out.

export async function sendLinkEmail(
  to: string,
  subject: string,
  link: string,
  actionLabel: string
): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`[STUB EMAIL — set RESEND_API_KEY] ${subject} for ${to}:\n${link}`);
    return;
  }
  await deliver({ to, ...buildLinkEmail(subject, link, actionLabel) });
}

export async function sendRecommendationEmail(
  to: string,
  name: string,
  recommendations: Recommendation[],
  tentativeLevel?: string
): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`[STUB EMAIL — set RESEND_API_KEY] recommendations for ${to}`);
    return;
  }
  await deliver({
    to,
    ...buildRecommendationEmail(name, recommendations, tentativeLevel),
    replyTo: CONTACT_EMAIL,
  });
}

export async function sendBookingConfirmationEmail(params: {
  /** The account holder — every email goes to them. */
  to: string;
  name: string;
  /** Who the assessment is for, when that isn't the holder. */
  participantName?: string | null;
  dateLabel: string;
  timeLabel: string;
  locationLabel?: string | null;
}): Promise<void> {
  const { to, ...rest } = params;
  const email = buildBookingConfirmationEmail(rest);
  if (!process.env.RESEND_API_KEY) {
    console.log(`[STUB EMAIL — set RESEND_API_KEY] ${email.subject} for ${to}`);
    return;
  }
  await deliver({ to, ...email, replyTo: CONTACT_EMAIL });
}

export async function sendAssessmentRequestReceivedEmail(params: {
  /** The account holder — every email goes to them. */
  to: string;
  name: string;
  /** Who the request is for, when that isn't the holder. */
  participantName?: string | null;
}): Promise<void> {
  const { to, ...rest } = params;
  const email = buildAssessmentRequestReceivedEmail(rest);
  if (!process.env.RESEND_API_KEY) {
    console.log(`[STUB EMAIL — set RESEND_API_KEY] ${email.subject} for ${to}`);
    return;
  }
  await deliver({ to, ...email, replyTo: CONTACT_EMAIL });
}

/** Internal notification to the inbox when a prospect requests a time. */
export async function sendAssessmentRequestAdminEmail(params: {
  name: string;
  /** The player, when the account holder is booking for someone else. */
  participantName?: string | null;
  email: string;
  phone?: string | null;
  selfLevel?: string | null;
  preferredTimes: string[];
  note?: string | null;
}): Promise<void> {
  const email = buildAssessmentRequestAdminEmail(params);
  if (!process.env.RESEND_API_KEY) {
    console.log(
      `[STUB EMAIL — set RESEND_API_KEY] ${email.subject} for ${INBOX} — ` +
        `${params.email} · ${params.preferredTimes.join(", ") || "no times given"}`
    );
    return;
  }
  await deliver({ to: INBOX, ...email });
}

// ─── Cohort emails (Phase 3) ──────────────────────────────────────────────────

/**
 * Personal cohort invitation with the 48-hour hold and the enroll link.
 * `tierNames` carries the cohort's tier band (derived from level_min/level_max)
 * so the invitee sees which tier band the group is for.
 */
export async function sendCohortInviteEmail(
  params: CohortInviteParams & {
    /** The account holder — every email goes to them. */
    to: string;
  }
): Promise<void> {
  const { to, ...rest } = params;
  if (!process.env.RESEND_API_KEY) {
    console.log(
      `[STUB EMAIL — set RESEND_API_KEY] ${cohortInviteSubject(rest)} for ${to}:\n${rest.enrollUrl}`
    );
    return;
  }
  await deliver({ to, ...buildCohortInviteEmail(rest), replyTo: CONTACT_EMAIL });
}

/** Cohort reached minimum — everyone paid gets the schedule. */
export async function sendCohortConfirmedEmail(params: {
  /** The account holder — every email goes to them. */
  to: string;
  /** Which player on the account is in, when that isn't the holder. */
  participantName?: string | null;
  cohortLabel: string;
  programTitle: string;
  startDateLabel: string;
  sessionLines: string[]; // "Tue Sep 8 · 6–7pm"
}): Promise<void> {
  const { to, ...rest } = params;
  const email = buildCohortConfirmedEmail(rest);
  if (!process.env.RESEND_API_KEY) {
    console.log(`[STUB EMAIL — set RESEND_API_KEY] ${email.subject} for ${to}`);
    return;
  }
  await deliver({ to, ...email, replyTo: CONTACT_EMAIL });
}

/**
 * A session was cancelled by us. With `makeup` set the make-up is booked; with
 * `makeup: null` the cancellation passed the cap and converts to credit.
 */
export async function sendSessionCancelledEmail(params: {
  to: string;
  cohortLabel: string;
  dateLabel: string;      // "Wednesday, July 30"
  reasonLine: string;     // one plain sentence
  makeup: { dateLabel: string; newEndDateLabel: string } | null;
  makeupMaxWeeks: number;
}): Promise<void> {
  const { to, ...rest } = params;
  const email = buildSessionCancelledEmail(rest);
  if (!process.env.RESEND_API_KEY) {
    console.log(`[STUB EMAIL — set RESEND_API_KEY] ${email.subject} for ${to}`);
    return;
  }
  await deliver({ to, ...email, replyTo: CONTACT_EMAIL });
}

// ─── sendAssessmentCompleteEmail ──────────────────────────────────────────────

export async function sendAssessmentCompleteEmail(params: {
  /** The account holder — every email goes to them. */
  to: string;
  name: string;
  /** Whose level this is, when that isn't the holder. */
  participantName?: string | null;
  levelLabel: string;
  coachNote: string;
}): Promise<void> {
  const { to, ...rest } = params;
  const email = buildAssessmentCompleteEmail(rest);
  if (!process.env.RESEND_API_KEY) {
    console.log(`[STUB EMAIL — set RESEND_API_KEY] ${email.subject} for ${to}`);
    return;
  }
  await deliver({ to, ...email, replyTo: CONTACT_EMAIL });
}

// ─── E-transfer rail (backlog #12) ────────────────────────────────────────────

/**
 * Enrollment received on an e-transfer cohort: the amount, where to send it,
 * and the message to put on the transfer. The spot is held until the coach
 * confirms the transfer arrived; the confirmed email follows from there.
 */
export async function sendEtransferInstructionsEmail(params: {
  to: string;
  firstName: string;
  programTitle: string;
  cohortLabel: string;
  priceCents: number;
  creditCents: number;   // 0 when no unused assessment credit
  amountCents: number;   // price − credit
  recipientEmail: string;
  memo: string;
  cardUrl: string;       // enroll link (with invite token) for "pay by card instead"
}): Promise<void> {
  const { to, ...rest } = params;
  const email = buildEtransferInstructionsEmail(rest);
  if (!process.env.RESEND_API_KEY) {
    console.log(
      `[STUB EMAIL — set RESEND_API_KEY] ${email.subject} for ${to}:\n  amount ${moneyCAD(rest.amountCents)} → ${rest.recipientEmail}\n  message "${rest.memo}"`
    );
    return;
  }
  await deliver({ to, ...email, replyTo: CONTACT_EMAIL });
}

/**
 * The coach confirmed the transfer arrived (backlog #15). Only the admin
 * mark-paid path sends this — card payers already get a Stripe receipt — and
 * it is suppressed when the same payment confirms the cohort, so nobody gets
 * a receipt and a confirmation in the same beat.
 *
 * `amountCents` is the after-credit figure the coach was told to expect
 * (inviteAmountDueCents); it is never recomputed here. The email names no
 * dates and no group size — those aren't real until the cohort confirms.
 */
export async function sendPaymentReceivedEmail(params: {
  /** The account holder — every email goes to them. */
  to: string;
  /** Which player on the account the payment is for. */
  participantName?: string | null;
  programTitle: string;
  cohortLabel: string;
  /** What actually arrived, after any assessment credit. */
  amountCents: number;
}): Promise<void> {
  const { to, ...rest } = params;
  const email = buildPaymentReceivedEmail(rest);
  if (!process.env.RESEND_API_KEY) {
    console.log(
      `[STUB EMAIL — set RESEND_API_KEY] ${email.subject} for ${to}: ${moneyCAD(rest.amountCents)}`
    );
    return;
  }
  await deliver({ to, ...email, replyTo: CONTACT_EMAIL });
}

/** Inbox notification: a player says their e-transfer is on its way. */
export async function sendEtransferPendingAdminEmail(params: {
  playerName: string;
  playerEmail: string;
  cohortLabel: string;
  cohortId: string;
  amountCents: number;
  memo: string;
}): Promise<void> {
  const { adminUrl, ...email } = buildEtransferPendingAdminEmail(params);
  if (!process.env.RESEND_API_KEY) {
    console.log(`[STUB EMAIL — set RESEND_API_KEY] ${email.subject} → ${INBOX}\n  ${adminUrl}`);
    return;
  }
  await deliver({ to: INBOX, ...email });
}
