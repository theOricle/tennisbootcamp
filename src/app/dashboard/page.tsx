import { redirect } from "next/navigation";
import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { programs, listedPrograms } from "@/content/programs";
import {
  getAllCohorts,
  getOpenCohortsForLevel,
  getSessionsForCohorts,
  type CohortSessionRow,
} from "@/lib/cohortsDb";
import { todayIso } from "@/lib/cohortVisibility";
import {
  listParticipantsForAccount,
  ensureSelfParticipant,
  type PlayerRecord,
} from "@/lib/players";
import { VENUE_LINE } from "@/lib/membership";
import { suggestProgramsFor } from "@/lib/programCatalog";
import { DashboardView, SURFACE, type DashboardEnrollment } from "./DashboardView";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Your Tennis Bootcamp training dashboard — enrollments and upcoming programs.",
  robots: { index: false, follow: false },
};

// ─── Skeleton ────────────────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="animate-pulse space-y-10">
      {/* Header card ghost — welcome on the left, next step on the right */}
      <div className={`${SURFACE} p-6 md:p-8`}>
        <div className="grid gap-6 lg:grid-cols-5 lg:gap-10">
          <div className="space-y-3 lg:col-span-2">
            <div className="h-8 w-56 rounded bg-white/10" />
            <div className="h-3 w-44 rounded bg-white/5" />
            <div className="mt-5 h-10 w-40 rounded-full bg-white/5" />
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#061427]/60 p-5 md:p-6 lg:col-span-3">
            <div className="h-3 w-20 rounded bg-[#B4E655]/20" />
            <div className="mt-3 h-6 w-3/4 rounded bg-white/10" />
            <div className="mt-3 h-3 w-full rounded bg-white/5" />
            <div className="mt-5 h-11 w-44 rounded-full bg-white/10" />
          </div>
        </div>
      </div>

      <div className="grid gap-10 lg:grid-cols-3 lg:gap-8">
        {/* My programs — two card silhouettes */}
        <div className="space-y-4 lg:col-span-2">
          <div className="h-6 w-32 rounded bg-white/10" />
          {[0, 1].map((i) => (
            <div key={i} className={`${SURFACE} p-5 md:p-6`}>
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-2">
                  <div className="h-5 w-36 rounded bg-white/10" />
                  <div className="h-3 w-48 rounded bg-white/5" />
                </div>
                <div className="h-6 w-16 rounded-full bg-[#B4E655]/10" />
              </div>
              <div className="mt-4 space-y-2 border-t border-white/10 pt-3">
                <div className="h-3 w-40 rounded bg-white/5" />
                <div className="h-3 w-44 rounded bg-white/5" />
              </div>
            </div>
          ))}
        </div>

        {/* Side column — level card ghost, then the static venue line */}
        <div className="space-y-6">
          <div className={`${SURFACE} p-5 md:p-6`}>
            <div className="h-5 w-24 rounded bg-white/10" />
            <div className="mt-4 h-10 w-full rounded bg-white/5" />
            <div className="mt-4 h-11 w-full rounded-full bg-white/5" />
          </div>
          <div className={`${SURFACE} p-5 md:p-6`}>
            <h2 className="text-base font-semibold text-white">Where we train</h2>
            <p className="mt-2 text-sm leading-relaxed text-white/70">{VENUE_LINE}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Error state ─────────────────────────────────────────────────────────────

function DashboardErrorState() {
  return (
    <div className="py-20 text-center">
      <p className="text-sm text-white/60">Couldn&apos;t load your dashboard right now.</p>
      <Link
        href="/dashboard"
        className="mt-4 inline-block rounded-full bg-white/10 px-5 py-2 text-sm font-semibold text-white hover:bg-white/15"
      >
        Refresh
      </Link>
    </div>
  );
}

// ─── Data component ───────────────────────────────────────────────────────────

async function DashboardContent({
  userId,
  userEmail,
}: {
  userId: string;
  userEmail: string;
}) {
  const supabase = await createClient();

  // Everyone on this account, read with the holder's session (RLS) through the
  // shared players helper. A brand-new account gets its 'self' participant on
  // first load, so the page is never empty.
  await ensureSelfParticipant(userId).catch(() => null);

  const [playersResult, { data: enrollments, error: enrollError }] = await Promise.all([
    listParticipantsForAccount(userId, supabase).then(
      (p) => ({ players: p, error: null as string | null }),
      (err: unknown) => ({
        players: [] as PlayerRecord[],
        error: err instanceof Error ? err.message : "player read failed",
      })
    ),
    supabase
      .from("enrollments")
      .select("id, cohort_id, program, participant_name, status, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
  ]);
  const players = playersResult.players;
  const self = players.find((p) => p.relationship === "self") ?? players[0] ?? null;

  if (playersResult.error || enrollError) {
    return <DashboardErrorState />;
  }

  const firstName = self?.full_name?.trim().split(/\s+/)[0] || userEmail || "";
  const rows = (enrollments ?? []) as DashboardEnrollment[];

  const cohorts = await getAllCohorts();
  const enrolledCohortIds = [...new Set(rows.map((e) => e.cohort_id).filter(Boolean))];
  const [cohortSessions, tierCohorts] = await Promise.all([
    getSessionsForCohorts(enrolledCohortIds),
    getOpenCohortsForLevel(self?.level ?? null),
  ]);
  const sessionsByCohort: Record<string, CohortSessionRow[]> = {};
  for (const s of cohortSessions) {
    (sessionsByCohort[s.cohort_id] ??= []).push(s);
  }
  // A cohort you're already enrolled in isn't an "open for your tier" pitch.
  const openForTier = tierCohorts.filter((c) => !enrolledCohortIds.includes(c.id));

  const enrolledProgramIds = new Set(
    rows.map((e) => {
      const cohort = cohorts.find((c) => c.id === e.cohort_id);
      return cohort?.programId ?? e.program ?? "";
    })
  );
  // Suggestions come from the public catalog only, filtered by every player's
  // age band and level (audit M31); `programs` (above) still resolves retired
  // ids so old enrollment rows keep their title.
  const suggestions = suggestProgramsFor(players, listedPrograms, enrolledProgramIds);

  return (
    <DashboardView
      firstName={firstName}
      self={self}
      players={players}
      enrollments={rows}
      cohorts={cohorts}
      sessionsByCohort={sessionsByCohort}
      openForTier={openForTier}
      suggestions={suggestions}
      programs={programs}
      today={todayIso()}
    />
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <main className="min-h-screen bg-[#061427] text-white">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <Suspense fallback={<DashboardSkeleton />}>
          <DashboardContent userId={user.id} userEmail={user.email ?? ""} />
        </Suspense>
      </div>
    </main>
  );
}
