import { redirect } from "next/navigation";
import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { programs } from "@/content/programs";
import { cohorts } from "@/content/cohorts";
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
  return "bg-white/10 text-white/50";
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
      <p className="text-sm text-white/50">Couldn&apos;t load your profile right now.</p>
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

  const [{ data: profile, error: profileError }, { data: enrollments, error: enrollError }] =
    await Promise.all([
      supabase.from("profiles").select("full_name, phone").eq("id", userId).single(),
      supabase
        .from("enrollments")
        .select("id, cohort_id, program, status, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false }),
    ]);

  const realProfileError = profileError && profileError.code !== "PGRST116";
  if (realProfileError || enrollError) {
    return <ProfileErrorState />;
  }

  return (
    <>
      {/* Profile details */}
      <section className="mb-12">
        <div className="mb-4 border-l-2 border-[#B4E655] pl-4">
          <h1 className="text-xl font-semibold text-white">Profile</h1>
        </div>
        <div className="border-b border-white/10 mb-6" />
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
          <p className="text-sm text-white/50">No enrollments yet.</p>
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
                      <p className="mt-0.5 text-sm text-white/50">
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
