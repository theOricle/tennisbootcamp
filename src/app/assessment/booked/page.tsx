"use client";

import { useEffect } from "react";
import Link from "next/link";
import { trackAssessmentBookComplete } from "@/lib/analytics";

export default function AssessmentBookedPage() {
  useEffect(() => {
    trackAssessmentBookComplete();
  }, []);

  return (
    <main className="min-h-screen bg-[#061427] text-white">
      <div className="mx-auto flex max-w-lg flex-col items-center px-6 py-20 text-center sm:py-28">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#B4E655]/15">
          <svg
            className="h-8 w-8 text-[#B4E655]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
        <h1 className="mt-6 text-2xl font-semibold text-white sm:text-3xl">
          You&apos;re booked.
        </h1>
        <p className="mt-4 text-base leading-relaxed text-white/70">
          Your 20-minute assessment is confirmed. We&apos;ve sent the details to
          your email — slot time, what to bring, and how to reach us if you need
          to move it.
        </p>
        <p className="mt-3 text-sm text-white/50">
          See you on the court. Bring a racquet if you have one, water, and court
          shoes.
        </p>
        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/programs"
            className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-[#B4E655] px-6 py-3 text-sm font-semibold text-[#061427] transition hover:brightness-110"
          >
            Browse programs
          </Link>
          <Link
            href="/"
            className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-white/25 px-6 py-3 text-sm font-semibold text-white/80 transition hover:border-white/45 hover:text-white"
          >
            Back home
          </Link>
        </div>
      </div>
    </main>
  );
}
