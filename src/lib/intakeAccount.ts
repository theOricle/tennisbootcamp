import "server-only";
import { issueActivationLink } from "@/lib/supabase/enrollmentActions";
import {
  findUserIdByEmail,
  setPlayerAvailability,
  fillPlayerContact,
} from "@/lib/players";
import { hasAnyAvailability } from "@/lib/availability";

// Intake → account. A player who fills the 2-minute quiz and never books an
// assessment still gets an account (set-password email) and a profile that
// carries their availability, so the coach can level them in /admin/players
// and the cohort builder can see when they play.
//
// Never throws — the caller (the intake route) must answer 200 whatever
// happens here. Every outcome is logged.

export type IntakeAccountResult = {
  /** "created" = invite sent; "existing" = account already there, no email. */
  account: "created" | "existing" | "skipped";
  availability: "written" | "skipped";
  userId: string | null;
};

function supabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export async function provisionIntakeAccount(input: {
  email: string;
  name?: string | null;
  phone?: string | null;
  availability?: unknown;
}): Promise<IntakeAccountResult> {
  const result: IntakeAccountResult = {
    account: "skipped",
    availability: "skipped",
    userId: null,
  };
  const email = input.email.trim().toLowerCase();
  if (!supabaseConfigured() || !email) return result;

  try {
    // Once per email: an existing auth user gets no second set-password email
    // from the quiz (they already have the link from an earlier step).
    let userId = await findUserIdByEmail(email);
    if (userId) {
      result.account = "existing";
    } else {
      userId = await issueActivationLink(email, null);
      if (!userId) userId = await findUserIdByEmail(email);
      result.account = userId ? "created" : "skipped";
    }
    result.userId = userId;
    if (!userId) return result;

    // Fill a blank name/phone so the admin list reads properly. A player's
    // own profile edits win — this never overwrites.
    await fillPlayerContact(userId, {
      fullName: input.name ?? null,
      phone: input.phone ?? null,
    }).catch(() => undefined);

    // Carry the grid onto the profile. An empty grid writes nothing — never
    // wipe what a player confirmed earlier with a blank.
    if (hasAnyAvailability(input.availability)) {
      const write = await setPlayerAvailability(userId, {
        availability: input.availability,
        source: "intake",
      });
      if (write.ok) {
        result.availability = "written";
      } else {
        console.error("[intake account] availability write failed:", write.error);
      }
    }
  } catch (err) {
    console.error("[intake account] provisioning failed (non-blocking):", err);
  }

  console.log(
    `[intake account] ${email}: account=${result.account} availability=${result.availability}`
  );
  return result;
}
