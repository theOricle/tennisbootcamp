import type { Program, ProgramGroup } from "@/types/program";
import type { Cohort } from "@/types/cohort";
import { formatGroupWhen, groupAgeLabel, groupLevelRange, groupStatus } from "@/lib/programCatalog";
import { QUIZ_CTA_LABEL } from "@/lib/quizBar";
import { TrackedLink } from "@/components/ui/TrackedButton";
import {
  CARD_SHELL,
  CohortSchedule,
  EYEBROW_CLASS,
  LABEL_CLASS,
  LevelBlock,
  PriceSummary,
  ROW_CLASS,
  STRETCHED_LINK,
  StatusChip,
  VALUE_CLASS,
} from "./ProgramCard";

// One group as its own card (owner, 2026-10-12): the age range, the level
// band on the rail, the class day and time, the price, this season's status,
// and one action — the quiz, where our coaches place the player. The same
// spec-sheet grammar as the program card, without a photo: the program's
// photograph sits on the program card and the page hero; the group is the
// decision data under it.
//
// One link, one tab stop: the CTA line is the stretched link, named for the
// group ("Take the 2-minute quiz, for the Ages 7–10 group"), so seven cards
// on /programs read as seven distinct actions. Nothing between the article
// and the link is positioned; the article carries the focus ring.

export type ProgramGroupCardProps = {
  group: ProgramGroup;
  program: Pick<Program, "slug" | "title" | "type">;
  /** The earliest public cohort that trains in this group, if any. */
  nextCohort?: Cohort;
  /** /programs: the program's title leads the eyebrow, so a filtered list stays readable. */
  showProgram?: boolean;
  /** The quiz link's analytics source. */
  source?: string;
  headingLevel?: 2 | 3;
};

export function ProgramGroupCard({
  group: g,
  program,
  nextCohort,
  showProgram = false,
  source = "group-card",
  headingLevel = 3,
}: ProgramGroupCardProps) {
  const Title = headingLevel === 2 ? "h2" : "h3";
  const status = groupStatus(g, nextCohort);
  const when = g.day ? `${g.day}s` : "By arrangement";
  const eyebrow = showProgram ? `${program.title} · ${when}` : when;
  const range = groupLevelRange(g);

  return (
    <article id={g.id} className={`${CARD_SHELL} scroll-mt-24 p-5 md:p-6`}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <p className={EYEBROW_CLASS}>{eyebrow}</p>
        {status && <StatusChip status={status} />}
      </div>

      <Title className="mt-3 text-lg font-semibold tracking-tight text-white">{g.name}</Title>
      {g.note && <p className="mt-1.5 text-sm leading-relaxed text-white/70">{g.note}</p>}

      <dl className="mt-4 space-y-2.5 border-t border-white/10 pt-4">
        <div className={ROW_CLASS}>
          <dt className={`${LABEL_CLASS} pt-0.5`}>Ages</dt>
          <dd className={VALUE_CLASS}>{groupAgeLabel(g)}</dd>
        </div>
        <div className={ROW_CLASS}>
          <dt className={`${LABEL_CLASS} pt-0.5`}>Time</dt>
          <dd className={VALUE_CLASS}>{formatGroupWhen(g)}</dd>
        </div>
        <div className={ROW_CLASS}>
          <dt className={`${LABEL_CLASS} pt-0.5`}>Price</dt>
          <dd className={VALUE_CLASS}>
            <PriceSummary text={g.price} />
          </dd>
        </div>
        {nextCohort && (
          <div className={ROW_CLASS}>
            <dt className={`${LABEL_CLASS} pt-0.5`}>Next</dt>
            <dd className={VALUE_CLASS}>
              <CohortSchedule cohort={nextCohort} />
            </dd>
          </div>
        )}
      </dl>

      <LevelBlock range={range} className="mt-4 border-t border-white/10 pt-4" />

      {/* The one link: the quiz, named for this group. The arrow is decoration. */}
      <p className="mt-auto pt-5 text-sm font-semibold text-[#B4E655]">
        <TrackedLink
          href={`/intake?program=${program.slug}`}
          track="quiz"
          source={source}
          className={STRETCHED_LINK}
        >
          {QUIZ_CTA_LABEL}
          <span className="sr-only">, for the {g.name} group</span>
        </TrackedLink>{" "}
        <span
          aria-hidden="true"
          className="inline-block motion-safe:transition-transform motion-safe:duration-150 motion-safe:group-hover:translate-x-1"
        >
          →
        </span>
      </p>
    </article>
  );
}
