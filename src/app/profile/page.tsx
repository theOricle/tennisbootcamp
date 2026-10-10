import { redirect } from "next/navigation";
import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getAllCohorts } from "@/lib/cohortsDb";
import { listParticipantsForAccount, type PlayerRecord } from "@/lib/players";
import { listInvitesForAccount } from "@/lib/cohortActions";
import { listUpcomingBookingsForAccount } from "@/lib/assessments";
import { listUnusedCreditsForAccount } from "@/lib/assessmentCredit";
import { todayIso } from "@/lib/cohortVisibility";
import { placedSpanFor } from "@/lib/tiers";
import { holderIsPlayer } from "@/lib/householdView";
import { ProfileView } from "./ProfileView";

export const metadata: Metadata = {
  title: "Profile",
  description: "Manage your Tennis Bootcamp account details and enrollments.",
  robots: { index: false, follow: false },
};

// ─── Skeleton ────────────────────────────────────────────────────────────────

function ProfileSkeleton() {
  return (
    <div className="animate-pulse">
      {/* Profile section ghost */}
      <section className="mb-12">
        <div className="mb-4 border-l-2 border-[#B4E655] pl-4">
          <div className="h-5 w-16 rounded bg-white/10" />
        </div>
        <div className="mb-6 border-b border-white/10" />
        {/* The RankCard's ghost (audit M24) */}
        <div className="mb-8 rounded-2xl border border-white/10 border-t-2 border-t-white/15 bg-white/5 p-5 md:p-6">
          <div className="flex items-start gap-4">
            <div className="h-16 w-16 shrink-0 rounded-[18px] bg-white/5" />
            <div className="space-y-2">
              <div className="h-3 w-16 rounded bg-[#B4E655]/20" />
              <div className="h-7 w-28 rounded bg-white/10" />
              <div className="h-3 w-16 rounded bg-white/5" />
            </div>
          </div>
          <div className="mt-5 h-[18px] w-full rounded bg-white/5" />
          <div className="mt-4 h-3 w-48 rounded bg-white/5" />
        </div>
        <div className="space-y-5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="grid gap-1.5">
              <div className="h-3 w-16 rounded bg-white/10" />
              <div className="h-11 w-full rounded-2xl bg-white/5" />
            </div>
          ))}
          <div className="h-10 w-28 rounded-full bg-[#B4E655]/10" />
        </div>
      </section>

      {/* Enrollments section ghost */}
      <section>
        <div className="mb-4 border-l-2 border-[#B4E655] pl-4">
          <div className="h-5 w-32 rounded bg-white/10" />
        </div>
        <div className="mb-6 border-b border-white/10" />
        <div className="space-y-4">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="flex items-start justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 px-5 py-4"
            >
              <div className="space-y-1.5">
                <div className="h-4 w-40 rounded bg-white/10" />
                <div className="h-3 w-28 rounded bg-white/5" />
              </div>
              <div className="h-6 w-20 rounded-full bg-white/5" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// ─── Error state ─────────────────────────────────────────────────────────────

function ProfileErrorState() {
  return (
    <div className="py-20 text-center">
      <p className="text-sm text-white/60">Couldn&apos;t load your profile right now.</p>
      <Link
        href="/profile"
        className="mt-4 inline-block rounded-full bg-white/10 px-5 py-2 text-sm font-semibold text-white hover:bg-white/15"
      >
        Refresh
      </Link>
    </div>
  );
}

// ─── Data component ───────────────────────────────────────────────────────────

