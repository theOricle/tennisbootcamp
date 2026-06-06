import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cohorts } from "@/content/cohorts";
import { programs } from "@/content/programs";
import { locations } from "@/content/locations";
import { formatDateRange, formatDaysTimes } from "@/lib/cohorts";
import { createClient } from "@/lib/supabase/server";
import { EnrollCompleteEvent } from "./EnrollCompleteEvent";

type PageProps = { params: Promise<{ cohortId: string }> };

export const metadata: Metadata = {
  title: "Enrollment Confirmed",
  description: "Your Tennis Bootcamp enrollment has been confirmed.",
  robots: { index: false, follow: false },
};

export default async function EnrollConfirmedPage({ params }: PageProps) {
  const { cohortId } = await params;
  const cohort = cohorts.find((c) => c.id === cohortId);
  if (!cohort) notFound();

  const program = programs.find((p) => p.id === cohort.programId);
  const location = locations.find((l) => l.id === cohort.locationId);
  const isMock = !process.env.STRIPE_SECRET_KEY;

  // Auth check — used for CTA and personalised greeting.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Try to retrieve participant name from most recent enrollment.
  let participantName: string | null = null;
  if (user) {
    const { data: enrollment } = await supabase
      .from("enrollments")
      .select("participant_name")
      .eq("user_id", user.id)
      .eq("cohort_id", cohortId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    participantName = enrollment?.participant_name ?? null;
  }

  const firstName = participantName?.trim().split(/\s+/)[0] ?? null;

  return (
    <main className="min-h-screen bg-[#061427] text-white">
      <EnrollCompleteEvent
        cohortId={cohortId}
        program={program?.title ?? cohort.programId}
      />
      <div className="mx-auto max-w-2xl px-6 py-16">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.4)] md:p-8">

          {/* Status badge */}
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#B4E655]/20">
              <svg
                className="h-4 w-4 text-[#B4E655]"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-[#B4E655]">
              {isMock ? "Test Enrollment Confirmed" : "Payment Received"}
            </span>
          </div>

          {/* Greeting */}
          <h1 className="mt-4 text-2xl font-semibold md:text-3xl">
            {firstName ? `${firstName}, you're enrolled!` : "You're enrolled!"}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-white/65">
            {isMock ? (
              <>
                This is a <strong className="text-yellow-200">test enrollment</strong> — no real
                payment was collected. It will appear in the database with status{" "}
                <code className="rounded bg-white/10 px-1 text-xs">test_paid</code>.
              </>
            ) : (
              <>
                Your payment is confirmed and your spot is reserved. Everything below is what you
                signed up for — save this page or check your email for a receipt.
              </>
            )}
          </p>

          {/* Enrollment detail box */}
          <div className="mt-6 divide-y divide-white/10 rounded-xl border border-white/10 bg-white/5 text-sm">
            <div className="flex justify-between gap-4 px-4 py-3">
              <span className="text-white/50">Program</span>
              <span className="text-right font-medium text-white">{program?.title ?? cohort.programId}</span>
            </div>
            <div className="flex justify-between gap-4 px-4 py-3">
              <span className="text-white/50">Cohort</span>
              <span className="text-right font-medium text-white">{cohort.label}</span>
            </div>
            <div className="flex justify-between gap-4 px-4 py-3">
              <span className="text-white/50">Dates</span>
              <span className="text-right font-medium text-[#B4E655]">{formatDateRange(cohort)}</span>
            </div>
            <div className="flex justify-between gap-4 px-4 py-3">
              <span className="text-white/50">Schedule</span>
              <span className="text-right font-medium text-white">{formatDaysTimes(cohort)}</span>
            </div>
            {location && (
              <div className="flex justify-between gap-4 px-4 py-3">
                <span className="text-white/50">Location</span>
                <div className="text-right">
                  <p className="font-medium text-white">{location.name}</p>
                  <p className="mt-0.5 text-xs text-white/50">{location.address}</p>
                </div>
              </div>
            )}
            <div className="flex justify-between gap-4 px-4 py-3">
              <span className="text-white/50">Duration</span>
              <span className="text-right font-medium text-white">{cohort.weeks} weeks · {cohort.capacityMin}–{cohort.capacityMax} players</span>
            </div>
          </div>

          {/* What happens next */}
          <div className="mt-6 rounded-xl border border-[#B4E655]/20 bg-[#B4E655]/5 px-5 py-5">
            <p className="mb-3 text-sm font-semibold text-white">What happens next</p>
            <ol className="space-y-2 text-sm text-white/70">
              <li className="flex gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#B4E655]/20 text-[11px] font-bold text-[#B4E655]">1</span>
                <span>Check your email — you&apos;ll receive an activation link to access your account.</span>
              </li>
              <li className="flex gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#B4E655]/20 text-[11px] font-bold text-[#B4E655]">2</span>
                <span>Set your password to unlock your training dashboard and enrollment history.</span>
              </li>
              <li className="flex gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#B4E655]/20 text-[11px] font-bold text-[#B4E655]">3</span>
                <span>We&apos;ll send reminders before your first session with court details and what to bring.</span>
              </li>
            </ol>
          </div>

          {/* Primary CTA — auth-aware */}
          <div className="mt-8 flex flex-wrap gap-3">
            {user ? (
              <Link
                href="/dashboard"
                className="rounded-full bg-[#B4E655] px-6 py-2.5 text-sm font-semibold text-[#061427] transition hover:brightness-110"
              >
                Go to Dashboard →
              </Link>
            ) : (
              <Link
                href="/set-password"
                className="rounded-full bg-[#B4E655] px-6 py-2.5 text-sm font-semibold text-[#061427] transition hover:brightness-110"
              >
                Set password from your email →
              </Link>
            )}
            <Link
              href={`/programs/${program?.slug ?? cohort.programId}`}
              className="rounded-full bg-white/10 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-white/15"
            >
              View Program
            </Link>
          </div>

        </div>
      </div>
    </main>
  );
}
