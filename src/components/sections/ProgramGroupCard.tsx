import Link from "next/link";
import type { Program, ProgramGroup } from "@/types/program";
import type { BlockFacts } from "@/lib/groupBlocks";
import {
  DATES_COMING_SOON,
  formatGroupWhen,
  groupAction,
  groupClassDays,
  groupStatus,
  groupWhoLabel,
  priceParts,
  type GroupAction,
} from "@/lib/programCatalog";
import { locationById } from "@/content/locations";
import { NEWSLETTER_ANCHOR } from "@/content/site";
import { buttonClass } from "@/components/ui/Button";
import { CARD_CLASS } from "@/components/ui/Card";
import { TrackedLink } from "@/components/ui/TrackedButton";
import { CalendarIcon, ClockIcon, PersonIcon } from "@/components/ui/icons";
import { PinIcon } from "@/components/locations/LocationLine";
import { LevelTag } from "@/components/tiers";
import { StatusChip } from "./ProgramCard";

// One group as its own card (owner, 2026-10-12; one level per group and a
// level-led title, 2026-10-13; the short card, owner-approved design
// 2026-11-17; one card per open block with its dates, owner 2026-11-19 and
// 2026-11-20). Top row: the one level tag and the status chip. Then the
// level-led title ("Intermediate Adult Bootcamp"). Then four plain lines,
// each with a small icon and no label: who (the ages), the dates (first
// class to last, "Jan 11 – Feb 15", or "Dates coming soon"), the class days
// and times ("Sundays 4–5pm", "Sundays and Wednesdays 4–5pm"), where (the
// club's name). Then, on a hairline pinned to the bottom so sibling cards
// line up, the price once (the whole price: the block's own total over its
// own length, with its class count when it runs more than one class a week,
// or for a group with no open block the constants in src/content/programs.ts;
// never a per-session figure) and one button.
//
// No rules on the card: the week-one promise, High Performance by approval
// and the optional assessment are said once on the page, under "Good to
// know". No photo: the program's photograph identifies the program.
//
// One interactive element, the button, named for its group for assistive
// tech ("Join the Beginner Adult Bootcamp"), and described by the card's
// dates, so two blocks of one group read apart. The states (groupStatus and
// groupAction, src/lib/programCatalog.ts): an open block, a lime "Join" to
// its sign-up page (/enroll/{cohortId}), signed in or not; down to its last
// spots, the warn chip and "Join"; full, an outline "Notify me"; by approval
// (and invite only), an outline "Ask to join" to the same sign-up page,
// where its approval step takes over; a planned group with no open block,
// "Dates coming soon" and an outline "Notify me". "Notify me" goes to the
// newsletter line in the footer, or the page's own form.

const FACT_GLYPH = "mt-[3px] h-[15px] w-[15px] shrink-0 opacity-65";

export type ProgramGroupCardProps = {
  group: ProgramGroup;
  /**
   * The open block this card shows (src/lib/groupBlocks.ts): its dates, class
   * days, price and seats, and the sign-up page "Join" opens. Absent or null
   * for a planned group with no open block, which reads "Dates coming soon".
   */
  block?: BlockFacts | null;
  /** The title's level: h3 under a page section's h2 (the default); h4 under an h3. */
  headingLevel?: 2 | 3 | 4;
  /** Where "Notify me" goes: the footer's newsletter line, or a page's own form when it has one. */
  notifyHref?: string;
  /**
   * Every button an outline, "Join" included: for a screen whose one primary
   * action is elsewhere (the dashboard, where the next step leads).
   */
  quiet?: boolean;
};

/** The words of a button: the label, and the rest of its accessible name for assistive tech. */
function ButtonLabel({ action }: { action: GroupAction }) {
  return (
    <>
      {action.label}
      {action.nameSuffix && <span className="sr-only">{action.nameSuffix}</span>}
    </>
  );
}

// One height for the lime and the outline button (the outline's border adds
// 2px to the shared 44px), so the feet of sibling cards line up.
const BUTTON_SHAPE = "h-[46px] whitespace-nowrap";

/** The card's one button: a link in every state, styled as the lime or the outline button. */
function GroupButton({
  action,
  block,
  notifyHref,
  describedBy,
  quiet = false,
}: {
  action: GroupAction;
  block: BlockFacts | null;
  notifyHref: string;
  describedBy?: string;
  quiet?: boolean;
}) {
  const href = action.kind === "notify" || !block ? notifyHref : `/enroll/${block.cohortId}`;
  return (
    <Link
      href={href}
      aria-describedby={describedBy}
      className={`${buttonClass(action.kind === "join" && !quiet ? "primary" : "secondary")} ${BUTTON_SHAPE}`}
    >
      <ButtonLabel action={action} />
    </Link>
  );
}

