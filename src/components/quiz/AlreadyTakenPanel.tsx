"use client";

import { useRef } from "react";
import { useFocusOnMount } from "@/lib/useFocusOnChange";
import { ADD_PLAYER_LABEL, RETAKE_QUIZ_LABEL } from "@/lib/quizStatus";
import { accountOpenCards, type AgePlayer, type GroupCard } from "@/lib/groupBlocks";
import { buttonClass } from "@/components/ui/Button";
import { TextLink } from "@/components/ui/TextLink";
import { TrackedButton } from "@/components/ui/TrackedButton";
import { OPEN_GROUPS_HEADING, OpenGroupsList } from "@/components/sections/OpenGroups";

// The quiz-taker's panel (owner, 2026-10-12): a signed-in account that
// already took the quiz is told so instead of being asked again, with its
// next step, "Add another player" (the wizard opens on a child's block) and
// "Retake the quiz" (the wizard as it is; a retake still writes an ordinary
// Sheet row, the /api/intake contract unchanged). Signed out, nobody sees it
// (owner, 2026-11-18). The links `?add=1` and `?retake=1` skip it.
//
// No dead end (owner, 2026-11-19: "when I am already signed in it just tell
// me I already submitted request"). When a group has dates, one line states
// the two paths, the open blocks follow as the same group cards, each with
// "Enroll" to its sign-up page, and the dashboard button steps back to an
// outline beside them. The cards sit on the page, never inside a card of
// their own. With none listed, the panel keeps its card and one line says
// which is true: no group has dates yet, or none with dates is open to them.
// The blocks come from the quiz's server layout (src/app/intake/layout.tsx);
// the panel lists the ones whose ages take one of the household's players,
// as the dashboard does (accountOpenCards), and never a by-approval block: a
// quiz-taker has asked already.

/** The wizard card's chrome, as the quiz's result screens draw it: flat on phones (audit L10). */
const PANEL_CARD = "md:rounded-3xl md:border md:border-white/10 md:bg-white/5 md:p-8";

/** The two paths, when a group has dates: pick one and enroll now (its card's button), or let our coaches place the player from the quiz. */
export function twoPathsLine(whom: string): string {
  return `Pick a group with dates and enroll now, or let our coaches place ${whom} from your quiz answers.`;
}

export function AlreadyTakenPanel({
  playerCount,
  cards,
  players = [],
  onAdd,
  onRetake,
}: {
  playerCount: number;
  /** Every open block's card (openBlockCards), listed or not. */
  cards: readonly GroupCard[];
  /** The household's players, for their ages (ages only, never the level); none lists every open block. */
  players?: readonly AgePlayer[];
  onAdd: () => void;
  onRetake: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useFocusOnMount(headingRef);
  const open = accountOpenCards(cards, { enrolledCohortIds: [], players });
  const anyOpen = open.length > 0;
  const blocksOpen = cards.some((c) => c.block !== null);
  // A household reads by its count.
  const whom = playerCount > 1 ? `your ${playerCount} players` : "you";

  const heading = (
    <>
      <p className="text-xs font-semibold uppercase tracking-wide text-[#B4E655]">The 2-minute quiz</p>
      <h1 ref={headingRef} tabIndex={-1} className="mt-2 text-2xl font-semibold focus:outline-none md:text-3xl">
        You&apos;ve already taken the quiz.
      </h1>
    </>
  );
  const actions = (
    <>
      <div className="mt-6 flex flex-wrap gap-3">
        {/* Reads "Open your dashboard": only a signed-in taker sees the
            panel. An outline beside open blocks, whose "Enroll" leads. */}
        <TrackedButton variant={anyOpen ? "secondary" : "primary"} href="/intake" track="quiz" source="intake-taken">
          Take the 2-minute quiz
        </TrackedButton>
        <button type="button" onClick={onAdd} className={buttonClass("secondary")}>
          {ADD_PLAYER_LABEL}
        </button>
        <button type="button" onClick={onRetake} className={buttonClass("secondary")}>
          {RETAKE_QUIZ_LABEL}
        </button>
      </div>
      <p className="mt-4 text-xs text-white/60">
        Adding a player or retaking the quiz sends us a fresh set of answers; the ones on file stay as they are
        until our coaches read the new ones.
      </p>
    </>
  );

  return (
    <main className="min-h-screen bg-[#061427] text-white">
      {/* Wider while it lists open blocks, so two cards sit side by side at
          the width they have on /programs; the quiz's own width otherwise. */}
      <div className={`mx-auto ${anyOpen ? "max-w-4xl" : "max-w-2xl"} px-6 pb-12 pt-6 md:py-14`}>
        <div className="mb-4 flex items-center justify-between md:mb-8">
          <TextLink href="/">← Home</TextLink>
        </div>
        {anyOpen ? (
          <>
            {heading}
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/70">{twoPathsLine(whom)}</p>
            <section aria-labelledby="open-groups" className="mt-8">
              <h2 id="open-groups" className="text-lg font-semibold tracking-tight text-white">
                {OPEN_GROUPS_HEADING}
              </h2>
              <OpenGroupsList cards={open} className="mt-3" />
            </section>
            {actions}
          </>
        ) : (
          <div className={PANEL_CARD}>
            {heading}
            <p className="mt-3 text-sm leading-relaxed text-white/70">
              Your answers are in, and our coaches place {whom} by level and schedule from them. There is nothing
              else you need to do unless something changed.
            </p>
            <OpenGroupsList
              cards={open}
              blocksOpen={blocksOpen}
              whom={playerCount > 1 ? "your players" : "you"}
              empty="line"
              className="mt-4"
            />
            {actions}
          </div>
        )}
      </div>
    </main>
  );
}
