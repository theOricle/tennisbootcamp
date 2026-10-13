import type { Program, ProgramGroup } from "@/types/program";
import type { Cohort } from "@/types/cohort";
import { formatGroupWhen, groupAgeLabel, groupStatus } from "@/lib/programCatalog";
import { QUIZ_CTA_LABEL } from "@/lib/quizBar";
import { APPROVAL_LINE, RIGHT_GROUP_PROMISE_SHORT } from "@/content/programs";
import { locationById } from "@/content/locations";
import { TrackedLink } from "@/components/ui/TrackedButton";
import { LevelTag } from "@/components/tiers";
import {
  CARD_SHELL,
  CohortSchedule,
  EYEBROW_CLASS,
  LABEL_CLASS,
  PriceSummary,
  ROW_CLASS,
  STRETCHED_LINK,
  StatusChip,
  VALUE_CLASS,
} from "./ProgramCard";

// One group as its own card (owner, 2026-10-12; one level per group and a
// level-led title, 2026-10-13): the title leads with the level ("Intermediate
// Adult Bootcamp"), then the decision rows — the one level tag (a tier chip
// with its emblem, never a span or a rail), the age range, when it trains
// (a detail row, never the title or the eyebrow), where (the club and its
// area; the map link lives on the pages, so the card keeps one link), the
// price, how to join ("Open to join" or "By approval") with the week-one
// promise, and one action — the quiz, where our coaches place the player.
// The same spec-sheet grammar as the program card, without a photo: the
// program's photograph sits on the program card and the page hero; the group
// is the decision data under it.
//
// One link, one tab stop: the CTA line is the stretched link, named for the
// group ("Take the 2-minute quiz, for the Beginner Junior Bootcamp"), so
// seven cards on /programs read as seven distinct actions. Nothing between
// the article and the link is positioned; the article carries the focus ring.

/** The joining rows' value: the spec value's size, a step quieter, for running text. */
const TERMS_CLASS = "min-w-0 text-sm leading-relaxed text-white/80";

export type ProgramGroupCardProps = {
  group: ProgramGroup;
  program: Pick<Program, "slug" | "title" | "type">;
  /** The earliest public cohort that trains in this group, if any. */
  nextCohort?: Cohort;
  /** /programs: the program's title leads the eyebrow, so a filtered list stays readable. */
  showProgram?: boolean;
  /** The quiz link's analytics source. */
  source?: string;
  /** The title's level: h3 under a page section's h2 (the program page); h4 under the catalog's program h3. */
  headingLevel?: 2 | 3 | 4;
};

/** ", for the Beginner Junior Bootcamp" · ", for the One-to-one coaching group". */
function linkSuffix(name: string): string {
  return `, for the ${name}${/bootcamp$/i.test(name) ? "" : " group"}`;
}

export function ProgramGroupCard({
  group: g,
  program,
  nextCohort,
  showProgram = false,
  source = "group-card",
  headingLevel = 3,
}: ProgramGroupCardProps) {
  const Title = headingLevel === 2 ? "h2" : headingLevel === 4 ? "h4" : "h3";
  const status = groupStatus(g, nextCohort);
  const scheduled = g.day !== null;
  // The eyebrow never carries the day or time (owner, 2026-10-13): the
  // program's title on a mixed list, else the kind of class it is, unless
  // that would repeat the title (private lessons are "One-to-one coaching"
  // twice over), when the program's title steps in.
  const eyebrow = showProgram || program.type === g.name ? program.title : program.type;
  const location = locationById(g.locationId);

  return (
    <article id={g.id} className={`${CARD_SHELL} scroll-mt-24 p-5 md:p-6`}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <p className={EYEBROW_CLASS}>{eyebrow}</p>
        {status && <StatusChip status={status} />}
      </div>

      <Title className="mt-3 text-lg font-semibold tracking-tight text-white">{g.name}</Title>

      <dl className="mt-4 space-y-2.5 border-t border-white/10 pt-4">
        {/* The one level tag (owner, 2026-10-13), first: it is the group's
            one level statement, the same word the title leads with. */}
        <div className={`${ROW_CLASS} items-center`}>
          <dt className={LABEL_CLASS}>Level</dt>
          <dd className="min-w-0">
            <LevelTag level={g.level} />
          </dd>
        </div>
        <div className={ROW_CLASS}>
          <dt className={`${LABEL_CLASS} pt-0.5`}>Ages</dt>
          <dd className={VALUE_CLASS}>{groupAgeLabel(g)}</dd>
        </div>
        <div className={ROW_CLASS}>
          <dt className={`${LABEL_CLASS} pt-0.5`}>When</dt>
          <dd className={VALUE_CLASS}>{formatGroupWhen(g)}</dd>
        </div>
        {location && (
          <div className={ROW_CLASS}>
            <dt className={`${LABEL_CLASS} pt-0.5`}>Where</dt>
            <dd className={VALUE_CLASS}>
              <span className="block">{location.name}</span>
              <span className="block text-white/60">{location.area}</span>
            </dd>
          </div>
        )}
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

      {/* The group's one plain line (High Performance's competitive note)
          sits under the rows, not under the title, so the Level, Ages, When
          and Price rows line up across sibling cards in a row. */}
      {g.note && <p className="mt-4 text-sm leading-relaxed text-white/70">{g.note}</p>}

      {/* The card's foot, pinned to the bottom so sibling cards' Week 1 rows
          and CTAs line up whatever sits above them. How to join and the
          right-group promise (joining flow, owner 2026-10-12) are two more
          spec rows on a hairline: "Join" for a by-approval group only, "Week
          1" on every group with a fixed class. Private lessons have no group
          to move between, so neither row. */}
      <div className="mt-auto">
        {scheduled && (
          <dl className="mt-4 space-y-2.5 border-t border-white/10 pt-4">
            {g.joining === "approval" && (
              <div className={ROW_CLASS}>
                <dt className={`${LABEL_CLASS} pt-0.5`}>Join</dt>
                <dd className={TERMS_CLASS}>{APPROVAL_LINE}</dd>
              </div>
            )}
            <div className={ROW_CLASS}>
              <dt className={`${LABEL_CLASS} pt-0.5`}>Week 1</dt>
              <dd className={TERMS_CLASS}>{RIGHT_GROUP_PROMISE_SHORT}</dd>
            </div>
          </dl>
        )}

        {/* The one link: the quiz, named for this group. The arrow is decoration. */}
        <p className="pt-5 text-sm font-semibold text-[#B4E655]">
          <TrackedLink
            href={`/intake?program=${program.slug}`}
            track="quiz"
            source={source}
            className={STRETCHED_LINK}
          >
            {QUIZ_CTA_LABEL}
            <span className="sr-only">{linkSuffix(g.name)}</span>
          </TrackedLink>{" "}
          <span
            aria-hidden="true"
            className="inline-block motion-safe:transition-transform motion-safe:duration-150 motion-safe:group-hover:translate-x-1"
          >
            →
          </span>
        </p>
      </div>
    </article>
  );
}
