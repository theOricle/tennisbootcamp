import Link from "next/link";
import type { Program, ProgramGroup } from "@/types/program";
import type { Cohort } from "@/types/cohort";
import {
  formatGroupWhen,
  groupAction,
  groupStatus,
  groupWhenParts,
  groupWhoLabel,
  priceParts,
  type GroupAction,
} from "@/lib/programCatalog";
import { locationById } from "@/content/locations";
import { NEWSLETTER_ANCHOR } from "@/content/site";
import { buttonClass } from "@/components/ui/Button";
import { CARD_CLASS } from "@/components/ui/Card";
import { TrackedLink } from "@/components/ui/TrackedButton";
import { CalendarIcon, PersonIcon } from "@/components/ui/icons";
import { PinIcon } from "@/components/locations/LocationLine";
import { LevelTag } from "@/components/tiers";
import { StatusChip } from "./ProgramCard";

// One group as its own card (owner, 2026-10-12; one level per group and a
// level-led title, 2026-10-13; the short card, owner-approved design
// 2026-11-17). Top row: the one level tag and the status chip. Then the
// level-led title ("Intermediate Adult Bootcamp"). Then three plain lines,
// each with a small icon and no label: who (the ages), when (the class time,
// and the day it starts once a public cohort exists), where (the club's
// name). Then, on a hairline pinned to the bottom so sibling cards line up,
// the price once (the whole price of the bootcamp: the cohort total in
// bold over the cohort length, both from the constants in
// src/content/programs.ts; never a per-session figure) and one button.
//
// No rules on the card: the week-one promise, High Performance by approval
// and the optional assessment are said once on the page, under "Good to
// know". No photo: the program's photograph identifies the program.
//
// One interactive element, the button, named for its group for assistive
// tech ("Join the Beginner Junior Bootcamp"), so seven cards on /programs
// are seven distinct actions. Four states (groupStatus and groupAction,
// src/lib/programCatalog.ts): open, a lime "Join"; down to its last spots,
// the warn chip and a lime "Join"; full, an outline "Notify me"; by approval
// (and invite only), an outline "Ask to join".
//
// Until join-and-pay is built, "Join" and "Ask to join" open what the card's
// link always opened: the quiz for this program, which is how a spot is
// asked for today. The button always reads its own action: it opts out of
// the quiz-taken swap (`quizAware={false}`), which would relabel it "See
// your groups". "Notify me" goes to the newsletter line in the footer.

const FACT_GLYPH = "mt-[3px] h-[15px] w-[15px] shrink-0 opacity-65";

export type ProgramGroupCardProps = {
  group: ProgramGroup;
  program: Pick<Program, "slug">;
  /** The earliest public cohort that trains in this group, if any: its start date joins the "when" line. */
  nextCohort?: Cohort;
  /**
   * Seats left in that cohort, read once per page (src/lib/groupSeats.ts).
   * Absent or null reads "Open to join". Display only.
   */
  seatsLeft?: number | null;
  /** The quiz link's analytics source. */
  source?: string;
  /** The title's level: h3 under a page section's h2 (the default); h4 under an h3. */
  headingLevel?: 2 | 3 | 4;
  /** Where "Notify me" goes: the footer's newsletter line, or a page's own form when it has one. */
  notifyHref?: string;
};

/** The card's one button. A link in every state, styled as the lime or the outline button. */
function GroupButton({
  action,
  programSlug,
  source,
  notifyHref,
}: {
  action: GroupAction;
  programSlug: string;
  source: string;
  notifyHref: string;
}) {
  const label = (
    <>
      {action.label}
      {action.nameSuffix && <span className="sr-only">{action.nameSuffix}</span>}
    </>
  );
  // One height for the lime and the outline button (the outline's border
  // adds 2px to the shared 44px), so the feet of sibling cards line up.
  const shape = "h-[46px] whitespace-nowrap";
  if (action.kind === "notify") {
    return (
      <Link href={notifyHref} className={`${buttonClass("secondary")} ${shape}`}>
        {label}
      </Link>
    );
  }
  return (
    <TrackedLink
      href={`/intake?program=${programSlug}`}
      track="quiz"
      source={source}
      quizAware={false}
      className={`${buttonClass(action.kind === "join" ? "primary" : "secondary")} ${shape}`}
    >
      {label}
    </TrackedLink>
  );
}

