import Link from "next/link";
import type { Program } from "@/types/program";
import type { Cohort } from "@/types/cohort";
import { formatCohortSchedule } from "@/lib/cohorts";
import { ProgramPlate } from "@/components/plates/ProgramPlate";

// The one program card: the program's Court Plate (decorative; audit H1), the
// title, a one-line description, "Learn more" into the detail page, the next
// cohort's schedule strip when a public cohort exists, and the program's CTA.
// Rendered by the homepage grid, /programs, and the dashboard's "Suggested for
// you" row, so all three stay identical.
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
      {/* Plate + title → detail page. The plate is text-free and decorative;
          nothing is drawn over it (design specs rule 2). */}
      <Link
        href={`/programs/${p.slug}`}
        className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B4E655]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#061427] rounded-2xl"
      >
        <div className="relative aspect-[2/1] w-full overflow-hidden border-b border-white/10 bg-[#061427]">
          <ProgramPlate plate={p.plate} frame="band" density="compact" comingSoon={p.comingSoon} interactive />
        </div>

        <div className="px-4 pt-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-base font-semibold text-white">{p.title}</h3>
            {p.comingSoon ? (
              <span className="inline-flex min-h-6 shrink-0 items-center rounded-full border border-dashed border-white/25 bg-[#061427] px-2.5 py-1 text-xs font-medium text-white/85">
                Coming Soon
              </span>
            ) : null}
          </div>
          <p className="mt-1.5 text-sm text-white/70 line-clamp-2">{p.description}</p>
          <div className="mt-2 text-sm font-semibold text-[#B4E655] group-hover:underline">
            Learn more →
          </div>
        </div>
      </Link>

      {/* Schedule strip — inline on mobile, hover-reveal on md+ */}
      {scheduleStrip && (
        <div className="px-4 pb-2 pt-2 md:max-h-0 md:overflow-hidden md:opacity-0 md:group-hover:max-h-20 md:group-hover:opacity-100 md:transition-all md:duration-200">
          <p className="text-xs text-white/60 leading-relaxed">{scheduleStrip}</p>
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
