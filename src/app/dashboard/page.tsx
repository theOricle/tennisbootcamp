import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { programs } from "@/content/programs";
import { cohorts } from "@/content/cohorts";
import { locations } from "@/content/locations";

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

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [{ data: profile }, { data: enrollments }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", user.id).single(),
    supabase
      .from("enrollments")
      .select("id, cohort_id, program, participant_name, status, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  const displayName = profile?.full_name || user.email;

  const enrolledProgramIds = new Set(
    (enrollments ?? []).map((e) => {
      const cohort = cohorts.find((c) => c.id === e.cohort_id);
      return cohort?.programId ?? e.program ?? "";
    })
  );

  const suggestedPrograms = programs.filter((p) => !enrolledProgramIds.has(p.id));

  return (
    <main className="min-h-screen bg-[#061427] text-white">
      <div className="mx-auto max-w-6xl px-6 py-12">

        {/* User name — top-right of content area */}
        <div className="mb-12 flex justify-end">
          <div className="text-right">
            <p className="font-semibold text-white">{displayName}</p>
            <Link
              href="/profile"
              className="text-sm text-[#B4E655] hover:underline"
            >
              / profile
            </Link>
          </div>
        </div>

        {/* Three-column grid — stacked on mobile */}
        <div className="grid grid-cols-1 gap-12 md:grid-cols-3">

          {/* ── My Programs ─────────────────────────────────────────────── */}
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
                  return (
                    <div key={enrollment.id}>
                      <p className="font-bold text-[#B4E655]">
                        {program?.title ?? enrollment.program ?? enrollment.cohort_id}
                      </p>
                      <div className="mt-2 flex items-start justify-between gap-4">
                        <div className="space-y-0.5 text-sm text-white/70">
                          {enrollment.participant_name && (
                            <p>Name of Student: {enrollment.participant_name}</p>
                          )}
                          {cohort?.sessions.map((s) => (
                            <p key={s.day}>
                              {DAY_NAMES[s.day] ?? s.day} {fmt12h(s.start)}–{fmt12h(s.end)}
                            </p>
                          ))}
                        </div>
                        {program?.ageGroup && (
                          <span className="shrink-0 rounded-lg bg-[#B4E655]/10 px-2.5 py-1.5 text-center text-xs font-semibold leading-snug text-[#B4E655]">
                            Age Group
                            <br />
                            {ageLabel(program.ageGroup)}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* ── Suggested for you ───────────────────────────────────────── */}
          <section>
            <div className="border-l-2 border-[#B4E655] pl-4">
              <h2 className="text-lg font-semibold text-white">Suggested for you</h2>
            </div>
            <div className="mb-6 mt-2 border-b border-white/10" />

            {suggestedPrograms.length === 0 ? (
              <p className="text-sm text-white/60">
                You&apos;re enrolled in all available programs!
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

          {/* ── Camps near you ──────────────────────────────────────────── */}
          <section>
            <div className="border-l-2 border-[#B4E655] pl-4">
              <h2 className="text-lg font-semibold text-white">Camps near you</h2>
            </div>
            <div className="mb-6 mt-2 border-b border-white/10" />

            <ul className="space-y-5">
              {locations.map((loc) => (
                <li key={loc.id} className="flex items-start gap-2.5">
                  <svg
                    className="mt-0.5 h-4 w-4 shrink-0 text-[#B4E655]"
                    viewBox="0 0 16 16"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      fillRule="evenodd"
                      d="M8 1.5a4.5 4.5 0 0 0-4.5 4.5c0 2.72 2.58 5.54 3.94 6.84a.75.75 0 0 0 1.12 0C9.92 11.54 12.5 8.72 12.5 6A4.5 4.5 0 0 0 8 1.5ZM8 7.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <div className="text-sm text-white/70">
                    <p className="font-medium text-white/90">{loc.name}</p>
                    <p>{loc.address}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>

        </div>
      </div>
    </main>
  );
}
