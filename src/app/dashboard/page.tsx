import { redirect } from "next/navigation";
import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { programs } from "@/content/programs";
import {
  getAllCohorts,
  getOpenCohortsForLevel,
  getSessionsForCohorts,
  type CohortSessionRow,
} from "@/lib/cohortsDb";
import { dayNameForDate } from "@/lib/makeup";
import { getPlayer } from "@/lib/players";
import { VENUE_LINE } from "@/lib/membership";
import { TierStatus, TierRangeBadges } from "@/components/tiers";
import { AvailabilityEditor } from "./AvailabilityEditor";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Your Tennis Bootcamp training dashboard — enrollments and upcoming programs.",
  robots: { index: false, follow: false },
};

const DAY_NAMES: Record<string, string> = {
  Mon: "Mondays",
  Tue: "Tuesdays",
  Wed: "Wednesdays",
  Thu: "Thursdays",
  Fri: "Fridays",
  Sat: "Saturdays",
  Sun: "Sundays",
};

function fmt12h(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const hour = h % 12 || 12;
  return m === 0 ? `${hour}${suffix}` : `${hour}:${String(m).padStart(2, "0")}${suffix}`;
}

function ageLabel(ageGroup: string): string {
  return ageGroup.replace(/^Ages?\s*/i, "").replace(/^Adults?\s*/i, "");
}

function fmtSessionDate(iso: string): string {
  const [y, mo, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d)).toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Full dated session list for an enrolled cohort, make-ups badged with the
 * session they replace. Falls back to null when the cohort has no generated
 * rows yet (unconfirmed, or static-fallback data) — callers then render the
 * weekly-slots summary instead.
 */
