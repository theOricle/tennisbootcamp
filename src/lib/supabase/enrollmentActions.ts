import "server-only";
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
};

// Returns the Supabase enrollment UUID, or null if Supabase is not configured.
export async function saveEnrollmentToSupabase(
  data: EnrollmentPayload
): Promise<string | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }

  const supabase = createServiceClient();

  const { data: row, error } = await supabase
    .from("enrollments")
    .insert({
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

// Mint an invite (new user) or magic link (returning user) and stub-log it.
// Updates the enrollment row with user_id when the user is newly created.
export async function issueActivationLink(
  email: string,
  enrollmentId: string | null
): Promise<void> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log(
      "[STUB EMAIL — Phase 7 will replace with Resend] Supabase not configured — skipping invite for",
      email
    );
    return;
  }

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const supabase = createServiceClient();

  // Try invite first (creates user if new); fall back to magic link for existing users.
  const { data: inviteData, error: inviteError } =
    await supabase.auth.admin.generateLink({
      type: "invite",
      email,
      options: { redirectTo: `${siteUrl}/auth/callback?next=/set-password` },
    });

  if (!inviteError && inviteData.properties?.action_link) {
    console.log(
      `[STUB EMAIL — Phase 7 will replace with Resend] Activation link for ${email}:\n${inviteData.properties.action_link}`
    );

    // Link newly-created user to the enrollment row.
    if (enrollmentId && inviteData.user?.id) {
      await supabase
        .from("enrollments")
        .update({ user_id: inviteData.user.id })
        .eq("id", enrollmentId);
    }
    return;
  }

  // User already exists — send a magic link instead.
  const { data: magicData, error: magicError } =
    await supabase.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: `${siteUrl}/auth/callback?next=/set-password` },
    });

  if (!magicError && magicData.properties?.action_link) {
    console.log(
      `[STUB EMAIL — Phase 7 will replace with Resend] Sign-in link for returning user ${email}:\n${magicData.properties.action_link}`
    );
    // TODO Phase 7: also update enrollment.user_id by looking up user by email.
  } else {
    console.error("Failed to generate activation link:", magicError?.message ?? inviteError?.message);
  }
}
