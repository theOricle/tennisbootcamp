import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import type { Metadata } from "next";
import Link from "next/link";
import { APPROVAL_LINE, programGroups, programs } from "@/content/programs";
import type { ProgramGroup } from "@/types/program";
import type { Cohort } from "@/types/cohort";
import { getCohortById } from "@/lib/cohortsDb";
import { isCohortRenderable } from "@/lib/cohortVisibility";
import { approvalGateApplies, claimedInvite, resolveEnrollGate } from "@/lib/enrollGate";
import { getSeatsRemaining } from "@/lib/seatCount";
import { createClient } from "@/lib/supabase/server";
import { findUnusedCredit } from "@/lib/assessmentCredit";
import { etransferRecipient } from "@/lib/paymentTransitions";
import { INVITE_RESUME_COOKIE } from "@/lib/checkoutInvite";
import { loginHref } from "@/lib/authFlow";
import { cohortMatchesGroup } from "@/lib/programCatalog";
import { currentUser } from "@/lib/household";
import { getParticipant, listParticipantsForAccount } from "@/lib/players";
import { listInvitesForAccount } from "@/lib/cohortActions";
import { alreadyInCohortReason, matchingPlayer, type BlockedPlayer } from "@/lib/enrollPlayers";
import { isAgeBand } from "@/lib/ageBand";
import { TrackedButton } from "@/components/ui/TrackedButton";
import { EnrollWizard, type EtransferInfo, type InvitedPlayer } from "./EnrollWizard";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ cohortId: string }>;
  searchParams: Promise<{ invite?: string | string[] }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { cohortId } = await params;
  const cohort = await getCohortById(cohortId);
  const program = cohort ? programs.find((p) => p.id === cohort.programId) : undefined;
  if (!cohort || !program) return { robots: { index: false, follow: false } };
  return {
    title: `Enroll — ${program.title} · ${cohort.label}`,
    description: `Enroll in the ${cohort.label} cohort for ${program.title} at Tennis Bootcamp.`,
    robots: { index: false, follow: false },
  };
}

const primaryButton =
  "inline-flex min-h-[44px] items-center rounded-full bg-[#B4E655] px-6 text-sm font-semibold text-[#061427] transition hover:brightness-110";
const secondaryButton =
  "inline-flex min-h-[44px] items-center rounded-full bg-white/10 px-6 text-sm font-semibold text-white transition hover:bg-white/15";
const inlineLink =
  "rounded font-semibold text-[#B4E655] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B4E655]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#061427]";