function SessionList({ sessions }: { sessions: CohortSessionRow[] }) {
  const byId = new Map(sessions.map((s) => [s.id, s]));
  const visible = sessions.filter((s) => s.status !== "cancelled");
  if (visible.length === 0) return null;
  return (
    <ul className="mt-2 space-y-1 text-sm text-white/70">
      {visible.map((s) => {
        const replaces = s.makeup_for ? byId.get(s.makeup_for) : undefined;
        return (
          <li key={s.id} className="flex flex-wrap items-center gap-2">
            <span>
              {dayNameForDate(s.session_date)} {fmtSessionDate(s.session_date)} ·{" "}
              {fmt12h(s.start_time.slice(0, 5))}–{fmt12h(s.end_time.slice(0, 5))}
            </span>
            {s.makeup_for && (
              <span className="rounded-full bg-sky-400/15 px-2 py-0.5 text-[11px] font-semibold text-sky-200">
                Make-up{replaces ? ` · replaces ${fmtSessionDate(replaces.session_date)}` : ""}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="animate-pulse">
      {/* Page header ghost — mirrors the top-left welcome header */}
      <div className="mb-12 flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <div className="h-8 w-56 rounded bg-white/10" />
          <div className="h-3 w-44 rounded bg-white/5" />
        </div>
        <div className="h-4 w-20 rounded bg-white/5" />
      </div>

      <div className="grid grid-cols-1 gap-12 md:grid-cols-3">
        {/* My programs — three card silhouettes */}
        <section>
          <div className="border-l-2 border-[#B4E655] pl-4">
            <div className="h-5 w-28 rounded bg-white/10" />
          </div>
          <div className="mb-6 mt-2 border-b border-white/10" />
          <div className="space-y-8">
            {[0, 1, 2].map((i) => (
              <div key={i}>
                <div className="h-4 w-36 rounded bg-[#B4E655]/10" />
                <div className="mt-2 flex items-start justify-between gap-4">
                  <div className="space-y-1.5">
                    <div className="h-3 w-32 rounded bg-white/5" />
                    <div className="h-3 w-24 rounded bg-white/5" />
                  </div>
                  <div className="h-10 w-16 rounded-lg bg-white/5" />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Suggested — ghost links */}
        <section>
          <div className="border-l-2 border-[#B4E655] pl-4">
            <div className="h-5 w-32 rounded bg-white/10" />
          </div>
          <div className="mb-6 mt-2 border-b border-white/10" />
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-3 w-40 rounded bg-white/5" />
            ))}
          </div>
        </section>

        {/* Where we train — static line, rendered immediately below */}
        <section>
          <div className="border-l-2 border-[#B4E655] pl-4">
            <h2 className="text-lg font-semibold text-white">Where we train</h2>
          </div>
          <div className="mb-6 mt-2 border-b border-white/10" />
          <p className="text-sm text-white/70">{VENUE_LINE}</p>
        </section>
      </div>
    </div>
  );
}

// ─── Error state ─────────────────────────────────────────────────────────────

function DashboardErrorState() {
  return (
    <div className="py-20 text-center">
      <p className="text-sm text-white/50">Couldn&apos;t load your dashboard right now.</p>
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

  // The player's own row, read with their session (RLS) through the shared
  // players helper. A missing row (brand-new user) is null, not an error.
  const [profileResult, { data: enrollments, error: enrollError }] = await Promise.all([
    getPlayer(userId, supabase).then(
      (p) => ({ profile: p, error: null as string | null }),
      (err: unknown) => ({
        profile: null,
        error: err instanceof Error ? err.message : "profile read failed",
      })
    ),
    supabase
      .from("enrollments")
      .select("id, cohort_id, program, participant_name, status, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
  ]);
  const profile = profileResult.profile;

  if (profileResult.error || enrollError) {
    return <DashboardErrorState />;
  }

  const firstName = profile?.full_name?.trim().split(/\s+/)[0] || userEmail || "";

  const cohorts = await getAllCohorts();
  const enrolledCohortIds = [
    ...new Set((enrollments ?? []).map((e) => e.cohort_id).filter(Boolean)),
  ];
  const [cohortSessions, tierCohorts] = await Promise.all([
    getSessionsForCohorts(enrolledCohortIds),
    getOpenCohortsForLevel(profile?.level ?? null),
  ]);
  const sessionsByCohort = new Map<string, CohortSessionRow[]>();
  for (const s of cohortSessions) {
    const list = sessionsByCohort.get(s.cohort_id) ?? [];
    list.push(s);
    sessionsByCohort.set(s.cohort_id, list);
  }
  // A cohort you're already enrolled in isn't an "open for your tier" pitch.
  const openForTier = tierCohorts.filter(
    (c) => !enrolledCohortIds.includes(c.id)
  );

  const enrolledProgramIds = new Set(
    (enrollments ?? []).map((e) => {
      const cohort = cohorts.find((c) => c.id === e.cohort_id);
      return cohort?.programId ?? e.program ?? "";
    })
  );
  const suggestedPrograms = programs.filter((p) => !enrolledProgramIds.has(p.id));

  return (
    <>
      {/* Page header */}
      <div className="mb-12 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white md:text-3xl">
            Welcome back{firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="mt-1 text-sm text-white/60">
            Your enrollments and upcoming programs.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <TierStatus level={profile?.level ?? null} />
          <Link
            href="/profile"
            className="rounded-full text-sm font-semibold text-white/70 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B4E655]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#061427]"
          >
            Edit profile
          </Link>
        </div>
      </div>

      {/* Three-column grid */}
      <div className="grid grid-cols-1 gap-12 md:grid-cols-3">

        {/* My Programs */}
        <section>
          <div className="border-l-2 border-[#B4E655] pl-4">
            <h2 className="text-lg font-semibold text-white">My programs</h2>
          </div>
          <div className="mb-6 mt-2 border-b border-white/10" />

          {!enrollments || enrollments.length === 0 ? (
            <div className="space-y-4">
              <p className="text-sm text-white/60">
                You haven&apos;t enrolled in any programs yet.
              </p>
              <Link
                href="/programs"
                className="inline-block rounded-full bg-[#B4E655] px-5 py-2 text-sm font-semibold text-[#061427] hover:brightness-110 transition-filter"
              >
                Browse Programs
              </Link>
            </div>
          ) : (
            <div className="space-y-8">
              {enrollments.map((enrollment) => {
                const cohort = cohorts.find((c) => c.id === enrollment.cohort_id);
                const program = programs.find(
                  (p) => p.id === (cohort?.programId ?? enrollment.program)
                );
                const dated = sessionsByCohort.get(enrollment.cohort_id) ?? [];
                const hasDated =
                  dated.filter((s) => s.status !== "cancelled").length > 0;
                return (
                  <div key={enrollment.id}>
                    <p className="font-bold text-[#B4E655]">
                      {program?.title ?? enrollment.program ?? enrollment.cohort_id}
                    </p>
                    <div className="mt-2 flex items-start justify-between gap-4">
                      <div className="min-w-0 space-y-0.5 text-sm text-white/70">
                        {enrollment.participant_name && (
                          <p>Student: {enrollment.participant_name}</p>
                        )}
                        {hasDated ? (
                          <SessionList sessions={dated} />
                        ) : (
                          cohort?.sessions.map((s) => (
                            <p key={s.day}>
                              {DAY_NAMES[s.day] ?? s.day} {fmt12h(s.start)}–{fmt12h(s.end)}
                            </p>
                          ))
                        )}
                      </div>
                      {program?.ageGroup && (
                        <span className="shrink-0 self-start rounded-full bg-[#B4E655]/10 px-3 py-1 text-xs font-semibold text-[#B4E655]">
                          Age {ageLabel(program.ageGroup)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Open cohorts matching the player's tier */}
          {openForTier.length > 0 && (
            <div className="mt-10">
              <div className="border-l-2 border-[#B4E655] pl-4">
                <h2 className="text-lg font-semibold text-white">
                  Open for your tier
                </h2>
              </div>
              <div className="mb-6 mt-2 border-b border-white/10" />
              <div className="space-y-4">
                {openForTier.map((c) => {
                  const program = programs.find((p) => p.id === c.programId);
                  return (
                    <div
                      key={c.id}
                      className="rounded-xl border border-white/10 bg-white/5 px-4 py-3"
                    >
                      <p className="font-semibold text-white">
                        {program?.title ?? c.programId} · {c.label}
                      </p>
                      <TierRangeBadges
                        levelMin={c.levelMin}
                        levelMax={c.levelMax}
                        className="mt-1.5"
                      />
                      <p className="mt-1.5 text-sm text-white/60">
                        Starts {fmtSessionDate(c.startDate)} · {c.weeks} week
                        {c.weeks === 1 ? "" : "s"} ·{" "}
                        {c.sessions
                          .map(
                            (s) =>
                              `${DAY_NAMES[s.day] ?? s.day} ${fmt12h(s.start)}–${fmt12h(s.end)}`
                          )
                          .join(", ")}
                      </p>
                      <Link
                        href={`/enroll/${c.id}`}
                        className="mt-3 inline-flex min-h-[44px] items-center rounded-full bg-[#B4E655] px-5 text-sm font-semibold text-[#061427] transition hover:brightness-110"
                      >
                        Enroll →
                      </Link>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* Suggested for you */}
        <section>
          <div className="border-l-2 border-[#B4E655] pl-4">
            <h2 className="text-lg font-semibold text-white">Suggested for you</h2>
          </div>
          <div className="mb-6 mt-2 border-b border-white/10" />

          {suggestedPrograms.length === 0 ? (
            <p className="text-sm text-white/60">
              You&apos;re enrolled in every available program.
            </p>
          ) : (
            <ul className="space-y-3">
              {suggestedPrograms.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/programs/${p.slug}`}
                    className="text-sm text-white/70 transition-colors hover:text-[#B4E655]"
                  >
                    {p.title}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Where we train */}
        <section>
          <div className="border-l-2 border-[#B4E655] pl-4">
            <h2 className="text-lg font-semibold text-white">Where we train</h2>
          </div>
          <div className="mb-6 mt-2 border-b border-white/10" />

          <p className="text-sm text-white/70">{VENUE_LINE}</p>
        </section>

      </div>

      {/* Your availability — the standard the cohort builder reads */}
      <section className="mt-16 max-w-2xl">
        <div className="border-l-2 border-[#B4E655] pl-4">
          <h2 className="text-lg font-semibold text-white">Your availability</h2>
        </div>
        <div className="mb-6 mt-2 border-b border-white/10" />
        <AvailabilityEditor
          initialAvailability={profile?.availability ?? { days: {}, v: 1 }}
          initialNote={profile?.availability_note ?? ""}
          updatedAt={profile?.availability_updated_at ?? null}
          source={profile?.availability_source ?? null}
        />
      </section>
    </>
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
