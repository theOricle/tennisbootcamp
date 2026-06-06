import { redirect } from "next/navigation";
import type { Metadata } from "next";
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

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [{ data: profile }, { data: enrollments }] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, phone")
      .eq("id", user.id)
      .single(),
    supabase
      .from("enrollments")
      .select("id, cohort_id, program, status, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  return (
    <main className="min-h-screen bg-[#061427] text-white">
      <div className="mx-auto max-w-2xl px-6 py-12">

        {/* ── Profile details ──────────────────────────────────────────── */}
        <section className="mb-12">
          <div className="mb-4 border-l-2 border-[#B4E655] pl-4">
            <h1 className="text-xl font-semibold text-white">Profile</h1>
          </div>
          <div className="border-b border-white/10 mb-6" />

          <ProfileForm
            userId={user.id}
            email={user.email ?? ""}
            initialFullName={profile?.full_name ?? ""}
            initialPhone={profile?.phone ?? ""}
          />
        </section>

        {/* ── Enrollments ──────────────────────────────────────────────── */}
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

      </div>
    </main>
  );
}