/**
 * The price, once: the whole price of the bootcamp (owner, 2026-11-17), the
 * amount in bold over what it buys (the cohort length). A price with no
 * amount ("Rates on request") is one line.
 */
function GroupPrice({ text }: { text: string }) {
  const [lead, rest] = priceParts(text);
  return (
    <p className="min-w-0 tabular-nums">
      <span className="block text-lg font-semibold leading-tight tracking-[-0.01em] text-white">{lead}</span>
      {rest && <span className="block text-[13px] text-white/60">{rest}</span>}
    </p>
  );
}

export function ProgramGroupCard({
  group: g,
  program,
  nextCohort,
  seatsLeft,
  source = "group-card",
  headingLevel = 3,
  notifyHref = `#${NEWSLETTER_ANCHOR}`,
}: ProgramGroupCardProps) {
  const Title = headingLevel === 2 ? "h2" : headingLevel === 4 ? "h4" : "h3";
  const status = groupStatus(g, seatsLeft);
  const action = groupAction(g, status);
  const location = locationById(g.locationId);
  const when = groupWhenParts(g, nextCohort);

  return (
    <article
      id={g.id}
      className={`${CARD_CLASS} flex h-full scroll-mt-24 flex-col px-[18px] pb-4 pt-[18px] md:px-5 md:pb-[18px] md:pt-5`}
    >
      {/* The level tag and the status chip share a row; in the narrow
          three-across cards of a tablet they stack, the same way on every
          card, so sibling titles stay level. */}
      <div className="flex min-h-[26px] flex-wrap items-center justify-between gap-x-2 gap-y-1.5 md:flex-col md:items-start lg:flex-row lg:items-center">
        <LevelTag level={g.level} plain />
        {status && <StatusChip status={status} />}
      </div>

      <Title className="mt-2.5 text-lg font-semibold leading-tight tracking-tight text-white">{g.name}</Title>

      {/* Who, when, where: three plain lines. The glyphs are decoration. */}
      <ul role="list" className="mb-4 mt-2 space-y-1 text-sm text-white/75">
        <li className="flex items-start gap-2 text-white/90">
          <PersonIcon className={FACT_GLYPH} />
          {groupWhoLabel(g)}
        </li>
        <li className="flex items-start gap-2">
          <CalendarIcon className={FACT_GLYPH} />
          {/* The parts wrap whole, and the dot rides with the part before
              it, so a second line never opens with a separator. */}
          <span className="flex min-w-0 flex-wrap gap-x-1 tabular-nums">
            {when.map((part, i) => (
              <span key={part} className="whitespace-nowrap">
                {part}
                {i < when.length - 1 && <span aria-hidden="true"> ·</span>}
              </span>
            ))}
          </span>
        </li>
        {location && (
          <li className="flex items-start gap-2">
            <PinIcon className={FACT_GLYPH} />
            {location.name}
          </li>
        )}
      </ul>

      {/* The foot, pinned to the bottom. Price left, button right; in the
          narrow three-across cards of a tablet the button takes its own row. */}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3.5 md:flex-col md:items-stretch lg:flex-row lg:items-center">
        <GroupPrice text={g.price} />
        <GroupButton action={action} programSlug={program.slug} source={source} notifyHref={notifyHref} />
      </div>
    </article>
  );
}

/**
 * A group with no fixed class (private lessons) as one row: its name, "By
 * arrangement" and the price in a line, and one outline button, which leads
 * where the private card's link always led: the quiz for the program.
 */
export function ArrangedGroupRow({
  group: g,
  program,
  source = "group-card",
  headingLevel = 3,
}: Pick<ProgramGroupCardProps, "group" | "program" | "source" | "headingLevel">) {
  const Title = headingLevel === 2 ? "h2" : headingLevel === 4 ? "h4" : "h3";
  const action = groupAction(g, groupStatus(g));
  return (
    <article
      id={g.id}
      className={`${CARD_CLASS} flex scroll-mt-24 flex-wrap items-center justify-between gap-x-6 gap-y-3.5 p-[18px] md:p-5`}
    >
      <div className="min-w-0">
        <Title className="text-lg font-semibold leading-tight text-white">{g.name}</Title>
        <p className="mt-0.5 text-sm text-white/75">
          {formatGroupWhen(g)} · {g.price}
        </p>
      </div>
      <GroupButton action={action} programSlug={program.slug} source={source} notifyHref={`#${NEWSLETTER_ANCHOR}`} />
    </article>
  );
}
