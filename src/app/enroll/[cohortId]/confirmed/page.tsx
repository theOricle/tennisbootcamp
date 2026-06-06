import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cohorts } from "@/content/cohorts";
import { programs } from "@/content/programs";
import { locations } from "@/content/locations";
import { formatDateRange } from "@/lib/cohorts";
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

          {/* Heading */}
          <h1 className="mt-4 text-2xl font-semibold md:text-3xl">
            {isMock ? "You're enrolled (mock)." : "You're enrolled!"}
          </h1>

          {/* Summary */}
          <p className="mt-2 text-sm text-white/65 leading-relaxed">
            {isMock ? (
              <>
                This is a <strong className="text-yellow-200">test enrollment</strong> — no real
                payment was collected. It will appear in the Google Sheet with status{" "}
                <code className="rounded bg-white/10 px-1 text-xs">test_paid</code>. Add{" "}
                <code className="rounded bg-white/10 px-1 text-xs">STRIPE_SECRET_KEY</code> to
                enable real Stripe Checkout.
              </>
            ) : (
              <>
                We&apos;ve received your payment and confirmed your enrollment in{" "}
                <strong className="text-white">{program?.title ?? cohort.programId}</strong>
                {location && (
                  <>
                    {" "}at <strong className="text-white">{location.name}</strong>
                  </>
                )}
                . Check your email for a receipt from Stripe.
              </>
            )}
          </p>

          {/* Enrollment detail box */}
          <div className="mt-6 rounded-xl border border-white/10 bg-white/5 px-4 py-4 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-white/50">Program</span>
              <span className="text-right font-medium text-white">
                {program?.title ?? cohort.programId}
              </span>
            </div>
            {location && (
              <div className="flex justify-between gap-4">
                <span className="text-white/50">Location</span>
                <span className="text-right font-medium text-white">{location.name}</span>
              </div>
            )}
            <div className="flex justify-between gap-4">
              <span className="text-white/50">Cohort</span>
              <span className="text-right font-medium text-white">{cohort.label}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-white/50">Dates</span>
              <span className="text-right font-medium text-[#B4E655]">
                {formatDateRange(cohort)}
              </span>
            </div>
          </div>

          {/* Next step */}
          {!isMock && (
            <div className="mt-4 rounded-xl border border-[#B4E655]/20 bg-[#B4E655]/5 px-4 py-3 text-sm text-white/75">
              <span className="font-semibold text-white">What&apos;s next: </span>
              We&apos;ll be in touch before the session starts with court details and
              what to bring. See you on the court.
            </div>
          )}

          {/* Actions */}
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/"
              className="rounded-full bg-white/10 px-5 py-2 text-sm font-semibold text-white hover:bg-white/15 transition"
            >
              Back to Home
            </Link>
            <Link
              href={`/programs/${program?.slug ?? cohort.programId}`}
              className="rounded-full bg-[#B4E655] px-5 py-2 text-sm font-semibold text-[#061427] hover:brightness-110 transition"
            >
              View Program
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
