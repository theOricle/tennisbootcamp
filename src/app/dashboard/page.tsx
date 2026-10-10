import { redirect } from "next/navigation";
import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { programs, listedPrograms } from "@/content/programs";
import {
  getAllCohorts,
  getOpenCohortsForPlayers,
  getSessionsForCohorts,
  type CohortSessionRow,
} from "@/lib/cohortsDb";
import { todayIso } from "@/lib/cohortVisibility";
import {
  listParticipantsForAccount,
  ensureSelfParticipant,
  type PlayerRecord,
} from "@/lib/players";
import { listInvitesForAccount, type AccountInvite } from "@/lib/cohortActions";
import { listUpcomingBookingsForAccount, type AccountBooking } from "@/lib/assessments";
import { listUnusedCreditsForAccount, type AccountCredit } from "@/lib/assessmentCredit";
import { etransferRecipient } from "@/lib/paymentTransitions";
import { VENUE_LINE } from "@/lib/membership";
import { programTakesPlayerAge, suggestProgramsFor } from "@/lib/programCatalog";
import { hasLevel, placedSpanFor, type PlacedSpan } from "@/lib/tiers";
import { rosterVoice, trainingRoster } from "@/lib/householdView";
import { creditLine, nextStepFor, welcomeHeading } from "@/lib/dashboardState";
import { DashboardView, SURFACE, type DashboardEnrollment } from "./DashboardView";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Your Tennis Bootcamp training dashboard — enrollments and upcoming programs.",
  robots: { index: false, follow: false },
};

// ─── Skeleton ────────────────────────────────────────────────────────────────

/** The RankCard's ghost (audit M24): emblem, three lines and the seven rail groups. */
const RAIL_GHOST_HEIGHTS = ["h-[6px]", "h-[8px]", "h-[10px]", "h-[12px]", "h-[14px]", "h-[16px]", "h-[18px]"];

