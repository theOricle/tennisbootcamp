"use client";

import Image from "next/image";
import Link from "next/link";
import dynamic from "next/dynamic";

// Code-split Three.js out of the initial bundle; never SSR the WebGL canvas.
const CourtBackground = dynamic(
  () => import("@/components/ui/CourtBackground").then((m) => ({ default: m.CourtBackground })),
  { ssr: false, loading: () => null }
);

export function Hero() {
  return (
    <section className="relative isolate overflow-hidden pb-10 pt-14 md:pt-20">
      {/* z-0  — solid base */}
      <div className="absolute inset-0 z-0 bg-[#061427]" />

      {/* z-10 — particle wave */}
      <div className="absolute inset-0 z-10">
        <CourtBackground />
      </div>

      {/* z-20 — soft vignette + left-side darkening for text contrast */}
      <div className="pointer-events-none absolute inset-0 z-20 tb-gradient opacity-60" />
      <div className="pointer-events-none absolute inset-0 z-20 bg-gradient-to-r from-[#061427]/95 via-[#061427]/60 to-transparent" />

      {/* z-30 — translucent wordmark watermark */}
      <div className="pointer-events-none absolute left-1/2 top-24 z-30 w-[1200px] -translate-x-1/2 text-center text-[90px] font-semibold tracking-[0.25em] text-white/[0.05] md:text-[130px]">
        TENNIS BOOTCAMP
      </div>

      {/* z-30 — main content */}
      <div className="relative z-30 mx-auto grid max-w-6xl items-center gap-10 px-6 md:grid-cols-2">
        <div>
          {/* Eyebrow badge — Spring Intake live */}
          <div className="inline-flex items-center gap-2 rounded-full border border-[#B4E655]/40 bg-[#B4E655]/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-[#B4E655]">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#B4E655] opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#B4E655]" />
            </span>
            Now Enrolling
          </div>

          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white md:text-6xl">
            Where Athletes <span className="text-[#B4E655]">Evolve!</span>
          </h1>

          <p className="mt-5 max-w-xl text-base text-white/75 md:text-lg">
            Structured six-week cohorts. Real reps. Real progress. Built for athletes who want to compete.
          </p>

          <div className="mt-8 flex flex-col items-start gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <a
                href="/intake"
                className="inline-flex items-center justify-center rounded-full bg-[#B4E655] px-7 py-3 text-sm font-semibold text-[#061427] transition hover:bg-[#c8ee76] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B4E655]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#061427]"
              >
                Find My Program
              </a>
              <Link
                href="/programs"
                className="inline-flex items-center justify-center rounded-full border border-white/25 px-7 py-3 text-sm font-semibold text-white/80 transition hover:border-white/45 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B4E655]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#061427]"
              >
                Browse Programs
              </Link>
            </div>
            <p className="text-xs text-white/50">
              Priority placements go to athletes who complete the intake.
            </p>
          </div>
        </div>

        <div className="flex justify-center md:justify-start md:-ml-16 lg:-ml-24">
          <Image
            src="/images/hero/player.png"
            alt="Tennis player mid-swing on court"
            width={720}
            height={720}
            priority
            sizes="(max-width: 768px) 380px, (max-width: 1024px) 640px, 720px"
            className="h-auto w-full max-w-[380px] md:w-[640px] lg:w-[720px]"
          />
        </div>
      </div>

      <div className="relative z-30 mt-6 flex justify-center" aria-hidden="true">
        <svg
          className="h-5 w-5 animate-bounce text-white/50"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    </section>
  );
}
