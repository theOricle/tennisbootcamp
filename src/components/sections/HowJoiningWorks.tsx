import type { ReactNode } from "react";
import {
  COHORT_LENGTH,
  COHORT_TOTAL_LABEL,
  RIGHT_GROUP_PROMISE,
  SESSION_PRICE_LABEL,
} from "@/content/programs";
import { Heading } from "@/components/ui/Heading";
import { PayCardIcon, PickGroupIcon, PointPlayIcon } from "@/components/ui/icons";

// How joining works (joining flow, owner 2026-10-12; "pick a group, then
// pay", owner-approved design 2026-11-17): three steps on the home page.
// Pick a group by age and level, pay for the cohort, and start on court,
// where the coach confirms the level in week one and moves the player, or
// refunds them in full when no group fits. The price comes from the
// constants in src/content/programs.ts, and the promise is the one constant
// every surface shares (one promise, one wording).
//
// A real sequence, so it is drawn as one: an ordered list (role="list" keeps
// its semantics where the list style is removed), each step an icon in a
// ring, a hairline joining the rings. The icons and the line are
// decoration. Server-rendered, no state and no link: the main action sits
// in the hero and in the closing. The optional assessment, High Performance
// by approval and the policies are "Good to know" on /programs
// (src/components/sections/GoodToKnow.tsx).

type Step = { title: string; body: string; icon: ReactNode };

const STEP_GLYPH = "h-[22px] w-[22px]";

/** The three steps, in order. Exported so `npm test` reads the same words the page prints. */
export const JOINING_STEPS: readonly Step[] = [
  {
    title: "Pick a group",
    body: "By age and level.",
    icon: <PickGroupIcon className={STEP_GLYPH} />,
  },
  {
    title: "Pay online",
    body: `${SESSION_PRICE_LABEL} a session, ${COHORT_TOTAL_LABEL} for the ${COHORT_LENGTH}. Card or e-transfer.`,
    icon: <PayCardIcon className={STEP_GLYPH} />,
  },
  {
    title: "Start on court",
    body: `Your coach confirms your level in week one. ${RIGHT_GROUP_PROMISE}`,
    icon: <PointPlayIcon className={STEP_GLYPH} strokeWidth={1.7} />,
  },
];

export function HowJoiningWorks({ className = "" }: { className?: string }) {
  const last = JOINING_STEPS.length - 1;
  return (
    <section
      id="how-joining-works"
      aria-labelledby="how-joining-works-heading"
      className={`scroll-mt-24 ${className}`.trim()}
    >
      <Heading id="how-joining-works-heading">How joining works</Heading>

      <ol role="list" className="mt-5 grid md:mt-7 md:grid-cols-3 md:gap-x-10">
        {JOINING_STEPS.map((step, i) => (
          <li
            key={step.title}
            className="relative grid grid-cols-[44px_minmax(0,1fr)] gap-x-3.5 pb-[22px] last:pb-0 md:block md:pb-0"
          >
            {/* The line to the next step: down the left on phones, across
                the top from md. */}
            {i < last && (
              <span
                aria-hidden="true"
                className="absolute bottom-1.5 left-[21.5px] top-[50px] w-px bg-white/[0.18] md:bottom-auto md:left-[58px] md:right-[-26px] md:top-[22px] md:h-px md:w-auto"
              />
            )}
            <span
              aria-hidden="true"
              className="grid h-11 w-11 place-items-center rounded-full border border-[#B4E655]/40 bg-[#B4E655]/[0.08] text-[#B4E655]"
            >
              {step.icon}
            </span>
            <div className="min-w-0">
              <h3 className="pt-0.5 text-[17px] font-semibold leading-snug text-white md:mt-3.5 md:pt-0 md:text-lg">
                {step.title}
              </h3>
              <p className="mt-[3px] max-w-[30rem] text-pretty text-[15px] text-white/75">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