function GateShell({ eyebrow, children }: { eyebrow: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[#061427] text-white">
      <div className="mx-auto max-w-xl px-6 py-20">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#B4E655]">
            {eyebrow}
          </p>
          {children}
        </div>
      </div>
    </main>
  );
}

// Friendly gate for private cohorts: expired/invalid token, or no access path.
// `signInHref` is set when the cohort admits by level and nobody is signed in
// (audit M33): a player Sina already placed can sign in and come straight back.
function InviteGate({ expired, signInHref }: { expired: boolean; signInHref: string | null }) {
  return (
    <GateShell eyebrow="Private group">
      {expired ? (
        <>
          <h1 className="mt-3 text-2xl font-semibold">
            This invitation has expired
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-white/65">
            Spots are held for a set window so the whole group can confirm.
            If you still want in, reply to your invitation email — if a spot
            is open, we&apos;ll get you back in.
          </p>
        </>
      ) : (
        <>
          <h1 className="mt-3 text-2xl font-semibold">
            This group is invite-only
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-white/65">
            Enrollment in this group opens by email invitation. Take the
            2-minute quiz and our coaches place you in a group that fits your
            level and your schedule. Want your level confirmed on court
            first? The 20-minute assessment is optional.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-white/65">
            Already invited? Open the link in your invitation email.
          </p>
        </>
      )}
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {expired ? (
          <a href="mailto:info@tennisbootcamp.ca" className={primaryButton}>
            Email us →
          </a>
        ) : (
          // Quiz first, assessment optional (audit M1). A quiz-taker's button
          // reads their next step instead (owner, 2026-10-12).
          <>
            <TrackedButton variant="primary" href="/intake" track="quiz" source="enroll-gate">
              Take the 2-minute quiz
            </TrackedButton>
            <Link href="/assessment/book" className={secondaryButton}>
              Book Your Assessment
            </Link>
          </>
        )}
        {expired && (
          <Link href="/programs" className={secondaryButton}>
            Browse Programs
          </Link>
        )}
      </div>
      {!expired && signInHref && (
        <p className="mt-5 text-sm text-white/65">
          Already placed at this level?{" "}
          <Link href={signInHref} className={inlineLink}>
            Sign in
          </Link>{" "}
          and you&apos;re through.
        </p>
      )}
    </GateShell>
  );
}

// Every seat is taken (audit M33). Before this the page answered a full
// cohort with a 404, which read as a broken link to a player holding a live
// invitation; the dashboard list no longer offers full groups either.
function FullGate({
  programTitle,
  cohortLabel,
  signedIn,
}: {
  programTitle: string;
  cohortLabel: string;
  signedIn: boolean;
}) {
  return (
    <GateShell eyebrow={programTitle}>
      <h1 className="mt-3 text-2xl font-semibold">This group is full</h1>
      <p className="mt-3 text-sm leading-relaxed text-white/65">
        Every spot in {cohortLabel} is taken. Our coaches will place you in the next
        group that fits your level and schedule — you&apos;ll hear by email.
      </p>
      {!signedIn && (
        <p className="mt-3 text-sm leading-relaxed text-white/65">
          Not on our list yet? The 2-minute quiz puts you on it.
        </p>
      )}
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {signedIn ? (
          <Link href="/dashboard" className={primaryButton}>
            Open your dashboard
          </Link>
        ) : (
          <TrackedButton variant="primary" href="/intake" track="quiz" source="enroll-full">
            Take the 2-minute quiz
          </TrackedButton>
        )}
        <Link href="/programs" className={secondaryButton}>
          Browse Programs
        </Link>
      </div>
    </GateShell>
  );
}

// High Performance is by approval (joining flow, owner 2026-10-12): a public
// cohort in that group takes no walk-in. The quiz is how a player asks, our
// coaches approve each spot, and the invitation email carries the link in.
function ApprovalGate({
  group,
  programSlug,
  signInHref,
}: {
  group: ProgramGroup;
  programSlug: string;
  signInHref: string;
}) {
  return (
    <GateShell eyebrow={group.name}>
      <h1 className="mt-3 text-2xl font-semibold">This group is by approval</h1>
      <p className="mt-3 text-sm leading-relaxed text-white/65">{APPROVAL_LINE}</p>
      <p className="mt-3 text-sm leading-relaxed text-white/65">
        Already approved? Open the link in your invitation email.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <TrackedButton
          variant="primary"
          href={`/intake?program=${programSlug}`}
          track="quiz"
          source="enroll-approval"
        >
          Take the 2-minute quiz
        </TrackedButton>
        <Link href={`/programs/${programSlug}`} className={secondaryButton}>
          View Program
        </Link>
      </div>
      <p className="mt-5 text-sm text-white/65">
        Invited already?{" "}
        <Link href={signInHref} className={inlineLink}>
          Sign in
        </Link>{" "}
        and your invitation is on your dashboard.
      </p>
    </GateShell>
  );
}

/** The signed-in player's email, or null. Never throws — a guest enrolls too. */
async function signedInEmail(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user?.email ?? null;
  } catch {
    return null;
  }
}

/**
 * Who on the signed-in account is already in this cohort (owner,
 * 2026-10-12: shown disabled with the reason, never a duplicate seat): a
 * paid or e-transfer-pending invite naming them, a live invite that is not
 * the one being claimed, or a paid or pending enrollment row in their name.
 * Any read that fails blocks nobody — the routes still refuse a double seat.
 */
