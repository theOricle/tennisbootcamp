import "server-only";
import { issueActivationLink } from "@/lib/supabase/enrollmentActions";
import {
  findUserIdByEmail,
  setPlayerAvailability,
  fillPlayerContact,
  ensureSelfParticipant,
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
  /**
   * The players the quiz was about (backlog #11). Empty means "the account
   * holder", which is what every pre-household submission is.
   */
  participantIds?: string[];
  /**
   * True when the "who is this for?" resolution created the auth account a
   * moment ago (a parent quizzing for a child). The account technically
   * "exists" by the time we look, but nobody has been sent the link yet — so
   * send it.
   */
  forceInvite?: boolean;
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
    if (userId && !input.forceInvite) {
      result.account = "existing";
    } else if (userId && input.forceInvite) {
      // Non-blocking: the auth account is what the availability write below
      // needs, and it exists whether or not the message was accepted. Letting
      // a refusal throw would skip that write entirely.
      await issueActivationLink(email, null).catch((err) =>
        console.error("[intake account] activation link failed (non-blocking):", err)
      );
      result.account = "created";
    } else {
      userId = await issueActivationLink(email, null).catch((err) => {
        console.error("[intake account] activation link failed (non-blocking):", err);
        return null;
      });
      // generateLink creates the user before the message goes out, so the
      // account is findable even when the send was refused.
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

    // Carry the grid onto every player the quiz was about. An empty grid
    // writes nothing — never wipe what a player confirmed earlier with a blank.
    if (hasAnyAvailability(input.availability)) {
      let targets = input.participantIds ?? [];
      if (targets.length === 0) {
        const self = await ensureSelfParticipant(userId, {
          fullName: input.name ?? null,
        }).catch(() => null);
        targets = self ? [self.id] : [];
      }
      for (const participantId of targets) {
        const write = await setPlayerAvailability(participantId, {
          availability: input.availability,
          source: "intake",
        });
        if (write.ok) {
          result.availability = "written";
        } else {
          console.error("[intake account] availability write failed:", write.error);
        }
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
