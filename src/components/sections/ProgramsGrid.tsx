import Link from "next/link";
import type { Program } from "@/types/program";
import { getPublicCohorts } from "@/lib/cohortsDb";
import { ProgramCard, nextCohortFor } from "./ProgramCard";

type ProgramsGridProps = {
  programs: Program[];
  title?: string;
};

export async function ProgramsGrid({ programs, title = "Our Programs" }: ProgramsGridProps) {
  const publicCohorts = await getPublicCohorts();

  return (
    <section>
      <div className="mb-6 flex items-end justify-between gap-4">
        <h2 className="text-2xl font-semibold text-white md:text-3xl">{title}</h2>
        <Link
          className="rounded text-sm text-white/70 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B4E655]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#061427]"
          href="/programs"
        >
          View all →
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {programs.map((p) => (
          <ProgramCard key={p.id} program={p} nextCohort={nextCohortFor(publicCohorts, p.id)} />
        ))}
      </div>
    </section>
  );
}
