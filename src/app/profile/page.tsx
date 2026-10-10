import { redirect } from "next/navigation";
import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { programs } from "@/content/programs";
import { getAllCohorts } from "@/lib/cohortsDb";
import { getSelfParticipant, type PlayerRecord } from "@/lib/players";
import { placedSpanFor } from "@/lib/tiers";
import { RankCard } from "@/components/tiers";
import { ProfileForm } from "./ProfileForm";

export const metadata: Metadata = {
  title: "Profile",
  description: "Manage your Tennis Bootcamp account details and enrollments.",
  robots: { index: false, follow: false },
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function statusLabel(s: string): string {
  if (s === "paid") return "Enrolled";
  if (s === "test_paid") return "Test enrolled";
  return s;
}

function statusClass(s: string): string {
  if (s === "paid") return "bg-[#B4E655]/15 text-[#B4E655]";
  if (s === "test_paid") return "bg-yellow-400/15 text-yellow-300";
  return "bg-white/10 text-white/60";
}

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
  // profile row still supplies the contact fields the form edits.
  const [{ data: profile, error: profileError }, { data: enrollments, error: enrollError }, selfResult] =
    await Promise.all([
      supabase.from("profiles").select("full_name, phone").eq("id", userId).single(),
      supabase
        .from("enrollments")
        .select("id, cohort_id, program, participant_name, status, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false }),
      getSelfParticipant(userId, supabase).then(
        (p) => ({ player: p, error: null as string | null }),
        (err: unknown) => ({
          player: null as PlayerRecord | null,
          error: err instanceof Error ? err.message : "player read failed",
        })
      ),
    ]);

  const realProfileError = profileError && profileError.code !== "PGRST116";
  if (realProfileError || enrollError || selfResult.error) {
    return <ProfileErrorState />;
  }

  const cohorts = await getAllCohorts();
  const rows = enrollments ?? [];

  // The RankCard (audit M24): the same card as the dashboard. A brand-new
  // account may have no 'self' participant yet; it reads as unranked. The
  // assessment is offered only while the account has no enrollment (design
  // specs §3.6), and never as a rank. A quiz-placed player in a banded cohort
  // shows the Placed state instead (audit L17, owner D6-B).
  const player: PlayerRecord = selfResult.player ?? {
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
  const placedSpan = placedSpanFor(player, rows, cohorts, { soloAccount: true });

  return (
    <>
      {/* Profile details */}
      <section className="mb-12">
        <div className="mb-4 border-l-2 border-[#B4E655] pl-4">
          <h1 className="text-xl font-semibold text-white">Profile</h1>
        </div>
        <div className="border-b border-white/10 mb-6" />
        <RankCard
          player={player}
          layout="compact"
          isSelf
          placedSpan={placedSpan}
          assessmentLink={rows.length === 0}
          headingLevel="h2"
          className="mb-8"
        />
        <ProfileForm
          userId={userId}
          email={userEmail}
          initialFullName={profile?.full_name ?? ""}
          initialPhone={profile?.phone ?? ""}
        />
      </section>

      {/* Enrollments */}
      <section>
        <div className="mb-4 border-l-2 border-[#B4E655] pl-4">
          <h2 className="text-xl font-semibold text-white">My enrollments</h2>
        </div>
        <div className="border-b border-white/10 mb-6" />

        {!enrollments || enrollments.length === 0 ? (
          <div className="space-y-4">
            <p className="text-sm text-white/60">No enrollments yet.</p>
            <Link
              href="/programs"
              className="inline-block rounded-full bg-[#B4E655] px-5 py-2 text-sm font-semibold text-[#061427] hover:brightness-110 transition-filter"
            >
              Browse Programs
            </Link>
          </div>
        ) : (
          <ul className="space-y-4">
            {enrollments.map((e) => {
              const cohort = cohorts.find((c) => c.id === e.cohort_id);
              const program = programs.find(
                (p) => p.id === (cohort?.programId ?? e.program)
              );
              return (
                <li
                  key={e.id}
                  className="flex items-start justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 px-5 py-4"
                >
                  <div>
                    <p className="font-semibold text-white">
                      {program?.title ?? e.program ?? e.cohort_id}
                    </p>
                    {cohort && (
                      <p className="mt-0.5 text-sm text-white/60">
                        {fmtDate(cohort.startDate)} – {fmtDate(cohort.endDate)}
                      </p>
                    )}
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${statusClass(e.status)}`}
                  >
                    {statusLabel(e.status)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
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
