import Link from "next/link";
import type { ReactNode } from "react";
import {
  APPROVAL_ASK_LINE,
  ASSESSMENT_CERTAINTY_LINE,
  RIGHT_GROUP_PROMISE,
} from "@/content/programs";
import { TrackedLink } from "@/components/ui/TrackedButton";
import { Heading } from "@/components/ui/Heading";
import { TEXT_LINK_LIME } from "@/components/ui/TextLink";
import { ApprovalIcon, CourtIcon, DocumentIcon, StopwatchIcon } from "@/components/ui/icons";

// "Good to know" (owner-approved design, 2026-11-17): what a group card no
// longer repeats, said once under the groups on /programs and on each
// program page with fixed classes. Week one on court and the right-group
// promise (the one constant); the by-approval group, named in full so the
// group and the High Performance tier never blur (voice.md), only where that
// group is listed; the optional assessment with its $20 mechanic spelled out
// (voice.md rule 2) and the exact label "Book Your Assessment"; and the way
// to the Program Policies. The heading sits left and the list right from md.
// Rows on hairlines, no boxes; the icons are decoration. Two links, both
// text links: neither is the page's main button.

type Row = { title: string; body?: string; icon: ReactNode; link?: ReactNode };

const ROW_GLYPH = "h-[22px] w-[22px]";

/** A row's link: the lime text link with its arrow as decoration. */
function Arrow() {
  return (
    <span aria-hidden="true" className="ml-1">
      →
    </span>
  );
}

export function GoodToKnow({
  source,
  approvalGroup,
  headingSize = "section",
  className = "",
}: {
  /** Analytics source for the assessment link, e.g. "programs-good-to-know". */
  source: string;
  /**
   * The by-approval group the page lists, by its name ("High Performance
   * Youth Bootcamp"): adds its row. A page with no such group passes none.
   */
  approvalGroup?: string;
  /**
   * "section": a page section's heading (/programs). "sub": the size of a
   * program page's own h2s, so it sits level with its neighbours there.
   */
  headingSize?: "section" | "sub";
  className?: string;
}) {
  const rows: Row[] = [
    {
      title: "Week one, on court",
      body: `Your coach confirms your level. ${RIGHT_GROUP_PROMISE}`,
      icon: <CourtIcon className={ROW_GLYPH} />,
    },
    ...(approvalGroup
      ? [
          {
            title: `The ${approvalGroup} is by approval`,
            body: APPROVAL_ASK_LINE,
            icon: <ApprovalIcon className={ROW_GLYPH} />,
          },
        ]
      : []),
    {
      title: "Want certainty first?",
      body: ASSESSMENT_CERTAINTY_LINE,
      icon: <StopwatchIcon className={ROW_GLYPH} />,
      link: (
        <TrackedLink href="/assessment/book" track="assessment" source={source} className={TEXT_LINK_LIME}>
          Book Your Assessment
          <Arrow />
        </TrackedLink>
      ),
    },
    {
      title: "Cancellations and make-ups",
      icon: <DocumentIcon className={ROW_GLYPH} />,
      link: (
        <Link href="/legal/refund-policy" className={TEXT_LINK_LIME}>
          Program Policies
          <Arrow />
        </Link>
      ),
    },
  ];

  return (
    <section
      id="good-to-know"
      aria-labelledby="good-to-know-heading"
      className={`grid scroll-mt-24 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)] md:gap-16 ${className}`.trim()}
    >
      {headingSize === "sub" ? (
        <h2 id="good-to-know-heading" className="text-xl font-semibold text-white">
          Good to know
        </h2>
      ) : (
        <Heading id="good-to-know-heading">Good to know</Heading>
      )}
      <ul role="list">
        {rows.map((row) => (
          <li key={row.title} className="relative border-t border-white/10 py-4 pl-10 last:border-b md:py-5">
            <span aria-hidden="true" className="absolute left-0 top-[17px] text-[#B4E655] md:top-[21px]">
              {row.icon}
            </span>
            <h3 className="text-[17px] font-semibold leading-snug text-white md:text-lg">{row.title}</h3>
            {row.body && <p className="mt-1 max-w-xl text-[15px] text-white/75">{row.body}</p>}
            {row.link && <p>{row.link}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}
