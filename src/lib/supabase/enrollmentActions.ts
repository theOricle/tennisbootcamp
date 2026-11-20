import "server-only";
import { sendAccountSetupEmail, sendEnrolledEmail, sendLinkEmail } from "@/lib/email";
import { findUserIdByEmail } from "@/lib/players";
import {
  emailBelongsToAccount,
  enrollmentNoticePlan,
  enrollmentRowsToLink,
  ilikePattern,
} from "@/lib/enrollmentLink";
import { accountNeedsSetup, recordSetupEmail, setupEmailSentFor } from "@/lib/enrollPlayers";
import { normalizeEmail } from "@/lib/supabase/adminUsers";
import { createServiceClient } from "./service";

export type EnrollmentPayload = {
  cohortId: string;
  program?: string;
  location?: string;
  participantName?: string;
  participantDob?: string;
  isMinor?: boolean;
  contactEmail: string;
  contactPhone?: string;
  guardianName?: string;
  guardianEmail?: string;
  guardianPhone?: string;
  consentSignedName?: string;
  consentAgreedAt?: string;
  waiverVersion?: string;
  status: string;
  /**
   * The account that owns this row (audit H5): the signed-in session's, from
   * enrollmentOwner, else null (backlog #84) — never the account that exists
   * for the typed contact email. The dashboard and /profile read enrollments
   * by user_id under RLS; an unowned row joins its account when the address
   * owner signs in through their own emailed link (linkEnrollmentsToAccount).
   */
  userId: string | null;
};

function supabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "https://tennisbootcamp-seven.vercel.app";
}

/**
 * Who owns these enrollment rows (backlog #84): the account they were saved
 * under — a signed-in checkout's session — or null when none of them is
 * owned. The Stripe webhook reads it instead of looking the payer's email up.
 */
export async function enrollmentRowsOwner(ids: readonly string[]): Promise<string | null> {
  const list = [...new Set(ids.filter(Boolean))];
  if (!supabaseConfigured() || list.length === 0) return null;
  const supabase = createServiceClient();
  const { data, error } = await supabase.from("enrollments").select("user_id").in("id", list);
  if (error) {
    console.error("Enrollment owner read failed (non-blocking):", error.message);
    return null;
  }
  const owned = ((data ?? []) as { user_id: string | null }[]).find((r) => r.user_id);
  return owned?.user_id ?? null;
}

// Returns the Supabase enrollment UUID, or null if Supabase is not configured.
export async function saveEnrollmentToSupabase(
  data: EnrollmentPayload
): Promise<string | null> {
  if (!supabaseConfigured()) {
    return null;
  }

  const supabase = createServiceClient();

  const { data: row, error } = await supabase
    .from("enrollments")
    .insert({
      user_id: data.userId,
      cohort_id: data.cohortId,
      program: data.program ?? null,
      location: data.location ?? null,
      participant_name: data.participantName ?? null,
      participant_dob: data.participantDob || null,
      is_minor: data.isMinor ?? false,
      contact_email: data.contactEmail,
      contact_phone: data.contactPhone ?? null,
      guardian_name: data.guardianName || null,
      guardian_email: data.guardianEmail || null,
      guardian_phone: data.guardianPhone || null,
      consent_signed_name: data.consentSignedName ?? null,
      consent_agreed_at: data.consentAgreedAt || null,
      waiver_version: data.waiverVersion ?? null,
      status: data.status,
    })
    .select("id")
    .single();

  if (error) {
    console.error("Supabase enrollment insert error:", error.message);
    return null;
  }

  return (row as { id: string } | null)?.id ?? null;
}

/**
 * Move these enrollment rows out of one of `from` into `to`, and resolve to
 * the ids moved (backlog #84). Guarded on `from`: a redelivered Stripe event
 * moves nothing, so the caller knows not to send an email twice, and a row
 * that was refunded or disputed is never brought back. A failed write moves
 * nothing; Supabase unconfigured moves nothing.
 */
export async function setEnrollmentStatusByIds(
  ids: readonly string[],
  from: readonly string[],
  to: string
): Promise<string[]> {
  const list = [...new Set(ids.filter(Boolean))];
  if (!supabaseConfigured() || list.length === 0) return [];
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("enrollments")
    .update({ status: to })
    .in("id", list)
    .in("status", [...from])
    .select("id");
  if (error) {
    console.error("Enrollment status move failed (non-blocking):", error.message);
    return [];
  }
  return ((data ?? []) as { id: string }[]).map((r) => r.id);
}

