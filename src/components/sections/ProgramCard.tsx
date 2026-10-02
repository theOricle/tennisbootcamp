import Image from "next/image";
import Link from "next/link";
import type { Program } from "@/types/program";
import type { Cohort } from "@/types/cohort";
import { formatCohortSchedule } from "@/lib/cohorts";

// The one program card: image with the title over it, a one-line description,
// "Learn more" into the detail page, the next cohort's schedule strip when a
// public cohort exists, and the program's CTA. Rendered by the homepage grid,
// /programs, and the dashboard's "Suggested for you" row, so all three stay
// identical.
export function ProgramCard({
  program: p,
  nextCohort,
}: {
  program: Program;
  /** Earliest public cohort for this program, if any (drives the schedule strip + CTA text). */
  nextCohort?: Cohort;
}) {
  const scheduleStrip = nextCohort ? formatCohortSchedule(nextCohort) : null;
  // "Enroll Now" only when there is a cohort to enroll in.
  const ctaText = !p.comingSoon && !nextCohort ? "View Program" : p.ctaText;

  return (
    <div className="group overflow-hidden rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition flex flex-col">
      {/* Image + title → detail page */}
      <Link
        href={`/programs/${p.slug}`}
        className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B4E655]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#061427] rounded-2xl"
      >
        <div className="relative h-40 w-full sm:h-44">
          {p.imageSrc ? (
            <Image
              src={p.imageSrc}
              alt={p.title}
              fill
              className="object-cover"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            />
          ) : (
            <div className="h-full w-full bg-white/10" />
          )}

          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-black/0" />

          <div className="absolute bottom-3 left-4 right-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-base font-semibold text-white">{p.title}</div>
              {p.comingSoon ? (
                <span className="rounded-full border border-yellow-400/30 bg-yellow-400/10 px-2 py-1 text-[10px] text-yellow-200">
                  Coming Soon
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="px-4 pt-3">
          <p className="text-sm text-white/70 line-clamp-2">{p.description}</p>
          <div className="mt-2 text-sm font-semibold text-[#B4E655] group-hover:underline">
            Learn more →
          </div>
        </div>
      </Link>

      {/* Schedule strip — inline on mobile, hover-reveal on md+ */}
      {scheduleStrip && (
        <div className="px-4 pb-2 pt-2 md:max-h-0 md:overflow-hidden md:opacity-0 md:group-hover:max-h-20 md:group-hover:opacity-100 md:transition-all md:duration-200">
          <p className="text-xs text-white/50 leading-relaxed">{scheduleStrip}</p>
        </div>
      )}

      {/* CTA button → enroll / notify */}
      <div className="px-4 pb-4 pt-3 mt-auto">
        <Link
          href={p.ctaHref}
          className="block w-full rounded-full border border-[#B4E655]/40 px-4 py-2 text-center text-sm font-semibold text-[#B4E655] hover:bg-[#B4E655]/10 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B4E655]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#061427]"
        >
          {ctaText}
        </Link>
      </div>
    </div>
  );
}

/** Earliest public cohort per program — the schedule strip + CTA source. */
export function nextCohortFor(publicCohorts: Cohort[], programId: string): Cohort | undefined {
  return publicCohorts
    .filter((c) => c.programId === programId)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
}