async function ProfileContent({
  userId,
  userEmail,
}: {
  userId: string;
  userEmail: string;
}) {
  const supabase = await createClient();

  // The level is read through players.ts, the one place level and
  // availability live (CLAUDE.md), under the holder's own session (RLS); the
  // profile row still supplies the contact fields the form edits. The whole
  // household is read, not just the holder: the Placed state below needs to
  // know whether the account's enrollment rows can be the holder's, and the
  // other players are managed on this page (audit M34).
  const [{ data: profile, error: profileError }, { data: enrollments, error: enrollError }, playersResult] =
    await Promise.all([
      supabase.from("profiles").select("full_name, phone").eq("id", userId).single(),
      supabase
        .from("enrollments")
        .select("id, cohort_id, program, participant_name, status, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false }),
      listParticipantsForAccount(userId, supabase).then(
        (p) => ({ players: p, error: null as string | null }),
        (err: unknown) => ({
          players: [] as PlayerRecord[],
          error: err instanceof Error ? err.message : "player read failed",
        })
      ),
    ]);

  const realProfileError = profileError && profileError.code !== "PGRST116";
  if (realProfileError || enrollError || playersResult.error) {
    return <ProfileErrorState />;
  }
  const participants = playersResult.players;
  const self = participants.find((p) => p.relationship === "self") ?? null;

  const cohorts = await getAllCohorts();
  const rows = enrollments ?? [];
  const participantIds = participants.map((p) => p.id);

  // Is the holder one of the players (audit M26)? The same evidence the
  // dashboard reads, so a parent who registered only a child gets no
  // unranked card of their own here either.
  const [invites, bookings, credits] = await Promise.all([
    listInvitesForAccount({ accountId: userId, email: userEmail, participantIds, cohorts }).catch(
      () => []
    ),
    listUpcomingBookingsForAccount({
      accountId: userId,
      email: userEmail,
      participantIds,
      today: todayIso(),
    }).catch(() => []),
    listUnusedCreditsForAccount({ email: userEmail, participantIds }).catch(() => []),
  ]);

  // The RankCard (audit M24): the same card as the dashboard. A brand-new
  // account may have no 'self' participant yet; it reads as unranked. The
  // assessment is offered only while the account has no enrollment (design
  // specs §3.6), and never as a rank. A quiz-placed player in a banded cohort
  // shows the Placed state instead (audit L17, owner D6-B). Only an account
  // with no one else on it claims every enrollment row, exactly as the
  // dashboard does; in a household the holder matches rows by name, so a
  // child's cohort never reads as the parent's group.
  const player: PlayerRecord = self ?? {
    id: userId,
    account_id: userId,
    full_name: profile?.full_name ?? null,
    relationship: "self",
    is_minor: false,
    level: null,
    level_assessed_at: null,
    level_notes: null,
    availability: { days: {}, v: 1 },
    availability_updated_at: null,
    availability_source: null,
    availability_note: null,
  };
  // A one-person account (the holder alone, or no participant row yet) is the
  // dashboard's `players.length === 1`; an account whose only row is a child
  // is not solo here, because this card is the holder's, not the child's.
  const soloAccount =
    participants.length <= 1 && participants.every((p) => p.relationship === "self");
  // A cancelled cohort places nobody (audit M30).
  const placedSpan = placedSpanFor(
    player,
    rows,
    cohorts.filter((c) => c.dbStatus !== "cancelled"),
    { soloAccount }
  );
  const holderPlays = holderIsPlayer(player, participants.length > 0 ? participants : [player], {
    participantIds: [
      ...invites.map((i) => i.participant_id ?? null),
      ...bookings.map((b) => b.participantId),
      ...credits.map((c) => c.participantId),
    ],
    enrollmentNames: rows.map((r) => r.participant_name),
  });
  return (
    <ProfileView
      email={userEmail}
      fullName={profile?.full_name ?? ""}
      phone={profile?.phone ?? ""}
      holder={holderPlays ? player : null}
      holderPlacedSpan={placedSpan}
      others={participants.filter((p) => p.id !== player.id)}
      enrollments={rows}
      cohorts={cohorts}
    />
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <main className="min-h-screen bg-[#061427] text-white">
      <div className="mx-auto max-w-2xl px-6 py-12">
        <Suspense fallback={<ProfileSkeleton />}>
          <ProfileContent userId={user.id} userEmail={user.email ?? ""} />
        </Suspense>
      </div>
    </main>
  );
}
