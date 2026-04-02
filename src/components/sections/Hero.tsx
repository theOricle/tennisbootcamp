import Image from "next/image";

export function Hero() {
  return (
    <section className="relative overflow-hidden pb-10 pt-14 md:pt-20">
      <div className="absolute inset-0 -z-10 bg-[#061427]" />
      <div className="absolute inset-0 -z-10 tb-gradient opacity-90" />

      {/* Big faint title like Figma */}
      <div className="pointer-events-none absolute left-1/2 top-24 -z-10 w-[1200px] -translate-x-1/2 text-center text-[90px] font-semibold tracking-[0.25em] text-white/[0.05] md:text-[130px]">
        TENNIS BOOTCAMP
      </div>

      <div className="mx-auto grid max-w-6xl items-center gap-10 px-6 md:grid-cols-2">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight text-white md:text-6xl">
            Where Athletes Evolve!
          </h1>
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

      <div className="mt-6 flex justify-center text-white/60">↓</div>
    </section>
  );
}
