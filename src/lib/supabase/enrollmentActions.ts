import "server-only";
import { sendEnrolledEmail, sendLinkEmail } from "@/lib/email";
import { findUserIdByEmail } from "@/lib/players";
import { enrollmentRowsToLink, enrollmentNoticeKind } from "@/lib/enrollmentLink";
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
 * The account an enrollment being saved belongs to: the signed-in user when
 * there is one, else the auth user for the contact email, else null. One
 * call per request — the email lookup pages the whole user list — and the
 * result goes on every row the request saves.
 */
export async function resolveEnrollmentUserId(
  contactEmail: string,
  sessionUserId?: string | null
): Promise<string | null> {
  if (!supabaseConfigured()) return null;
  if (sessionUserId) return sessionUserId;
  const email = contactEmail.trim();
  if (!email) return null;
  return findUserIdByEmail(email).catch((err) => {
    console.error(
      "Enrollment owner lookup failed; row saved unowned (non-blocking):",
      err instanceof Error ? err.message : err
    );
    return null;
  });
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
 * account's (audit H5). Idempotent; a row that already has an owner is never
 * touched. Resolves to how many rows were linked. The same rule, applied to
 * history, is migration 0008.
 */
export async function linkEnrollmentsToAccount(userId: string, email: string): Promise<number> {
  if (!supabaseConfigured() || !userId) return 0;
  const target = normalizeEmail(email);
  if (!target) return 0;
  const supabase = createServiceClient();
  // ilike: case-insensitive, and `_` in an address is a wildcard here, so the
  // exact match is re-checked by enrollmentRowsToLink before the update.
  const { data, error } = await supabase
    .from("enrollments")
    .select("id, contact_email, user_id")
    .is("user_id", null)
    .ilike("contact_email", target);
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
 * Create the account for a brand-new email and send its set-password link.
 * Resolves to the new user's id, or null when the email already has an
 * account (Supabase refuses the invite) or the link could not be minted.
 * The send runs AFTER the account exists and `onCreated` has linked what it
 * must: a provider refusal throws, and the account must not be left orphaned.
 */
async function inviteNewAccount(
  email: string,
  onCreated?: (userId: string) => Promise<void>
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
  await sendLinkEmail(email, "Set your password for Tennis Bootcamp", activationUrl, "set your password");
  return { userId, invited: true };
}

// Mint an invite (new user) or magic link (returning user) and stub-log it.
// Both branches link the account to every enrollment row for the email that
// nobody owns yet (audit H5) — the invite branch also by the id it was given,
// in case the row's contact_email was stored differently. Resolves to the
// auth user id when Supabase reports one, otherwise null.
export async function issueActivationLink(
  email: string,
  enrollmentId: string | null
): Promise<string | null> {
  if (!supabaseConfigured()) {
    console.log("[issueActivationLink] Supabase not configured — skipping invite for", email);
    return null;
  }

  const supabase = createServiceClient();

  // Try invite first (creates user if new); fall back to magic link for existing users.
  const invited = await inviteNewAccount(email, async (userId) => {
    // Link the newly-created user BEFORE sending. The send throws on a
    // provider refusal, and the auth user already exists by this point —
    // leaving the rows unlinked would orphan the enrollment from the account
    // that owns it, and no later link attempt would run.
    if (enrollmentId) {
      await supabase.from("enrollments").update({ user_id: userId }).eq("id", enrollmentId);
    }
    await linkEnrollmentsToAccount(userId, email).catch((err) =>
      console.error("Enrollment link after invite failed (non-blocking):", err)
    );
  });
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
    await sendLinkEmail(email, "Set your password for Tennis Bootcamp", magicUrl, "set your password and access your account");
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
  enrolled: {
    programTitle: string;
    cohortLabel: string;
    /** The player, when known; read from the row when not. */
    participantName?: string | null;
    /** True once the payment is in; false while an e-transfer is on its way. */
    paid: boolean;
  };
};

/**
 * What the account hears after an enrollment is saved (audit H5):
 *
 *   - no account for the email → one is created and the set-password link
 *     goes out, exactly as before (issueActivationLink's invite branch);
 *   - an account already exists → every unowned row for the email is linked
 *     to it and it gets "You're enrolled" with a dashboard link — never a
 *     second set-password email.
 *
 * Never throws past its callers' `.catch`; resolves to the owning user id.
 */
export async function notifyEnrollmentAccount(params: EnrollmentNotice): Promise<string | null> {
  if (!supabaseConfigured()) {
    console.log("[notifyEnrollmentAccount] Supabase not configured — skipping for", params.email);
    return null;
  }
  const email = params.email.trim();
  if (!email) return null;

  // `userId` is the save path's own resolution (one list walk per request):
  // null means no account was found for the email.
  const userId = params.userId;
  if (!userId || enrollmentNoticeKind(Boolean(userId)) === "set-password") {
    // The invite creates the account and links the rows; if the address
    // turns out to exist after all, the magic-link branch links them too.
    return issueActivationLink(email, params.enrollmentId);
  }

  await linkEnrollmentsToAccount(userId, email).catch((err) =>
    console.error("Enrollment link for existing account failed (non-blocking):", err)
  );

  const supabase = createServiceClient();
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
