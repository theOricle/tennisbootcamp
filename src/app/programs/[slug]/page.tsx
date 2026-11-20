import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { CONTACT_EMAIL, groupsForProgram, priceLineFor, programs } from "@/content/programs";
import type { Program } from "@/types/program";
import { EmailCapture } from "@/components/sections/EmailCapture";
import { GoodToKnow } from "@/components/sections/GoodToKnow";
import { JoinClosing } from "@/components/sections/JoinClosing";
import { ProgramGroupCard } from "@/components/sections/ProgramGroupCard";
import { CHIP_NEUTRAL } from "@/components/sections/ProgramCard";
import { Container } from "@/components/layout/Container";
import { Heading } from "@/components/ui/Heading";
import { Button } from "@/components/ui/Button";
import { QuizSideLine } from "@/components/ui/MainAction";
import { TrackedButton } from "@/components/ui/TrackedButton";
import { formatStartDate } from "@/lib/cohorts";
import { getPublicCohorts } from "@/lib/cohortsDb";
import { readSeatSnapshot } from "@/lib/groupSeats";
import {
  cardsDaysLabel,
  cardsHeading,
  cardsLevelTags,
  cardsNextStart,
  cardsPrice,
  cardsScheduleLine,
  groupCards,
  type GroupCard,
} from "@/lib/groupBlocks";
import { seatsFromSnapshot } from "@/lib/seatCount";
import { GROUPS_ANCHOR, JOIN_CTA_LABEL } from "@/lib/mainAction";
import { locationsForProgram } from "@/lib/locationCatalog";
import { LocationLine } from "@/components/locations/LocationLine";
import { agesChipLabel, programLevelRange, programLevelTags } from "@/lib/programCatalog";
import { TIER_COUNT_WORD, TIER_LADDER_SPAN, tierById } from "@/lib/tiers";
import { LevelTag, TierLine } from "@/components/tiers";
import { TEXT_LINK_LIME } from "@/components/ui/TextLink";
import { JsonLd } from "@/components/JsonLd";
import { courseJsonLd } from "@/lib/structuredData";
import { ProgramViewerPanel, ViewerSwap } from "@/components/programs/ProgramViewer";

/**
 * The phone summary under the H1 (audit M13): which days and what it costs,
 * so the decision facts sit above the fold; who it is for, and the tier
 * span, are the chip row under the description (L8). The days and the price
 * are the cards' below (fix round, #85), every card's, with dates or without:
 * one price when they share it, "from" the lowest when they differ, each with
 * its class count as the cards name it; always the whole price (owner,
 * 2026-11-17: never a per-session figure). A program with no fixed class states its terms in the panel.
 * Each fact is joined with no-break spaces, so a line wraps only between
 * facts.
 */
const NBSP = " ";

function summaryFacts(program: Program, cards: readonly GroupCard[]): string[] {
  const days = cardsDaysLabel(cards);
  if (program.comingSoon || !days) return [];
  return [days, ...(program.priceSummary ? [cardsPrice(cards, program.priceSummary)] : [])];
}

// Incremental static regeneration (audit M39): the page is served from the
// edge and rebuilt at most once a minute, so a cohort that has started drops
// off within a minute even with no admin change. The admin cohort actions
// also revalidate it at once (src/lib/cohortRevalidate.ts).
export const revalidate = 60;

/** Every listed program is built ahead; a retired slug still redirects on demand. */
export function generateStaticParams() {
  return programs.filter((p) => !p.unlisted).map((p) => ({ slug: p.slug }));
}

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const program = programs.find((p) => p.slug === slug);
  if (!program) return {};
  return {
    title: program.title,
    // Hand-written per program (audit M10); a slice cut words in half.
    description: program.metaDescription ?? program.description,
    alternates: { canonical: `/programs/${program.slug}` },
  };
}