/**
 * The price, once: the whole price of the bootcamp (owner, 2026-11-17), the
 * amount in bold over what it buys (the length). A price with no amount
 * ("Rates on request") is one line.
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

/**
 * "Jan 11 – Feb 15" as its two dates, each kept whole, the dash riding the
 * first, so a cross-year range never breaks inside a date.
 */
function DateRange({ text }: { text: string }) {
  const dates = text.split(" – ");
  return (
    <span className="flex min-w-0 flex-wrap gap-x-1 tabular-nums">
      {dates.map((date, i) => (
        <span key={`${i}-${date}`} className="whitespace-nowrap">
          {date}
          {i < dates.length - 1 && " –"}
        </span>
      ))}
    </span>
  );
}

/**
 * "Sundays 4–5pm, Wednesdays 6–7pm": each day's part starts a line of its
 * own when the two do not fit on one, the comma riding the part before it,
 * and a time range never breaks at its dash ("4–" over "5pm").
 */
function ClassDays({ text }: { text: string }) {
  const parts = text.split(", ");
  return (
    <span className="flex min-w-0 flex-wrap gap-x-1 tabular-nums">
      {parts.map((part, i) => {
        const at = part.lastIndexOf(" ");
        return (
          <span key={`${i}-${part}`}>
            {at > 0 && `${part.slice(0, at)} `}
            <span className="whitespace-nowrap">
              {at > 0 ? part.slice(at + 1) : part}
              {i < parts.length - 1 && ","}
            </span>
          </span>
        );
      })}
    </span>
  );
}

export function ProgramGroupCard({
  group: g,
  block = null,
  headingLevel = 3,
  notifyHref = `#${NEWSLETTER_ANCHOR}`,
  quiet = false,
}: ProgramGroupCardProps) {
  const Title = headingLevel === 2 ? "h2" : headingLevel === 4 ? "h4" : "h3";
  const dated = block !== null;
  const status = groupStatus(g, block?.seatsLeft, dated);
  const action = groupAction(g, status, dated);
  const location = locationById(g.locationId);
  const datesId = `${g.id}-dates`;

  return (
    <article
      id={g.id}
      className={`${CARD_CLASS} flex h-full scroll-mt-24 flex-col px-[18px] pb-4 pt-[18px] md:px-5 md:pb-[18px] md:pt-5`}
    >
      {/* The level tag and the status chip share a row; in the narrow
          three-across cards of a tablet they stack, the same way on every
          card, so sibling titles stay level. The stacked row keeps the
          chip's room on a card with no chip (a group with no open block). */}
      <div className="flex min-h-[26px] flex-wrap items-center justify-between gap-x-2 gap-y-1.5 md:min-h-[52px] md:flex-col md:items-start lg:min-h-[26px] lg:flex-row lg:items-center">
        <LevelTag level={g.level} plain />
        {status && <StatusChip status={status} />}
      </div>

      <Title className="mt-2.5 text-lg font-semibold leading-tight tracking-tight text-white">{g.name}</Title>

      {/* Who, the dates, the class days, where: four plain lines. The glyphs
          are decoration. The dates are the strongest of the four, white and
          medium, so two blocks of one group read as two options. */}
      <ul role="list" className="mb-4 mt-2 space-y-1 text-sm text-white/75">
        <li className="flex items-start gap-2 text-white/90">
          <PersonIcon className={FACT_GLYPH} />
          {groupWhoLabel(g)}
        </li>
        <li id={datesId} className={`flex items-start gap-2 ${dated ? "font-medium text-white" : "text-white/60"}`}>
          <CalendarIcon className={FACT_GLYPH} />
          {block ? <DateRange text={block.dates} /> : DATES_COMING_SOON}
        </li>
        <li className="flex items-start gap-2">
          <ClockIcon className={FACT_GLYPH} />
          <ClassDays text={block ? block.days : groupClassDays(g)} />
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
        <GroupPrice text={block ? block.price : g.price} />
        <GroupButton
          action={action}
          block={block}
          notifyHref={notifyHref}
          describedBy={dated ? datesId : undefined}
          quiet={quiet}
        />
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
}: {
  group: ProgramGroup;
  program: Pick<Program, "slug">;
  /** The quiz link's analytics source. */
  source?: string;
  headingLevel?: 2 | 3 | 4;
}) {
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
      {/* "Ask about lessons" opens the quiz for the program for everyone, a
          quiz-taker included (quizAware={false}), as it always has. */}
      <TrackedLink
        href={`/intake?program=${program.slug}`}
        track="quiz"
        source={source}
        quizAware={false}
        className={`${buttonClass("secondary")} ${BUTTON_SHAPE}`}
      >
        <ButtonLabel action={action} />
      </TrackedLink>
    </article>
  );
}