/**
 * Every enrollment row for this email that no account owns yet becomes this
 * account's (audit H5) — provided the email is the account's own address.
 * Idempotent; a row that already has an owner is never touched. Resolves to
 * how many rows were linked. The same rule, applied to history, is
 * migration 0008.
 *
 * Called from one place (backlog #84): /auth/callback, once the address
 * owner has signed in through their own emailed link. A form submitted while
 * nobody is signed in never links anything, whatever email it names.
 */
export async function linkEnrollmentsToAccount(userId: string, email: string): Promise<number> {
  if (!supabaseConfigured() || !userId) return 0;
  const target = normalizeEmail(email);
  if (!target) return 0;
  const supabase = createServiceClient();
  // The account's own address must be the one being linked. The id and the
  // email arrive separately — from the payment routes the email is the
  // request body's — so the helper asks Supabase whose address it is rather
  // than trusting the pair, and another address's rows can never be
  // attached to this account. Logs carry no address.
  const { data: owner, error: ownerError } = await supabase.auth.admin.getUserById(userId);
  if (ownerError || !owner?.user) {
    console.error(
      "Enrollment link skipped: account lookup failed (non-blocking):",
      ownerError?.message ?? "no user"
    );
    return 0;
  }
  if (!emailBelongsToAccount(owner.user.email, target)) {
    console.warn("Enrollment link refused: the email is not the account's own (non-blocking)");
    return 0;
  }
  // ilike: case-insensitive. `%`, `_` and `\` in the address are escaped so
  // the read stays to this address's rows, and the exact match is
  // re-checked by enrollmentRowsToLink before the update.
  const { data, error } = await supabase
    .from("enrollments")
    .select("id, contact_email, user_id")
    .is("user_id", null)
    .ilike("contact_email", ilikePattern(target));
  if (error) {
    console.error("Enrollment link lookup failed (non-blocking):", error.message);
    return 0;
  }
  const ids = enrollmentRowsToLink(
    (data ?? []) as { id: string; contact_email: string | null; user_id: string | null }[],
    target
  );
  if (ids.length === 0) return 0;
  const { error: updateError } = await supabase
    .from("enrollments")
    .update({ user_id: userId })
    .in("id", ids)
    .is("user_id", null);
  if (updateError) {
    console.error("Enrollment link update failed (non-blocking):", updateError.message);
    return 0;
  }
  return ids.length;
}

/**
 * What goes out with an activation link. The default is the plain "set your
 * password" link email (the quiz); a guest enrollment passes the set-up
 * email that names the players (owner, 2026-10-12), built from the link.
 */
export type ActivationMessage = (link: string) => Promise<void>;

function defaultActivationMessage(email: string, actionLabel: string): ActivationMessage {
  return (link) => sendLinkEmail(email, "Set your password for Tennis Bootcamp", link, actionLabel);
}

/**
 * Create the account for a brand-new email and send its set-password link.
 * Resolves to the new user's id, or null when the email already has an
 * account (Supabase refuses the invite) or the link could not be minted.
 */
async function inviteNewAccount(
  email: string,
  message?: ActivationMessage
): Promise<{ userId: string | null; invited: boolean }> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.auth.admin.generateLink({
    type: "invite",
    email,
    options: { redirectTo: `${siteUrl()}/auth/callback?next=/set-password` },
  });
  if (error || !data.properties?.hashed_token) {
    return { userId: null, invited: false };
  }
  const userId = data.user?.id ?? null;
  const activationUrl =
    `${siteUrl()}/auth/callback?token_hash=${data.properties.hashed_token}&type=invite&next=/set-password`;
  await (message ?? defaultActivationMessage(email, "set your password"))(activationUrl);
  return { userId, invited: true };
}

/** What issueActivationLink did: the account, and whether its invite made it. */
export type ActivationResult = { userId: string | null; created: boolean };