function RankCardGhost() {
  return (
    <div className={`${SURFACE} border-t-2 border-t-white/15 p-5 md:p-6`}>
      <div className="md:flex md:items-start md:gap-8">
        <div className="flex items-start gap-5 md:w-[280px] md:shrink-0">
          <div className="h-20 w-20 shrink-0 rounded-[22px] bg-white/5" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3 w-16 rounded bg-[#B4E655]/20" />
            <div className="h-3 w-20 rounded bg-white/5" />
            <div className="h-7 w-28 rounded bg-white/10" />
            <div className="h-3 w-16 rounded bg-white/5" />
          </div>
        </div>
        <div className="mt-6 flex flex-1 items-end gap-1.5 md:mt-8">
          {RAIL_GHOST_HEIGHTS.map((h, i) => (
            <div key={i} className="flex flex-1 items-end gap-[2px]">
              <div className={`flex-1 rounded-[1px] bg-white/[0.10] ${h}`} />
              {i < 6 && <div className={`flex-1 rounded-[1px] bg-white/[0.10] ${h}`} />}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4 h-3 w-48 rounded bg-white/5" />
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="animate-pulse space-y-10">
      {/* Header card ghost — welcome on the left, next step on the right */}
      <div className={`${SURFACE} p-6 md:p-8`}>
        <div className="grid gap-6 lg:grid-cols-5 lg:gap-10">
          <div className="space-y-3 lg:col-span-2">
            <div className="h-8 w-56 rounded bg-white/10" />
            <div className="h-3 w-44 rounded bg-white/5" />
            <div className="mt-3 h-11 w-24 rounded bg-white/5" />
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#061427]/60 p-5 md:p-6 lg:col-span-3">
            <div className="h-3 w-20 rounded bg-[#B4E655]/20" />
            <div className="mt-3 h-6 w-3/4 rounded bg-white/10" />
            <div className="mt-3 h-3 w-full rounded bg-white/5" />
            <div className="mt-5 h-11 w-44 rounded-full bg-white/10" />
          </div>
        </div>
      </div>

      {/* Tier section ghost */}
      <RankCardGhost />

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

        {/* Side column — week card ghost, then the static venue line */}
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

  const [playersResult, { data: enrollments, error: enrollError }, cohorts] = await Promise.all([
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
    getAllCohorts(),
  ]);
  const players = playersResult.players;
  const self = players.find((p) => p.relationship === "self") ?? players[0] ?? null;

  if (playersResult.error || enrollError) {
    return <DashboardErrorState />;
  }

  const firstName = self?.full_name?.trim().split(/\s+/)[0] || userEmail || "";
  const rows = (enrollments ?? []) as DashboardEnrollment[];
  const today = todayIso();
  const participantIds = players.map((p) => p.id);

  // The states fall-2026 players are in (audit M25): an invite on hold, an
  // e-transfer waiting on Sina, a booked assessment, an unused $20. Read with
  // the service client, scoped to this account's id, email and players.
  const [invites, bookings, credits] = await Promise.all([
    listInvitesForAccount({ accountId: userId, email: userEmail, participantIds, cohorts }).catch(
      () => [] as AccountInvite[]
    ),
    listUpcomingBookingsForAccount({ accountId: userId, email: userEmail, participantIds, today }).catch(
      () => [] as AccountBooking[]
    ),
    listUnusedCreditsForAccount({ email: userEmail, participantIds }).catch(() => [] as AccountCredit[]),
  ]);

  // Who trains (audit M26): a holder who only registered a child is the
  // account, not a player — no unranked card, no availability card, no
  // "Sina will place you".
  const evidence = {
    participantIds: [
      ...invites.map((i) => i.participant_id ?? null),
      ...bookings.map((b) => b.participantId),
      ...credits.map((c) => c.participantId),
    ],
    enrollmentNames: rows.map((r) => r.participant_name),
  };
  const roster = trainingRoster(players, evidence);
  const voice = rosterVoice(roster, self?.id);

  const enrolledCohortIds = [...new Set(rows.map((e) => e.cohort_id).filter(Boolean))];
  const [cohortSessions, tierMatches] = await Promise.all([
    getSessionsForCohorts(enrolledCohortIds),
    // Per player (audit M27): one numeric rule, the same one /enroll admits by.
    getOpenCohortsForPlayers(roster),
  ]);
  const sessionsByCohort: Record<string, CohortSessionRow[]> = {};
  for (const s of cohortSessions) {
    (sessionsByCohort[s.cohort_id] ??= []).push(s);
  }
  // A cohort the account is already enrolled in isn't an "open for your tier"
  // pitch, and a cohort only lists the players its program's ages take (a
  // child is never offered an adult group on level alone).
  const openForTier = tierMatches
    .filter((m) => !enrolledCohortIds.includes(m.cohort.id))
    .map((m) => {
      const program = programs.find((p) => p.id === m.cohort.programId);
      return {
        cohort: m.cohort,
        players: program ? m.players.filter((p) => programTakesPlayerAge(program, p)) : m.players,
      };
    })
    .filter((m) => m.players.length > 0);

  const enrolledProgramIds = new Set(
    rows.map((e) => {
      const cohort = cohorts.find((c) => c.id === e.cohort_id);
      return cohort?.programId ?? e.program ?? "";
    })
  );
  // Suggestions come from the public catalog only, filtered by each player's
  // age band and level (audit M31) — the players who train, not the holder
  // of a child-only account; `programs` (above) still resolves retired ids
  // so old enrollment rows keep their title.
  const suggestions = suggestProgramsFor(roster, listedPrograms, enrolledProgramIds);

  // The Placed state (audit L17, owner D6-B): a player with no level who is
  // enrolled in a tier-banded cohort shows that band instead of "Unranked".
  // Enrollment rows name the player, so a household matches rows by name; an
  // account with one player claims every row on it.
  const placedSpans: Record<string, PlacedSpan | null> = {};
  // A cancelled cohort places nobody (audit M30).
  const liveCohorts = cohorts.filter((c) => c.dbStatus !== "cancelled");
  for (const player of roster) {
    placedSpans[player.id] = placedSpanFor(player, rows, liveCohorts, {
      soloAccount: players.length === 1,
    });
  }

  const nextStep = nextStepFor({
    selfId: self?.id ?? null,
    roster,
    voice,
    enrollments: rows,
    cohorts,
    sessionsByCohort,
    programs,
    invites,
    bookings,
    recipientEmail: etransferRecipient(),
    today,
    now: new Date().toISOString(),
  });
  const returning =
    rows.length > 0 || invites.length > 0 || bookings.length > 0 || roster.some((p) => hasLevel(p.level));

  return (
    <DashboardView
      heading={welcomeHeading(firstName, returning)}
      self={self}
      players={players}
      roster={roster}
      voice={voice}
      nextStep={nextStep}
      creditLine={creditLine(credits, roster, self?.id ?? null)}
      enrollments={rows}
      cohorts={cohorts}
      sessionsByCohort={sessionsByCohort}
      openForTier={openForTier}
      suggestions={suggestions}
      programs={programs}
      placedSpans={placedSpans}
      today={today}
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