async function blockedPlayers(input: {
  accountId: string;
  email: string;
  cohortId: string;
  cohort: Cohort;
  participants: { id: string; name: string | null }[];
  claimingInviteId: string | null;
}): Promise<BlockedPlayer[]> {
  const out = new Map<string, string>();
  try {
    const invites = await listInvitesForAccount({
      accountId: input.accountId,
      email: input.email,
      participantIds: input.participants.map((p) => p.id),
      cohorts: [input.cohort],
    });
    const now = new Date().toISOString();
    for (const invite of invites) {
      if (invite.cohort_id !== input.cohortId || !invite.participant_id) continue;
      if (invite.id === input.claimingInviteId) continue;
      if (invite.status === "paid") out.set(invite.participant_id, alreadyInCohortReason("enrolled"));
      else if (invite.status === "invited" && invite.payment_method === "etransfer") {
        out.set(invite.participant_id, alreadyInCohortReason("pending"));
      } else if (invite.status === "invited" && invite.expires_at > now) {
        out.set(invite.participant_id, alreadyInCohortReason("invited"));
      }
    }
  } catch {
    // Read failed: nobody is blocked here; the payment routes still refuse a duplicate.
  }
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("enrollments")
      .select("participant_name, status")
      .eq("user_id", input.accountId)
      .eq("cohort_id", input.cohortId);
    for (const row of (data ?? []) as { participant_name: string | null; status: string }[]) {
      const player = matchingPlayer(input.participants, row.participant_name ?? "");
      if (!player || out.has(player.id)) continue;
      if (row.status === "paid" || row.status === "test_paid") {
        out.set(player.id, alreadyInCohortReason("enrolled"));
      } else if (row.status === "pending_etransfer") {
        out.set(player.id, alreadyInCohortReason("pending"));
      }
    }
  } catch {
    // Same: fail open here, closed at payment.
  }
  return [...out].map(([id, reason]) => ({ id, reason }));
}

