import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [{ data: profile }, { data: enrollments }] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .single(),
    supabase
      .from("enrollments")
      .select("id, cohort_id, program, location, participant_name, status, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  const displayName = profile?.full_name || user.email;

  return (
    <main className="min-h-screen bg-[#061427] text-white">
      <div className="mx-auto max-w-4xl px-6 py-14">
        <div className="mb-10">
          <p className="mb-1 text-sm font-semibold uppercase tracking-wide text-[#B4E655]">
            My Account
          </p>
          <h1 className="text-3xl font-semibold">
            Welcome back{displayName ? `, ${displayName}` : ""}.
          </h1>
        </div>

        <section>
          <h2 className="mb-4 text-lg font-semibold">Your Enrollments</h2>

          {!enrollments || enrollments.length === 0 ? (
            <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center">
              <p className="text-sm text-white/60">No enrollments yet.</p>
              <Link
                href="/programs"
                className="mt-4 inline-block rounded-full bg-[#B4E655] px-6 py-2.5 text-sm font-semibold text-[#061427]"
              >
                Browse Programs
              </Link>
            </div>
          ) : (
            <div className="grid gap-4">
              {enrollments.map((enrollment) => (
                <div
                  key={enrollment.id}
                  className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 px-6 py-5"
                >
                  <div>
                    <p className="font-semibold text-white">
                      {enrollment.program ?? enrollment.cohort_id}
                    </p>
                    {enrollment.location && (
                      <p className="mt-0.5 text-sm text-white/60">
                        {enrollment.location}
                      </p>
                    )}
                    {enrollment.participant_name && (
                      <p className="mt-1 text-sm text-white/50">
                        Participant: {enrollment.participant_name}
                      </p>
                    )}
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                      enrollment.status === "paid"
                        ? "bg-[#B4E655]/15 text-[#B4E655]"
                        : enrollment.status === "test_paid"
                          ? "bg-yellow-400/15 text-yellow-300"
                          : "bg-white/10 text-white/60"
                    }`}
                  >
                    {enrollment.status === "paid"
                      ? "Enrolled"
                      : enrollment.status === "test_paid"
                        ? "Test enrolled"
                        : enrollment.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