// Mint an invite (new user) or magic link (returning user) and send it.
// `created` is true only when the invite made the account just now: a caller
// acting for a signed-out visitor writes into an account only then (backlog
// #84). Nothing is linked here: an unowned row joins its account when the
// address owner signs in through this link (/auth/callback). `message`
// replaces the plain link email with one of the caller's own (the enrollment
// set-up email); the link is the same either way.
export async function issueActivationLink(
  email: string,
  message?: ActivationMessage
): Promise<ActivationResult> {
  if (!supabaseConfigured()) {
    console.log("[issueActivationLink] Supabase not configured — skipping invite");
    return { userId: null, created: false };
  }

  const supabase = createServiceClient();

  // Try invite first (creates user if new); fall back to magic link for existing users.
  const invited = await inviteNewAccount(email, message);
  if (invited.invited) return { userId: invited.userId, created: Boolean(invited.userId) };

  // User already exists — send a magic link instead.
  const { data: magicData, error: magicError } =
    await supabase.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: `${siteUrl()}/auth/callback?next=/set-password` },
    });

  const existingId = magicData?.user?.id ?? null;
  if (!magicError && magicData.properties?.hashed_token) {
    const magicUrl =
      `${siteUrl()}/auth/callback?token_hash=${magicData.properties.hashed_token}&type=magiclink&next=/set-password`;
    await (message ?? defaultActivationMessage(email, "set your password and access your account"))(magicUrl);
  } else {
    console.error("Failed to generate activation link:", magicError?.message);
  }
  return { userId: existingId, created: false };
}

export type EnrollmentNotice = {
  /** The account holder's address — the one the enrollment was saved under. */
  email: string;
  /** The first row this request saved, whose player the email names when no names are given. */
  enrollmentId: string | null;
  /**
   * The signed-in account that owns the rows (backlog #84), or null for a
   * signed-out enrollment. It only saves a lookup: which email goes out is
   * decided by the account the address has, and nothing is linked here.
   */
  ownerId: string | null;
  /** The cohort, so a retried submit sends no second set-up email for it. */
  cohortId?: string | null;
  /** An admin's deliberate resend: the once-per-cohort rule is skipped. */
  force?: boolean;
  enrolled: {
    programTitle: string;
    cohortLabel: string;
    /** The player, when known; read from the row when not. */
    participantName?: string | null;
    /**
     * Every player this enrollment is for (owner, 2026-10-12), so the
     * set-up email names them all. Falls back to `participantName`.
     */
    playerNames?: readonly string[];
    /** True once the payment is in; false while an e-transfer is on its way. */
    paid: boolean;
  };
};

/**
 * What the account hears after an enrollment is saved (audit H5; guest
 * enrollment, owner 2026-10-12):
 *
 *   - no account for the email → one is created and the set-up email goes
 *     out: the players, the fact and the set-password link
 *     (issueActivationLink's invite branch, with buildAccountSetupEmail);
 *   - an account that was never activated — provisioned silently for a
 *     child's quiz or booking, or invited and never used — hears the same
 *     set-up email, through the magic-link branch, once per cohort: a
 *     duplicate submit or a retried "I've sent it" sends nothing twice;
 *   - an account someone has signed in to (or confirmed) gets "You're
 *     enrolled" with a dashboard link — never a second set-password email.
 *
 * Nothing is linked here (backlog #84): the rows a signed-out enrollment
 * saved stay unowned until the address owner signs in through their own
 * emailed link (/auth/callback). Never throws past its callers' `.catch`;
 * resolves to the address's account id.
 */
