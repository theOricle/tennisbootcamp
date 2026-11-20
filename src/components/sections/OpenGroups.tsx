import Link from "next/link";
import { signedInOpenCards, type GroupCard } from "@/lib/groupBlocks";
import { TEXT_LINK_LIME } from "@/components/ui/TextLink";
import { ProgramGroupCard } from "./ProgramGroupCard";

// The open blocks for a signed-in player (owner, 2026-11-19: "when I am
// already signed in it just tell me I already submitted request"): the quiz's
// already-taken screen and the dashboard list them as the same group cards,
// each with "Join" to its sign-up page. A by-approval block is left out
// (signedInOpenCards): a quiz-taker has asked already, and its "Ask to join"
// would lead back to the same list. With none open, one plain line says so
// and points to the groups. It promises nothing the site does not do:
// nothing emails a player when a block opens.

/** The heading over the open blocks, where a screen lists them. */
export const OPEN_GROUPS_HEADING = "Groups with dates";

/** What is true when no block is open. */
export const NO_DATES_LINE = "No group has dates yet.";

export function OpenGroupsList({
  cards,
  headingLevel = 3,
  quiet = false,
  empty = "box",
  className = "",
}: {
  /** The open blocks' cards (signedInOpenCards or accountOpenCards, src/lib/groupBlocks.ts). */
  cards: readonly GroupCard[];
  /** The cards' title level under the screen's own heading. */
  headingLevel?: 3 | 4;
  /** Every button an outline, for a screen whose one primary action is elsewhere (the dashboard). */
  quiet?: boolean;
  /** With none open: a dashed box on the page, or a plain line inside a card of its own. */
  empty?: "box" | "line";
  className?: string;
}) {
  const shown = signedInOpenCards(cards);
  if (shown.length === 0) {
    const line = (
      <>
        <p className="text-[15px] text-white/75">{NO_DATES_LINE}</p>
        <Link href="/programs" className={TEXT_LINK_LIME}>
          Browse Programs →
        </Link>
      </>
    );
    return empty === "line" ? (
      <div className={className}>{line}</div>
    ) : (
      <div className={`rounded-2xl border border-dashed border-white/25 px-5 pb-2 pt-4 ${className}`.trim()}>{line}</div>
    );
  }
  return (
    <ul role="list" className={`grid gap-3 sm:grid-cols-2 ${className}`.trim()}>
      {shown.map(({ group, block }) => (
        <li key={group.id} className="flex [&>*]:w-full">
          <ProgramGroupCard group={group} block={block} headingLevel={headingLevel} quiet={quiet} />
        </li>
      ))}
    </ul>
  );
}