export default async function ProgramDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const program = programs.find((p) => p.slug === slug);
  if (!program) notFound();
  // Retired programs keep their id for old rows but have no public page
  // (next.config.ts redirects the known ones before the page is reached).
  if (program.unlisted) permanentRedirect("/programs");

  // Supabase only (backlog #1): public, inviting/confirmed, not yet started.
  // Draft, cancelled and past cohorts never reach this page.
  const publicCohorts = await getPublicCohorts();
  const openCohorts = publicCohorts.filter((c) => c.programId === program.id);

  // Live seat counts, from one read of the enrollment sheet per render (none
  // while the program has no public cohort; null = credentials not set or
  // the read failed). The cohort cards and the group cards share it, by the
  // block's id.
  const seatSnapshot = openCohorts.length > 0 ? await readSeatSnapshot() : null;
  const seatCounts: Record<string, number | null> = Object.fromEntries(
    openCohorts.map((c) => [c.id, seatSnapshot ? seatsFromSnapshot(seatSnapshot, c.id, c.capacityMax) : null] as const)
  );

  const hasOpenCohorts = openCohorts.length > 0;
  // Each open block's own card carries Join, to its sign-up page (owner,
  // 2026-11-19); the panel's main button scrolls to the cards.
  const quizHref = `/intake?program=${program.slug}`;
  // Null for a program with no stated price: no Course markup.
  const courseLd = courseJsonLd(program);
  const groups = groupsForProgram(program.slug);
  // One card per open block of this program, with its dates, class days,
  // price and seats left, and one per planned group with none ("Dates coming
  // soon"; owner, 2026-11-19 and 2026-11-20; src/lib/groupBlocks.ts). Every
  // heading, count, day list and "next starts" line on the page reads these
  // cards, never the planned lineup alone (fix round, #85).
  const cards = groupCards(groups, openCohorts, seatCounts).filter((c) => c.group.status !== "arranged");
  const summary = summaryFacts(program, cards);
  // The first class of the earliest open block the cards show.
  const nextStart = cardsNextStart(cards);
  // The schedule line in the panel: the cards' days and starts; a program
  // with no fixed class keeps its own line ("By arrangement").
  const scheduleLine = cards.length > 0 ? cardsScheduleLine(cards) : program.schedule;
  // The panel's price sentence: the cards' price (one, or "From" the lowest,
  // with its class count), then the $20 mechanic in full; the program's own
  // line with no fixed class.
  const cardsPriceText = cards.length > 0 && program.priceSummary ? cardsPrice(cards, program.priceSummary) : null;
  const priceLine = cardsPriceText
    ? priceLineFor(`${cardsPriceText.charAt(0).toUpperCase()}${cardsPriceText.slice(1)}`)
    : program.priceLine;
  // The numeric span the program's groups together cover (the viewer panel's
  // fit check) and the level tags the cards carry (owner, 2026-10-13): one
  // per group, and one more for a block at a level the lineup has none for.
  const range = programLevelRange(program);
  const tags = cards.length > 0 ? cardsLevelTags(cards) : groups.length > 0 ? programLevelTags(groups) : [];
  const tagNames =
    tags === null
      ? "every level"
      : tags.map((id) => tierById(id).name).reduce((line, name, i, all) =>
          i === 0 ? name : i === all.length - 1 ? `${line} and ${name}` : `${line}, ${name}`, "");
  // A program with fixed classes lists them as group cards (owner,
  // 2026-10-12); one with no fixed class (private lessons) states its terms
  // in the panel instead, so the page never shows the same card twice.
  const scheduledGroups = groups.filter((g) => g.day !== null);
  // The page's own group list, which the main button scrolls to.
  const groupListHref = scheduledGroups.length > 0 ? `#${GROUPS_ANCHOR}` : undefined;
  // Where the program's groups train (owner, 2026-10-12): one club today.
  const programLocations = locationsForProgram(program.slug);
  const arranged = scheduledGroups.length === 0 && !program.comingSoon;
  // "Three groups on Saturdays": counted from the cards shown, on the days
  // their classes run.
  const groupsHeading = cards.length > 0 ? cardsHeading(cards) : "Groups";

  return (
    <main className="min-h-screen bg-[#061427] text-white">
      {courseLd && <JsonLd data={courseLd} />}

      {/* Breadcrumb: on the header's left edge (one Container, audit H2),
          with landmark and current-page semantics (audit L6). */}
      <div className="border-b border-white/10">
        <Container as="nav" aria-label="Breadcrumb" className="py-1">
          <ol role="list" className="flex flex-wrap items-center gap-x-2 text-sm text-white/60">
            <li>
              <Link
                href="/programs"
                className="inline-flex min-h-[44px] items-center rounded transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B4E655]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#061427]"
              >
                Our Programs
              </Link>
            </li>
            <li aria-hidden="true" className="text-white/60">›</li>
            <li>
              <span aria-current="page" className="text-white">{program.title}</span>
            </li>
          </ol>
        </Container>
      </div>

      {/* Hero: the program's photograph left, content right (owner 2026-10-12:
          people, not court diagrams). On phones the photo sits above the
          title; from md it stays put while the content scrolls. */}
      <Container className="py-10 md:py-14">
        <div className="flex flex-col gap-8 md:flex-row md:gap-12">
          {program.photo && (
            <figure className="w-full shrink-0 md:sticky md:top-24 md:w-[38%] md:self-start">
              <div className="relative aspect-[16/10] w-full overflow-hidden rounded-2xl border border-white/10 bg-[#061427]">
                <Image
                  src={program.photo.src}
                  alt={program.photo.alt}
                  width={program.photo.width}
                  height={program.photo.height}
                  sizes="(min-width: 768px) 38vw, 100vw"
                  priority
                  className="h-full w-full object-cover"
                />
              </div>
            </figure>
          )}

          {/* Content */}
          <div className="flex flex-col justify-center md:flex-1">
            {/* Type, and the Coming Soon chip. Age and level are the chip
                row under the description (audit L8). */}
            <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <span className="font-semibold text-[#B4E655]">{program.type}</span>
              {program.comingSoon && (
                // The neutral Coming Soon chip: 12px, dashed, no warning yellow (audit L3).
                <span className="ml-1 inline-flex min-h-6 items-center rounded-full border border-dashed border-white/25 bg-[#061427] px-2.5 py-1 text-xs font-medium text-white/85">
                  Coming Soon
                </span>
              )}
            </div>

            <Heading as="h1">{program.title}</Heading>
            {summary.length > 0 && (
              <p className="mt-3 text-sm font-medium text-white/85 md:hidden">
                {summary.map((fact) => fact.replace(/ /g, NBSP)).join(" · ")}
              </p>
            )}
            <p className="mt-2 text-base text-white/60">{program.description}</p>

            {/* Who it is for and the levels it is built for, as chips: the
                ages from the groups in neutral white, then one level tag per
                group level (owner, 2026-10-13; audit L8, M37). */}
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className={CHIP_NEUTRAL}>{agesChipLabel(groups)}</span>
              {tags === null && <LevelTag level={null} />}
              {tags?.map((id) => (
                <LevelTag key={id} level={id} />
              ))}
            </div>

            {/* Where it trains, with the map link (owner, 2026-10-12). */}
            {programLocations.map((l) => (
              <LocationLine key={l.id} location={l} mapLink className="mt-4" />
            ))}

            <p className="mt-5 text-sm leading-relaxed text-white/75">
              {program.longDescription}
            </p>

            {/* ── Price, next cohort, quiz ────────────────────────────────── */}
            <div className="mt-6 rounded-2xl border border-[#B4E655]/20 bg-[#B4E655]/5 p-5">
              {scheduleLine && (
                <p className="text-xs text-white/60">{scheduleLine}</p>
              )}
              {priceLine && (
                <p className="mt-3 text-sm text-white">{priceLine}</p>
              )}
              {nextStart && (
                <p className="mt-3 text-sm font-semibold text-[#B4E655]">
                  Next cohort starts {formatStartDate(nextStart)}
                </p>
              )}
              {/* The main button (owner, 2026-11-16; "Join a bootcamp"), to this
                  page's own group list, with the quiz as a side line under
                  it, for this program. A program booked by arrangement has
                  no group to join: its lime button asks about lessons, and
                  leads where it always led, the quiz for the program (it
                  keeps its own words for a quiz-taker too). Then the
                  optional assessment as an outline pill at 44px, not 12px
                  grey text (audit M12), for a scheduled program. A signed-in
                  holder is already on our list: the panel shows them their
                  players' tiers against this span instead (M32). */}
              <ProgramViewerPanel span={range}>
                {groupListHref ? (
                  <>
                    <Button variant="primary" href={groupListHref} className="mt-4 w-full" data-main-cta>
                      {JOIN_CTA_LABEL}
                    </Button>
                    <QuizSideLine source="program-detail" quizHref={quizHref} className="mt-3 text-center" />
                  </>
                ) : (
                  <TrackedButton
                    variant="primary"
                    href={quizHref}
                    track="quiz"
                    source="program-detail"
                    quizAware={false}
                    className="mt-4 w-full"
                    data-main-cta
                  >
                    Ask about lessons
                  </TrackedButton>
                )}
                {!arranged && (
                  <>
                    <TrackedButton
                      variant="secondary"
                      href="/assessment/book"
                      track="assessment"
                      source="program-detail"
                      className="mt-3 w-full"
                    >
                      Book Your Assessment
                    </TrackedButton>
                    {/* Optional, never a step (joining flow, owner 2026-10-12);
                        the $20 mechanic is the price line above. */}
                    <p className="mt-2 text-center text-xs text-white/60">
                      Optional, if you want your level confirmed before you enroll.
                    </p>
                  </>
                )}
              </ProgramViewerPanel>
              {/* A program booked by arrangement offers the inbox to
                  everyone, so it sits outside the panel: a signed-in holder,
                  whose panel replaces the quiz, still has a way to ask for a
                  lesson. */}
              {arranged && (
                <Button variant="secondary" href={`mailto:${CONTACT_EMAIL}`} className="mt-3 w-full">
                  Email {CONTACT_EMAIL}
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* The groups (owner, 2026-10-12; the short card, 2026-11-17): each
            its own card with its one level tag, the ages, the time, the
            club, the price and one button (level-led titles, 2026-10-13).
            The heading is the anchor the main button scrolls to, and the
            High Performance card is the anchor /programs/high-performance
            redirects to. Then what is good to know, said once: week one on
            court, High Performance by approval where that group trains, the
            optional assessment, the policies. A program with no fixed class
            (private lessons) has no group to pick or move between, so
            neither section. */}
        {cards.length > 0 && (
          <>
            <section aria-labelledby={GROUPS_ANCHOR} className="mt-12">
              <h2 id={GROUPS_ANCHOR} className="scroll-mt-24 text-xl font-semibold text-white">{groupsHeading}</h2>
              <p className="mt-2 max-w-2xl text-sm text-white/70">
                Each group is built for an age range and one level. Pick the one that fits, or
                take the 2-minute quiz and our coaches place you.
              </p>
              <ul role="list" className="mt-6 grid gap-3 md:grid-cols-3 md:gap-4">
                {cards.map(({ group: g, block }) => (
                  <li key={g.id} className="flex [&>*]:w-full">
                    <ProgramGroupCard
                      group={g}
                      block={block}
                      // With no public cohort the page carries its own
                      // newsletter form (and the footer hides its line), so
                      // "Notify me" points at that one.
                      notifyHref={hasOpenCohorts ? undefined : "#cohorts"}
                    />
                  </li>
                ))}
              </ul>
            </section>
            <GoodToKnow
              className="mt-12"
              headingSize="sub"
              source="program-good-to-know"
              approvalGroup={scheduledGroups.find((g) => g.joining === "approval")?.name}
            />
          </>
        )}

        {/* What's included */}
        {program.includes && program.includes.length > 0 && (
          <>
            <div className="mt-12 border-t border-white/10" />
            <div className="mt-10">
              <h2 className="text-xl font-semibold text-white">What&apos;s included</h2>
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {program.includes.map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm text-white/80">
                    <svg
                      className="mt-0.5 h-4 w-4 shrink-0 text-[#B4E655]"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2.5}
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}

        {/* Levels in this program (audit M36, design specs §5.7; one level
            per group, owner 2026-10-13): the groups' level tags in words, the
            program's own plain line, and the ladder lit at those tiers, High
            Performance on top. Only when the groups carry tags. */}
        {range && (tags === null || tags.length > 0) && (
          <>
            <div className="mt-12 border-t border-white/10" />
            <section aria-labelledby="levels" className="mt-10 md:grid md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-12">
              <div>
                <h2 id="levels" className="text-xl font-semibold text-white">Levels in this program</h2>
                <p className="mt-2 text-base font-semibold text-white">
                  {tags === null ? "All levels" : tagNames}
                  <span className="sr-only">
                    , on the {TIER_COUNT_WORD}-tier ladder from {TIER_LADDER_SPAN}
                  </span>
                </p>
                {program.levelNote && (
                  <p className="mt-2 text-sm leading-relaxed text-white/70">{program.levelNote}.</p>
                )}
                {!program.comingSoon && (
                  <p className="mt-2 text-sm leading-relaxed text-white/70">
                    {arranged
                      ? "Our coaches place every player on the ladder, from the quiz or on court."
                      : "Every group trains at one level, and your coach confirms yours on court in week one."}
                  </p>
                )}
                <Link href="/assessment#ladder" className={`mt-2 ${TEXT_LINK_LIME}`}>
                  How levels work →
                </Link>
              </div>
              <div className="mt-6 min-w-0 md:mt-0">
                {tags === null ? (
                  <TierLine variant="ladder" orientation="vertical" density="compact" span={range} />
                ) : (
                  <TierLine variant="ladder" orientation="vertical" density="compact" tiers={tags} />
                )}
              </div>
            </section>
          </>
        )}

        {/* With no open block, the program says so and offers its own
            newsletter form (the cards' "Notify me" points here). With open
            blocks the cards above carry every date, time, price and seat,
            so nothing repeats them here (fix round, #85: the list of cohort
            cards that stood here told a by-approval group's seats as open). */}
        {!arranged && !hasOpenCohorts && (
          <>
            <div className="mt-12 border-t border-white/10" />
            <div className="mt-10">
              <div>
                <h2 id="cohorts" className="scroll-mt-24 text-xl font-semibold text-white">
                  Upcoming cohorts
                </h2>
                {/* The groups above are real and open to join; the dated
                    cohorts are not public yet (fall 2026 runs with the
                    coach's private students). The line says only that:
                    "Groups are forming." left it, because the closing one
                    block below reads "Groups are open to join." */}
                <p className="mt-3 max-w-lg text-sm leading-relaxed text-white/60">
                  Cohort dates aren&apos;t public yet.{" "}
                  <ViewerSwap
                    guest={
                      <>
                        <Link href={quizHref} className="text-[#B4E655] hover:underline">
                          Take the 2-minute quiz
                        </Link>{" "}
                        and our coaches place you in a group by level and schedule, or leave
                        your email and we&apos;ll tell you when a cohort opens.
                      </>
                    }
                    member={
                      <>
                        You&apos;re on our list: our coaches place you in a group by level
                        and schedule, and your group, dates and price land on your dashboard.
                      </>
                    }
                  />
                </p>
                <div className="mt-6">
                  <EmailCapture source={`program_${program.slug}_email_capture`} />
                </div>
              </div>
            </div>
          </>
        )}

        {program.related && (
          <p className="mt-10 text-sm leading-relaxed text-white/70">
            {program.related.text}{" "}
            <Link
              href={program.related.href}
              className="font-semibold text-[#B4E655] hover:underline"
            >
              {program.related.label} →
            </Link>
          </p>
        )}

        {/* The page closes on the main action, not a newsletter box (audit
            M13) — for a visitor: the button goes to this page's group list
            where it has one, and the side line to this program's quiz. A
            signed-in holder is on our list already (audit M32); their next
            step sits in the panel. */}
        <ViewerSwap
          guest={
            <JoinClosing className="mt-12" source="program-closing" quizHref={quizHref} href={groupListHref} />
          }
          member={null}
        />

        <div className="mt-6">
          <Link
            href="/programs"
            className="inline-flex min-h-[44px] items-center rounded text-sm text-white/60 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B4E655]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#061427]"
          >
            ← Back to all programs
          </Link>
        </div>
      </Container>
    </main>
  );
}