export default async function EnrollPage({ params, searchParams }: PageProps) {
  const { cohortId } = await params;
  const sp = await searchParams;
  const queryToken =
    typeof sp.invite === "string" && sp.invite.trim() ? sp.invite.trim() : null;
  // A cancelled Stripe checkout comes back here with no `?invite` (backlog
  // #30): the token the player arrived with is re-read from the httpOnly
  // cookie the checkout route set, and validated below like any other.
  const cookieToken = queryToken
    ? null
    : ((await cookies()).get(INVITE_RESUME_COOKIE)?.value?.trim() || null);
  const tokenParam = queryToken ?? cookieToken;

  // Only a cohort a visitor may see is enrollable: in Supabase, inviting or
  // confirmed (never draft or cancelled), and not yet started.
  const cohort = await getCohortById(cohortId);
  if (!cohort || !isCohortRenderable(cohort)) notFound();

  const program = programs.find((p) => p.id === cohort.programId);
  const sessionEmail = await signedInEmail();
  // Where a sign-in lands: this page, the invitation token kept (owner,
  // 2026-10-12: "returns to the same enroll URL with token/cookie preserved").
  const thisPage = queryToken
    ? `/enroll/${cohort.id}?invite=${encodeURIComponent(queryToken)}`
    : `/enroll/${cohort.id}`;
  const signInHref = loginHref(thisPage);

  // Private cohorts admit a valid unexpired invite token, or — when the cohort
  // is tier-gated — a signed-in holder with a player whose coach-assigned
  // level falls inside [level_min, level_max] (audit M27: any player on the
  // account, read through players.ts). Everyone else gets the friendly gate.
  // The same
  // decision (src/lib/enrollGate.ts) runs again inside /api/checkout and
  // /api/enroll/etransfer (backlog #38).
  const gate = await resolveEnrollGate(cohort, tokenParam);
  if (!gate.decision.allowed) {
    if (gate.decision.status === 404) notFound();
    const tierGated = cohort.levelMin != null || cohort.levelMax != null;
    return (
      <InviteGate
        expired={gate.decision.expired}
        signInHref={tierGated && !sessionEmail ? loginHref(`/enroll/${cohort.id}`) : null}
      />
    );
  }
  const inviteToken = gate.decision.via === "invite" ? tokenParam : null;
  // The invitation the link carries, on a public cohort as much as a private
  // one (the gate's `via` says "public" there even with a valid token): it
  // names the player, the invite being claimed, and the holder's email.
  const claimed = claimedInvite(gate.lookup);
  const inviteEmail = gate.inviteEmail ?? claimed?.email ?? null;

  // The group this cohort trains in (owner, 2026-10-12): its ages decide who
  // fits, and a by-approval group (High Performance) takes no walk-in — but
  // the player holding the invitation link is never sent back to it.
  const group = programGroups.find((g) => cohortMatchesGroup(cohort, g)) ?? null;
  if (group && approvalGateApplies({ group, decision: gate.decision, claimed })) {
    return (
      <ApprovalGate group={group} programSlug={program?.slug ?? group.programSlug} signInHref={signInHref} />
    );
  }

  const seatsRemaining = await getSeatsRemaining(cohort.id, cohort.capacityMax);
  if (seatsRemaining !== null && seatsRemaining <= 0) {
    return (
      <FullGate
        programTitle={program?.title ?? cohort.programId}
        cohortLabel={cohort.label}
        signedIn={Boolean(sessionEmail)}
      />
    );
  }

  // E-transfer cohorts (backlog #12): the payment step shows the amount after
  // the $20 assessment credit, looked up by the invite email (or the signed-in
  // player's). The server re-derives it when the player taps "I've sent it".
  let etransfer: EtransferInfo | null = null;
  if ((cohort.paymentMode ?? "card") === "etransfer") {
    const creditEmail = inviteEmail ?? sessionEmail;
    const credit = creditEmail ? await findUnusedCredit(creditEmail) : null;
    etransfer = {
      recipientEmail: etransferRecipient(),
      creditCents: credit ? Math.min(credit.creditCents, cohort.priceCents) : 0,
    };
  }

  // Who the invitation names (migration 0007), and who on the signed-in
  // account is already in this cohort (owner, 2026-10-12).
  const invitedParticipantId = claimed?.participant_id ?? null;
  const claimingInviteId = claimed?.id ?? null;
  const user = await currentUser();
  let blocked: BlockedPlayer[] = [];
  let invited: InvitedPlayer | null = null;
  if (user) {
    const participants = await listParticipantsForAccount(user.id).catch(() => []);
    const people = participants.map((p) => ({ id: p.id, name: p.full_name }));
    blocked = await blockedPlayers({
      accountId: user.id,
      email: user.email,
      cohortId: cohort.id,
      cohort,
      participants: people,
      claimingInviteId,
    });
    const own = invitedParticipantId ? participants.find((p) => p.id === invitedParticipantId) : null;
    if (own) {
      invited = {
        id: own.id,
        name: own.full_name,
        relationship: own.relationship,
        isMinor: own.is_minor,
        ageBand: isAgeBand(own.age_band) ? own.age_band : null,
        onAccount: true,
      };
    }
  } else if (invitedParticipantId) {
    // Signed out with an invitation for a named player: the typed block
    // starts on them, and the sign-in line brings their account back.
    const row = await getParticipant(invitedParticipantId).catch(() => null);
    if (row) {
      invited = {
        id: row.id,
        name: row.full_name,
        relationship: row.relationship,
        isMinor: row.is_minor,
        ageBand: isAgeBand(row.age_band) ? row.age_band : null,
        onAccount: false,
      };
    }
  }

  return (
    <EnrollWizard
      cohort={cohort}
      program={program}
      group={group}
      seatsRemaining={seatsRemaining}
      inviteToken={inviteToken}
      initialEmail={inviteEmail}
      etransfer={etransfer}
      // Admitted by level: only the players inside the band can be enrolled
      // (the payment routes refuse anyone else), so only they are offered.
      eligibleParticipantIds={
        gate.decision.via === "level" ? gate.eligibleParticipantIds : null
      }
      blocked={blocked}
      invited={invited}
      signInHref={signInHref}
    />
  );
}
