import Link from "next/link";
import type { Program } from "@/types/program";
import { getPublicCohorts } from "@/lib/cohortsDb";
import { Heading } from "@/components/ui/Heading";
import { ProgramCard, nextCohortFor } from "./ProgramCard";

type ProgramsGridProps = {
  programs: Program[];
  /** The section heading; null when the page's own H1 already names the list. */
  title?: string | null;
  /** "Browse Programs →" to /programs; off on /programs itself (audit H2). */
  browseLink?: boolean;
};

/**
 * The program card grid. It sets no horizontal padding or max-width: the
 * page puts it inside its Container (audit H2).
 */
export async function ProgramsGrid({
  programs,
  title = "Our Programs",
  browseLink = true,
}: ProgramsGridProps) {
  const publicCohorts = await getPublicCohorts();
  const showHeader = title !== null || browseLink;

  return (
    <section aria-labelledby={title ? "programs-grid-title" : undefined}>
      {showHeader && (
        <div className="mb-6 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          {title ? <Heading id="programs-grid-title">{title}</Heading> : <span />}
          {browseLink && (
            <Link
              className="inline-flex min-h-[44px] items-center rounded text-sm font-semibold text-white/70 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B4E655]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#061427]"
              href="/programs"
            >
              Browse Programs →
            </Link>
          )}
        </div>
      )}

      <ul role="list" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {programs.map((p) => (
          <li key={p.id} className="flex [&>*]:w-full">
            <ProgramCard program={p} nextCohort={nextCohortFor(publicCohorts, p.id)} />
          </li>
        ))}
      </ul>
    </section>
  );
}