export async function notifyEnrollmentAccount(params: EnrollmentNotice): Promise<string | null> {
  if (!supabaseConfigured()) {
    console.log("[notifyEnrollmentAccount] Supabase not configured — skipping");
    return null;
  }
  const email = params.email.trim();
  if (!email) return null;

  const names = (
    params.enrolled.playerNames && params.enrolled.playerNames.length > 0
      ? params.enrolled.playerNames
      : [params.enrolled.participantName ?? ""]
  )
    .map((n) => (n ?? "").trim())
    .filter(Boolean);
  const cohortId = (params.cohortId ?? "").trim() || null;
  const setupMessage: ActivationMessage = (link) =>
    sendAccountSetupEmail({
      to: email,
      playerNames: names,
      programTitle: params.enrolled.programTitle,
      cohortLabel: params.enrolled.cohortLabel,
      paid: params.enrolled.paid,
      link,
    });

  // The address's account, for the choice of email only: the signed-in
  // owner when there is one, else a lookup — which, run after the response
  // (backlog #84), tells the visitor nothing.
  const userId = params.ownerId ?? (await findUserIdByEmail(email).catch(() => null));
  const supabase = createServiceClient();
  const user = userId
    ? ((await supabase.auth.admin.getUserById(userId)).data?.user ?? null)
    : null;
  const plan = enrollmentNoticePlan({
    accountExists: Boolean(userId),
    needsSetup: accountNeedsSetup(user),
    setupSentForCohort: Boolean(cohortId && setupEmailSentFor(user?.user_metadata ?? null, cohortId)),
    force: Boolean(params.force),
  });
  if (plan === "none") {
    console.log("[notifyEnrollmentAccount] set-up email already sent for this cohort — not resent");
    return userId;
  }
  if (plan === "set-up") {
    // No account yet: the invite creates it. Never activated: the same
    // set-up email through the magic-link branch.
    const sent = await issueActivationLink(email, setupMessage);
    const accountId = userId ?? sent.userId;
    if (accountId && cohortId) await markSetupEmailSent(accountId, cohortId);
    return accountId;
  }
  if (!userId) return null;

  const [{ data: profile }, participantName] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
    params.enrolled.participantName !== undefined
      ? Promise.resolve(params.enrolled.participantName)
      : participantNameOf(params.enrollmentId),
  ]);
  await sendEnrolledEmail({
    to: email,
    name: (profile as { full_name?: string | null } | null)?.full_name ?? "",
    participantName,
    programTitle: params.enrolled.programTitle,
    cohortLabel: params.enrolled.cohortLabel,
    paid: params.enrolled.paid,
  });
  return userId;
}

/**
 * The admin's retry (owner, 2026-10-12: "the activation email fails …
 * retry possible from admin"): the same decision as after the enrollment —
 * the set-up email for an account never activated, "You're enrolled" for
 * one that was — sent again on purpose, the once-per-cohort rule aside.
 * Reports the outcome instead of throwing, for the admin's own line.
 */
export async function resendAccountEmail(params: {
  email: string;
  cohortId: string;
  programTitle: string;
  cohortLabel: string;
  playerNames: readonly string[];
  paid: boolean;
}): Promise<{ status: "sent" } | { status: "failed"; detail: string }> {
  try {
    await notifyEnrollmentAccount({
      email: params.email,
      enrollmentId: null,
      ownerId: null,
      cohortId: params.cohortId,
      force: true,
      enrolled: {
        programTitle: params.programTitle,
        cohortLabel: params.cohortLabel,
        participantName: params.playerNames[0] ?? null,
        playerNames: params.playerNames,
        paid: params.paid,
      },
    });
    return { status: "sent" };
  } catch (err) {
    const detail = err instanceof Error ? err.message : "unknown error";
    console.error("Account email resend failed:", detail);
    return { status: "failed", detail };
  }
}

/** Record on the user's own metadata that this cohort's set-up email went out. Non-blocking. */
async function markSetupEmailSent(userId: string, cohortId: string): Promise<void> {
  try {
    const supabase = createServiceClient();
    const { data } = await supabase.auth.admin.getUserById(userId);
    const meta = data?.user?.user_metadata ?? {};
    await supabase.auth.admin.updateUserById(userId, {
      user_metadata: { ...meta, ...recordSetupEmail(meta, cohortId, new Date().toISOString()) },
    });
  } catch (err) {
    console.warn("Set-up email record not saved (non-blocking):", err instanceof Error ? err.message : err);
  }
}

async function participantNameOf(enrollmentId: string | null): Promise<string | null> {
  if (!enrollmentId) return null;
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("enrollments")
    .select("participant_name")
    .eq("id", enrollmentId)
    .maybeSingle();
  return (data as { participant_name?: string | null } | null)?.participant_name ?? null;
}

/** The player names on these enrollment rows, in order; a row with none is skipped. */
export async function participantNamesOf(enrollmentIds: readonly string[]): Promise<string[]> {
  if (!supabaseConfigured() || enrollmentIds.length === 0) return [];
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("enrollments")
    .select("id, participant_name")
    .in("id", [...enrollmentIds]);
  const byId = new Map(
    ((data ?? []) as { id: string; participant_name: string | null }[]).map((r) => [r.id, r.participant_name])
  );
  return enrollmentIds.map((id) => (byId.get(id) ?? "").trim()).filter(Boolean);
}
