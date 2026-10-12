import "server-only";
import { sendAccountSetupEmail, sendEnrolledEmail, sendLinkEmail } from "@/lib/email";
import { findUserIdByEmail } from "@/lib/players";
import {
  emailBelongsToAccount,
  enrollmentNoticeKind,
  enrollmentOwner,
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
   * The account that owns this row (audit H5), from resolveEnrollmentUserId:
   * the session's user, else the account that exists for contactEmail, else
   * null until the activation invite creates one. The dashboard and /profile
   * read enrollments by user_id under RLS, so a row saved without it is
   * invisible to the player who paid for it.
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
 * The account an enrollment being saved belongs to — `enrollmentOwner`'s
 * rule (the signed-in user, else the auth user for the contact email, else
 * null) with the I/O around it. One call per request — the email lookup
 * pages the whole user list, and is skipped when the session already
 * answers — and the result goes on every row the request saves.
 */
export async function resolveEnrollmentUserId(
  contactEmail: string,
  sessionUserId?: string | null
): Promise<string | null> {
  if (!supabaseConfigured()) return null;
  const email = contactEmail.trim();
  const lookup =
    sessionUserId || !email
      ? null
      : await findUserIdByEmail(email).catch((err) => {
          console.error(
            "Enrollment owner lookup failed; row saved unowned (non-blocking):",
            err instanceof Error ? err.message : err
          );
          return null;
        });
  return enrollmentOwner(sessionUserId, lookup);
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
 * Every enrollment row for this email that no account owns yet becomes this
 * account's (audit H5) — provided the email is the account's own address.
 * Idempotent; a row that already has an owner is never touched. Resolves to
 * how many rows were linked. The same rule, applied to history, is
 * migration 0008.
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
 * The send runs AFTER the account exists and `onCreated` has linked what it
 * must: a provider refusal throws, and the account must not be left orphaned.
 */
async function inviteNewAccount(
  email: string,
  onCreated?: (userId: string) => Promise<void>,
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
  if (userId && onCreated) await onCreated(userId);
  const activationUrl =
    `${siteUrl()}/auth/callback?token_hash=${data.properties.hashed_token}&type=invite&next=/set-password`;
  await (message ?? defaultActivationMessage(email, "set your password"))(activationUrl);
  return { userId, invited: true };
}

// Mint an invite (new user) or magic link (returning user) and stub-log it.
// Both branches link the account to every enrollment row for the email that
// nobody owns yet (audit H5) — the invite branch also by the id it was given,
// in case the row's contact_email was stored differently. Resolves to the
// auth user id when Supabase reports one, otherwise null. `message` replaces
// the plain link email with one of the caller's own (the enrollment set-up
// email); the link is the same either way.
export async function issueActivationLink(
  email: string,
  enrollmentId: string | null,
  message?: ActivationMessage
): Promise<string | null> {
  if (!supabaseConfigured()) {
    console.log("[issueActivationLink] Supabase not configured — skipping invite for", email);
    return null;
  }

  const supabase = createServiceClient();

  // Try invite first (creates user if new); fall back to magic link for existing users.
  const invited = await inviteNewAccount(
    email,
    async (userId) => {
      // Link the newly-created user BEFORE sending. The send throws on a
      // provider refusal, and the auth user already exists by this point —
      // leaving the rows unlinked would orphan the enrollment from the account
      // that owns it, and no later link attempt would run. Only an unowned
      // row: the session that saved it wins (enrollmentOwner), and a webhook
      // whose email lookup came back empty must not move it to the address's
      // brand-new account.
      if (enrollmentId) {
        await supabase
          .from("enrollments")
          .update({ user_id: userId })
          .eq("id", enrollmentId)
          .is("user_id", null);
      }
      await linkEnrollmentsToAccount(userId, email).catch((err) =>
        console.error("Enrollment link after invite failed (non-blocking):", err)
      );
    },
    message
  );
  if (invited.invited) return invited.userId;

  // User already exists — send a magic link instead. generateLink reports the
  // existing user, so the rows are linked here too without a list walk.
  const { data: magicData, error: magicError } =
    await supabase.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: `${siteUrl()}/auth/callback?next=/set-password` },
    });

  const existingId = magicData?.user?.id ?? null;
  if (existingId) {
    if (enrollmentId) {
      await supabase
        .from("enrollments")
        .update({ user_id: existingId })
        .eq("id", enrollmentId)
        .is("user_id", null);
    }
    await linkEnrollmentsToAccount(existingId, email).catch((err) =>
      console.error("Enrollment link for existing account failed (non-blocking):", err)
    );
  }

  if (!magicError && magicData.properties?.hashed_token) {
    const magicUrl =
      `${siteUrl()}/auth/callback?token_hash=${magicData.properties.hashed_token}&type=magiclink&next=/set-password`;
    await (message ?? defaultActivationMessage(email, "set your password and access your account"))(magicUrl);
  } else {
    console.error("Failed to generate activation link:", magicError?.message);
  }
  return existingId;
}

export type EnrollmentNotice = {
  /** The account holder's address — the one the enrollment was saved under. */
  email: string;
  /** The first row this request saved, for the by-id link on a fresh invite. */
  enrollmentId: string | null;
  /** The owner resolveEnrollmentUserId found, so the list is not walked twice. */
  userId: string | null;
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
 * Every unowned row for the email is linked to the account either way.
 * Never throws past its callers' `.catch`; resolves to the owning user id.
 */
export async function notifyEnrollmentAccount(params: EnrollmentNotice): Promise<string | null> {
  if (!supabaseConfigured()) {
    console.log("[notifyEnrollmentAccount] Supabase not configured — skipping for", params.email);
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

  // `userId` is the save path's own resolution (one list walk per request):
  // null means no account was found for the email.
  const userId = params.userId;
  if (!userId || enrollmentNoticeKind(Boolean(userId)) === "set-password") {
    // The invite creates the account and links the rows; if the address
    // turns out to exist after all, the magic-link branch links them too.
    const created = await issueActivationLink(email, params.enrollmentId, setupMessage);
    if (created && cohortId) await markSetupEmailSent(created, cohortId);
    return created;
  }

  await linkEnrollmentsToAccount(userId, email).catch((err) =>
    console.error("Enrollment link for existing account failed (non-blocking):", err)
  );

  const supabase = createServiceClient();
  const { data: found } = await supabase.auth.admin.getUserById(userId);
  const user = found?.user ?? null;
  if (accountNeedsSetup(user)) {
    // Never activated: the set-up email again, once per cohort.
    if (!params.force && cohortId && setupEmailSentFor(user?.user_metadata ?? null, cohortId)) {
      console.log("[notifyEnrollmentAccount] set-up email already sent for this cohort — not resent");
      return userId;
    }
    await issueActivationLink(email, params.enrollmentId, setupMessage);
    if (cohortId) await markSetupEmailSent(userId, cohortId);
    return userId;
  }

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
    const userId = await findUserIdByEmail(params.email).catch(() => null);
    await notifyEnrollmentAccount({
      email: params.email,
      enrollmentId: null,
      userId,
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
