import Image from "next/image";
import { CourtBackground } from "@/components/ui/CourtBackground";

export function Hero() {
  return (
    <section className="relative isolate overflow-hidden pb-10 pt-14 md:pt-20">
      {/* z-0  — solid base */}
      <div className="absolute inset-0 z-0 bg-[#061427]" />
      {/* z-10 — court line sweep */}
      <div className="absolute inset-0 z-10">
        <CourtBackground />
      </div>
      {/* z-20 — vignette keeps edges dark and text readable */}
      <div className="absolute inset-0 z-20 tb-gradient opacity-75" />

      {/* z-30 — all foreground */}
      <div className="pointer-events-none absolute left-1/2 top-24 z-30 w-[1200px] -translate-x-1/2 text-center text-[90px] font-semibold tracking-[0.25em] text-white/[0.05] md:text-[130px]">
        TENNIS BOOTCAMP
      </div>

      <div className="relative z-30 mx-auto grid max-w-6xl items-center gap-10 px-6 md:grid-cols-2">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight text-white md:text-6xl">
            Where Athletes Evolve!
          </h1>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <div className="flex flex-col items-start gap-2">
              <a
                href="/intake"
                className="inline-flex items-center justify-center rounded-full bg-emerald-300 px-7 py-3 text-sm font-semibold text-[#061427] transition hover:bg-emerald-200"
              >
                Get Priority Placement
              </a>
              <p className="text-xs text-white/50">
                Priority placements go to athletes who complete the intake.
              </p>
            </div>

            <a
              href="/programs"
              className="inline-flex items-center justify-center rounded-full border border-white/20 px-7 py-3 text-sm font-semibold text-white/80 transition hover:border-white/40 hover:text-white"
            >
              View Programs
            </a>
          </div>
        </div>

        <div className="flex justify-center md:justify-end">
          <Image
            src="/images/hero/player.png"
            alt="Tennis player"
            width={560}
            height={560}
            priority
            className="h-auto w-[340px] md:w-[560px]"
          />
        </div>
      </div>

      <div className="relative z-30 mt-6 flex justify-center text-white/60">↓</div>
    </section>
  );
}
