import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import type { Metadata } from "next";
import Link from "next/link";
import { programs } from "@/content/programs";
import { getCohortById } from "@/lib/cohortsDb";
import { isCohortRenderable } from "@/lib/cohortVisibility";
import { resolveEnrollGate } from "@/lib/enrollGate";
import { getSeatsRemaining } from "@/lib/seatCount";
import { createClient } from "@/lib/supabase/server";
import { findUnusedCredit } from "@/lib/assessmentCredit";
import { etransferRecipient } from "@/lib/paymentTransitions";
import { INVITE_RESUME_COOKIE } from "@/lib/checkoutInvite";
import { loginHref } from "@/lib/authFlow";
import { EnrollWizard, type EtransferInfo } from "./EnrollWizard";

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
            2-minute quiz and Sina places you in a group that fits your
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
          // Quiz first, assessment optional (audit M1).
          <>
            <Link href="/intake" className={primaryButton}>
              Take the 2-minute quiz
            </Link>
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
          <Link
            href={signInHref}
            className="rounded font-semibold text-[#B4E655] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B4E655]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#061427]"
          >
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
        Every spot in {cohortLabel} is taken. Sina will place you in the next
        group that fits your level and schedule — you&apos;ll hear by email.
      </p>
      {!signedIn && (
        <p className="mt-3 text-sm leading-relaxed text-white/65">
          Not on Sina&apos;s list yet? The 2-minute quiz puts you on it.
        </p>
      )}
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {signedIn ? (
          <Link href="/dashboard" className={primaryButton}>
            Open your dashboard
          </Link>
        ) : (
          <Link href="/intake" className={primaryButton}>
            Take the 2-minute quiz
          </Link>
        )}
        <Link href="/programs" className={secondaryButton}>
          Browse Programs
        </Link>
      </div>
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

  // Private cohorts admit a valid unexpired invite token, or — when the cohort
  // is tier-gated — a signed-in player whose coach-assigned level falls inside
  // [level_min, level_max]. Everyone else gets the friendly gate. The same
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
  const inviteEmail = gate.inviteEmail;

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

  return (
    <EnrollWizard
      cohort={cohort}
      program={program}
      seatsRemaining={seatsRemaining}
      inviteToken={inviteToken}
      initialEmail={inviteEmail}
      etransfer={etransfer}
    />
  );
}
