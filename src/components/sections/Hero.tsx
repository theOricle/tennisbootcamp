"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/layout/Container";
import { trackQuizCtaClick } from "@/lib/analytics";
import { COHORT_LENGTH_ADJ } from "@/content/programs";
import { QUIZ_CTA_LABEL } from "@/lib/quizBar";

// Code-split Three.js out of the initial bundle; never SSR the WebGL canvas.
const CourtBackground = dynamic(
  () => import("@/components/ui/CourtBackground").then((m) => ({ default: m.CourtBackground })),
  { ssr: false, loading: () => null }
);

/**
 * Mounts the particle wave once the page has loaded and the browser is idle,
 * so the 128KB Three.js chunk never competes with the hero's first paint
 * (audit M15).
 */
function useWaveWhenIdle(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let idleId: number | undefined;
    let timer: number | undefined;
    const start = () => setReady(true);
    const schedule = () => {
      if (typeof window.requestIdleCallback === "function") {
        idleId = window.requestIdleCallback(start, { timeout: 2500 });
      } else {
        timer = window.setTimeout(start, 400);
      }
    };
    if (document.readyState === "complete") schedule();
    else window.addEventListener("load", schedule, { once: true });
    return () => {
      window.removeEventListener("load", schedule);
      if (idleId !== undefined) window.cancelIdleCallback(idleId);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, []);
  return ready;
}

// Feathers the court slab's hard edges into the navy (audit M14). The
// ellipse keeps the player, racket and ball fully opaque.
const FEATHER =
  "[mask-image:radial-gradient(ellipse_56%_72%_at_50%_44%,#000_60%,transparent_100%)] " +
  "[-webkit-mask-image:radial-gradient(ellipse_56%_72%_at_50%_44%,#000_60%,transparent_100%)]";

export function Hero() {
  const waveReady = useWaveWhenIdle();

  return (
    <section className="relative isolate overflow-hidden pb-10 pt-12 md:pb-12 md:pt-20">
      {/* z-0  — solid base */}
      <div className="absolute inset-0 z-0 bg-[#061427]" />

      {/* z-10 — particle wave */}
      <div className="absolute inset-0 z-10">{waveReady && <CourtBackground />}</div>

      {/* z-20 — soft vignette, then the text scrim: top-down on phones so the
          dots never run through the buttons and note (audit M15), left-right
          from md. */}
      <div className="pointer-events-none absolute inset-0 z-20 tb-gradient opacity-60" />
      <div className="pointer-events-none absolute inset-0 z-20 bg-gradient-to-b from-[#061427]/95 via-[#061427]/80 to-[#061427]/35 md:bg-gradient-to-r md:from-[#061427]/95 md:via-[#061427]/60 md:to-transparent" />

      {/* z-30 — translucent wordmark watermark; decorative, desktop only */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-24 z-30 hidden w-[1200px] -translate-x-1/2 select-none text-center text-[130px] font-semibold tracking-[0.25em] text-white/[0.05] md:block"
      >
        TENNIS BOOTCAMP
      </div>

      {/* z-30 — main content */}
      <Container className="relative z-30 grid items-center gap-8 md:grid-cols-2 md:gap-10">
        <div>
          {/* Eyebrow badge: a standing fact, not an "open now" claim (audit M2),
              so no live-status ping. */}
          <div className="inline-flex items-center gap-2 rounded-full border border-[#B4E655]/40 bg-[#B4E655]/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-[#B4E655]">
            <span className="inline-flex h-2 w-2 rounded-full bg-[#B4E655]" aria-hidden="true" />
            Weekend classes · Toronto
          </div>

          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white md:text-6xl">
            Where Athletes <span className="text-[#B4E655]">Evolve!</span>
          </h1>

          <p className="mt-5 max-w-xl text-base text-white/75 md:text-lg">
            Structured {COHORT_LENGTH_ADJ} cohorts. A system that makes progress inevitable. Built for athletes who want to compete.
          </p>

          <div className="mt-8 flex flex-col items-start gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="primary"
                href="/intake"
                onClick={() => trackQuizCtaClick("hero")}
                data-quiz-cta
              >
                {QUIZ_CTA_LABEL}
              </Button>
              <Button variant="secondary" href="/programs" className="bg-[#061427]/80">
                Browse Programs
              </Button>
            </div>
            <p className="max-w-md text-xs leading-relaxed text-white/65">
              The quiz is free. Optional: a 20-minute on-court assessment for $20 — join a program after and it comes off the price.
            </p>
          </div>
        </div>

        {/* The owner's 640/720px player (DECISIONS 2026-04-25), restored past
            the 380px phone cap (audit M14). The PNG is cropped to the player,
            so no transparent headroom pushes the court down; the -ml-24 pull
            keeps the outstretched arm on screen at 768px. */}
        <div className="flex justify-center md:-ml-24 md:justify-start">
          <Image
            src="/images/hero/player.png"
            alt="Tennis player mid-swing on court"
            width={1280}
            height={446}
            priority
            sizes="(max-width: 767px) 380px, (max-width: 1023px) 640px, 720px"
            className={`h-auto w-full max-w-[380px] md:w-[640px] md:max-w-none lg:w-[720px] ${FEATHER}`}
          />
        </div>
      </Container>

      <div className="relative z-30 mt-6 flex justify-center" aria-hidden="true">
        <svg
          className="h-5 w-5 text-white/50 motion-safe:animate-bounce"
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
