import Link from "next/link";
import type { GroupCard } from "@/lib/groupBlocks";
import { TEXT_LINK_LIME } from "@/components/ui/TextLink";
import { ProgramGroupCard } from "./ProgramGroupCard";

// The open blocks for a signed-in player (owner, 2026-11-19: "when I am
// already signed in it just tell me I already submitted request"): the quiz's
// already-taken screen and the dashboard list them as the same group cards,
// each with "Join" to its sign-up page. With none open, one plain line says
// so and points to the groups. It promises nothing the site does not do:
// nothing emails a player when a block opens.

/** The heading over the open blocks, where a screen lists them. */
export const OPEN_GROUPS_HEADING = "Groups with dates";

/** What is true when no block is open. */
export const NO_DATES_LINE = "No group has dates yet.";

export function OpenGroupsList({
  cards,
  headingLevel = 3,
  className = "",
}: {
  /** The open blocks' cards (openBlockCards, src/lib/groupBlocks.ts). */
  cards: readonly GroupCard[];
  /** The cards' title level under the screen's own heading. */
  headingLevel?: 3 | 4;
  className?: string;
}) {
  if (cards.length === 0) {
    return (
      <div className={`rounded-2xl border border-dashed border-white/25 px-5 pb-2 pt-4 ${className}`.trim()}>
        <p className="text-[15px] text-white/75">{NO_DATES_LINE}</p>
        <Link href="/programs" className={TEXT_LINK_LIME}>
          Browse Programs →
        </Link>
      </div>
    );
  }
  return (
    <ul role="list" className={`grid gap-3 sm:grid-cols-2 ${className}`.trim()}>
      {cards.map(({ group, block }) => (
        <li key={group.id} className="flex [&>*]:w-full">
          <ProgramGroupCard group={group} block={block} headingLevel={headingLevel} />
        </li>
      ))}
    </ul>
  );
}
