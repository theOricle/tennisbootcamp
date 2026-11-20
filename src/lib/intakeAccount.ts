import "server-only";
import { issueActivationLink } from "@/lib/supabase/enrollmentActions";
import {
  setPlayerAvailability,
  fillPlayerContact,
  ensureSelfParticipant,
} from "@/lib/players";
import { hasAnyAvailability } from "@/lib/availability";
import { settleGuestSubmission } from "@/lib/household";
import type { GuestPlayer } from "@/lib/guestAccount";
import { normalizeEmail } from "@/lib/supabase/adminUsers";

// Intake → account. A player who fills the 2-minute quiz and never books an
// assessment still gets an account (set-password email) and a profile that
// carries their availability, so the coach can level them in /admin/players
// and the cohort builder can see when they play.
//
// Two paths (backlog #84; owner, 2026-11-14):
//   - signed in: the grid and the contact land on the session's own account;
//   - signed out, after the response: an address with no account gets one,
//     with its set-password email, and the grid lands on the people this
//     submission created; an address that already has an account is left
//     exactly as it is — a typed email proves nothing.
// Neither links rows: they link when the address owner signs in through
// their own emailed link (/auth/callback).
//
// Never throws — the caller (the intake route) must answer 200 whatever
// happens here. Every outcome is logged, without the address.

export type IntakeAccountResult = {
  /** "created" = set-password email sent; "existing" = left as it was. */
  account: "created" | "existing" | "skipped";
  availability: "written" | "skipped";
  userId: string | null;
};

function supabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

/**
 * Carry the grid onto these players, or onto the holder's 'self' participant
 * when the quiz named none. An empty grid writes nothing — never wipe what a
 * player confirmed earlier with a blank.
 */
async function writeGrid(
  accountId: string,
  input: { availability?: unknown; name?: string | null; participantIds: string[] }
): Promise<"written" | "skipped"> {
  if (!hasAnyAvailability(input.availability)) return "skipped";
  let targets = input.participantIds;
  if (targets.length === 0) {
    const self = await ensureSelfParticipant(accountId, { fullName: input.name ?? null }).catch(() => null);
    targets = self ? [self.id] : [];
  }
  let written: "written" | "skipped" = "skipped";
  for (const participantId of targets) {
    const write = await setPlayerAvailability(participantId, {
      availability: input.availability,
      source: "intake",
    });
    if (write.ok) written = "written";
    else console.error("[intake account] availability write failed:", write.error);
  }
  return written;
}

/** Signed in: the quiz lands on the session's own account. No email. */
export async function provisionSessionIntake(input: {
  accountId: string;
  name?: string | null;
  phone?: string | null;
  availability?: unknown;
  /** The session's own players the quiz was about. Empty means the holder. */
  participantIds: string[];
}): Promise<IntakeAccountResult> {
  const result: IntakeAccountResult = { account: "existing", availability: "skipped", userId: input.accountId };
  if (!supabaseConfigured()) return { ...result, account: "skipped" };
  try {
    // Fill a blank name/phone so the admin list reads properly. A player's
    // own profile edits win — this never overwrites.
    await fillPlayerContact(input.accountId, {
      fullName: input.name ?? null,
      phone: input.phone ?? null,
    }).catch(() => undefined);
    result.availability = await writeGrid(input.accountId, input);
  } catch (err) {
    console.error("[intake account] signed-in provisioning failed (non-blocking):", err);
  }
  console.log(`[intake account] signed in: availability=${result.availability}`);
  return result;
}

/**
 * Signed out, run after the response: the address's account only when this
 * submission makes it. An address that already has an account gets nothing
 * written and no second set-password email.
 */
export async function provisionGuestIntake(input: {
  email: string;
  name?: string | null;
  phone?: string | null;
  availability?: unknown;
  /** Who the quiz was about, as typed (guestPlayers). */
  players: GuestPlayer[];
}): Promise<IntakeAccountResult> {
  const result: IntakeAccountResult = { account: "skipped", availability: "skipped", userId: null };
  const email = normalizeEmail(input.email);
  if (!supabaseConfigured() || !email) return result;

  try {
    const settled = await settleGuestSubmission({
      email,
      holderName: input.name ?? "",
      holderPhone: input.phone ?? null,
      players: input.players,
    });
    if (settled.kind === "existing") {
      result.account = "existing";
    } else if (settled.kind === "new") {
      // The set-password email. With the holder alone the invite creates the
      // account; when the quiz named others, the account was made a moment
      // ago and the magic-link branch sends the same email.
      const sent = await issueActivationLink(email).catch((err) => {
        console.error("[intake account] activation link failed (non-blocking):", err);
        return { userId: null, created: false };
      });
      // Only an account this submission made: the one settled above, or the
      // one the invite just created. Never one that existed already.
      const own = settled.accountId ?? (sent.created ? sent.userId : null);
      result.account = own ? "created" : "skipped";
      result.userId = own;
      if (own) {
        await fillPlayerContact(own, { fullName: input.name ?? null, phone: input.phone ?? null }).catch(
          () => undefined
        );
        result.availability = await writeGrid(own, {
          availability: input.availability,
          name: input.name,
          participantIds: settled.playerIds.filter((id): id is string => Boolean(id)),
        });
      }
    }
  } catch (err) {
    console.error("[intake account] provisioning failed (non-blocking):", err);
  }

  console.log(
    `[intake account] signed out: account=${result.account} availability=${result.availability}`
  );
  return result;
}
