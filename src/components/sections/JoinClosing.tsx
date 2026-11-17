import { Heading } from "@/components/ui/Heading";
import { MainAction } from "@/components/ui/MainAction";

/**
 * The closing (audit M13; owner-approved design, 2026-11-17): a page ends on
 * the main action, never on a dead end. One line, "Groups are open to
 * join.", then the lime button and the quiz side line; side by side from md.
 * No box and no fill: the words and the one lime button are enough. Sets no
 * horizontal padding or max-width: the page's Container does (audit H2).
 */
export function JoinClosing({
  source,
  quizHref,
  href,
  className = "",
}: {
  /** Analytics source for the quiz link, e.g. "home-closing". */
  source: string;
  /** The quiz link; a program page passes `/intake?program={slug}`. */
  quizHref?: string;
  /** Where the button goes; a page with its own group list passes that list's anchor. */
  href?: string;
  className?: string;
}) {
  return (
    <section
      aria-labelledby="join-closing-title"
      className={`grid items-center gap-[18px] md:grid-cols-[minmax(0,1fr)_auto] md:gap-8 ${className}`.trim()}
    >
      <Heading id="join-closing-title">Groups are open to join.</Heading>
      <MainAction source={source} quizHref={quizHref} href={href} />
    </section>
  );
}
