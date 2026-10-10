import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { SESSION_PRICE_LABEL, programs } from "@/content/programs";
import type { Program } from "@/types/program";
import { ProgramInterestForm } from "@/components/sections/ProgramInterestForm";
import { EmailCapture } from "@/components/sections/EmailCapture";
import { QuizBand } from "@/components/sections/QuizBand";
import { Container } from "@/components/layout/Container";
import { Heading } from "@/components/ui/Heading";
import { TrackedButton } from "@/components/ui/TrackedButton";
import {
  formatDateRange,
  formatDaysTimes,
  formatCohortPrice,
  formatStartDate,
} from "@/lib/cohorts";
import { getPublicCohorts } from "@/lib/cohortsDb";
import { getSeatsRemaining } from "@/lib/seatCount";
import { VENUE_LINE } from "@/lib/membership";
import { programLevelRange } from "@/lib/programCatalog";
import { formatLevelBand, formatTierSpan } from "@/lib/tiers";
import { artFocusForCohort } from "@/lib/plates/variant";
import { TierLine, TierRangeBadges } from "@/components/tiers";
import { AgeBandChips } from "@/components/programs/AgeBandChips";
import { PlateMark } from "@/components/plates/PlateMark";
import { TEXT_LINK_LIME } from "@/components/ui/TextLink";
import { JsonLd } from "@/components/JsonLd";
import { courseJsonLd } from "@/lib/structuredData";
import { ProgramPlate } from "@/components/plates/ProgramPlate";
import { ProgramViewerPanel, ViewerSwap } from "@/components/programs/ProgramViewer";

/**
 * The phone summary under the H1 (audit M13): which day and what it costs,
 * so the decision facts sit above the fold; who it is for, and the tier
 * span, are the chip row under the description (L8). Weekend classes only;
 * a coming-soon program's card line already states its price. Each fact is
 * joined with no-break spaces, so a line wraps only between facts.
 */
const NBSP = "\u00A0";

function summaryFacts(program: Program): string[] {
  const days = [...new Set((program.timetable ?? []).map((slot) => `${slot.day}s`))];
  if (program.comingSoon || days.length === 0) return [];
  return [days.join(" and "), `${SESSION_PRICE_LABEL} a session`];
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
  // Retired programs keep their id for old rows but have no public page.
  if (program.unlisted) permanentRedirect("/programs");

  // Supabase only (backlog #1): public, inviting/confirmed, not yet started.
  // Draft, cancelled and past cohorts never reach this page.
  const openCohorts = (await getPublicCohorts()).filter(
    (c) => c.programId === program.id
  );

  // Fetch live seat counts for all cohorts in parallel (null = credentials not set)
  const seatCountEntries = await Promise.all(
    openCohorts.map(async (c) => [c.id, await getSeatsRemaining(c.id, c.capacityMax)] as const)
  );
  const seatCounts: Record<string, number | null> = Object.fromEntries(seatCountEntries);

  const hasOpenCohorts = openCohorts.length > 0;
  // Earliest public cohort (public cohorts are all inviting/confirmed → "open")
  const nextOpenCohort = openCohorts.find((c) => c.status === "open") ?? null;
  // No public Enroll button yet (backlog #20): a public enroll flow would ask
  // for an e-transfer before the written agreement is delivered (backlog #2b).
  const quizHref = `/intake?program=${program.slug}`;
  // Null for coming-soon programs: no stated price, so no Course markup.
  const courseLd = courseJsonLd(program);
  const summary = summaryFacts(program);
  // The tier span the program is built for (owner D2); unset renders nothing.
  const range = programLevelRange(program);

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

      {/* Hero: Court Plate left + content right (audit H1, design specs §4.8).
          On phones the plate sits above the title; from md it stays put while
          the content scrolls. */}
      <Container className="py-10 md:py-14">
        <div className="flex flex-col gap-8 md:flex-row md:gap-12">

          {/* Plate: the program's own court diagram, drawn in code. Text-free;
              the figcaption and plateAlt carry the meaning. Draws once on
              load, motion-safe only. */}
          <figure className="w-full shrink-0 md:sticky md:top-24 md:w-[38%] md:self-start">
            <div className="relative aspect-[16/10] w-full overflow-hidden rounded-2xl border border-white/10 bg-[#061427]">
              <ProgramPlate
                plate={program.plate}
                frame="master"
                density="hero"
                comingSoon={program.comingSoon}
                label={program.plateAlt}
                animate
              />
            </div>
            {program.plateCaption && (
              <figcaption className="mt-2 text-xs text-white/60">{program.plateCaption}</figcaption>
            )}
          </figure>

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

            {/* Who it is for and the tiers it is built for, as chips: age in
                neutral white, the span with its tier marks (audit L8, M37). */}
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <AgeBandChips bands={program.ageBands} />
              {range && <TierRangeBadges levelMin={range.min} levelMax={range.max} />}
            </div>

            <p className="mt-5 text-sm leading-relaxed text-white/75">
              {program.longDescription}
            </p>

            {/* ── Timetable, price, quiz ─────────────────────────────────── */}
            {!program.comingSoon ? (
              <div className="mt-6 rounded-2xl border border-[#B4E655]/20 bg-[#B4E655]/5 p-5">
                {program.timetable && program.timetable.length > 0 && (
                  <>
                    <h2 className="text-sm font-semibold text-[#B4E655]">Weekend timetable</h2>
                    <ul className="mt-2 space-y-1.5">
                      {program.timetable.map((slot) => (
                        <li
                          key={`${slot.day}-${slot.time}`}
                          className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm text-white/85"
                        >
                          <span>
                            {slot.day} {slot.time}
                          </span>
                          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="text-white/60">{slot.group}</span>
                            {/* The class's tier band (owner D3): the Adult climb reads
                                Love – Rally, Deuce, Break – Ace. Unbanded slots show nothing. */}
                            <TierRangeBadges levelMin={slot.levelMin} levelMax={slot.levelMax} />
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {program.schedule && (
                  <p className="mt-3 text-xs text-white/60">{program.schedule}</p>
                )}
                {program.priceLine && (
                  <p className="mt-3 text-sm text-white">{program.priceLine}</p>
                )}
                {nextOpenCohort && (
                  <p className="mt-3 text-sm font-semibold text-[#B4E655]">
                    Next cohort starts {formatStartDate(nextOpenCohort.startDate)}
                  </p>
                )}
                {/* Primary, then the optional assessment as an outline pill
                    at 44px, not 12px grey text (audit M12). A signed-in
                    holder is already on Sina's list: they see their
                    players' tiers against this span instead of a second
                    quiz (audit M32). */}
                <ProgramViewerPanel span={range}>
                  <TrackedButton
                    variant="primary"
                    href={quizHref}
                    track="quiz"
                    source="program-detail"
                    className="mt-4 w-full"
                    data-quiz-cta
                  >
                    Take the 2-minute quiz
                  </TrackedButton>
                  <TrackedButton
                    variant="secondary"
                    href="/assessment/book"
                    track="assessment"
                    source="program-detail"
                    className="mt-3 w-full"
                  >
                    Book Your Assessment
                  </TrackedButton>
                </ProgramViewerPanel>
              </div>
            ) : (
              // The one notify form on the page (audit H8), anchored at #notify.
              <div id="notify" className="mt-6 scroll-mt-24 rounded-2xl border border-[#B4E655]/20 bg-[#B4E655]/5 p-5">
                <p className="text-sm font-semibold text-white">Not open for enrollment yet</p>
                <p className="mt-1 text-sm text-white/70">
                  Leave your email and we&apos;ll tell you when enrollment opens.
                </p>
                <div className="mt-3">
                  <ProgramInterestForm programSlug={program.slug} programTitle={program.title} />
                </div>
              </div>
            )}
          </div>
        </div>

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

        {/* Levels in this program (audit M36, design specs §5.7): the span in
            words, the program's own plain line, and the ladder lit inside the
            span, Grand Slam on top. Only when the span is set (owner D2). */}
        {range && (
          <>
            <div className="mt-12 border-t border-white/10" />
            <section aria-labelledby="levels" className="mt-10 md:grid md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-12">
              <div>
                <h2 id="levels" className="text-xl font-semibold text-white">Levels in this program</h2>
                <p className="mt-2 text-base font-semibold text-white">
                  {formatTierSpan(range.min, range.max)}
                  <span aria-hidden="true" className="ml-2 text-sm font-normal tabular-nums text-white/60">
                    {formatLevelBand(range.min, range.max)}
                  </span>
                  <span className="sr-only">
                    , levels {range.min.toFixed(1)} to {range.max.toFixed(1)} on the seven-tier ladder from Love to Grand Slam
                  </span>
                </p>
                {program.levelNote && (
                  <p className="mt-2 text-sm leading-relaxed text-white/70">{program.levelNote}.</p>
                )}
                {/* A coming-soon program has no decided intake path yet (owner D10): only confirmed facts. */}
                {!program.comingSoon && (
                  <p className="mt-2 text-sm leading-relaxed text-white/70">
                    Sina places every player on the ladder, from the quiz or on court.
                  </p>
                )}
                <Link href="/assessment#ladder" className={`mt-2 ${TEXT_LINK_LIME}`}>
                  How tiers work →
                </Link>
              </div>
              <div className="mt-6 min-w-0 md:mt-0">
                <TierLine variant="ladder" orientation="vertical" density="compact" span={range} />
              </div>
            </section>
          </>
        )}

        {/* Divider */}
        <div className="mt-12 border-t border-white/10" />

        {/* Cohort cards or coming-soon */}
        <div className="mt-10">
          {!program.comingSoon && hasOpenCohorts ? (
            /* Available: cohort cards from Supabase */
            <div>
              <h2 id="cohorts" className="mb-2 text-xl font-semibold text-white">Upcoming cohorts</h2>
              <p className="mb-6 text-sm text-white/60">{VENUE_LINE}</p>

              <div className="grid gap-3 sm:grid-cols-2">
                {openCohorts.map((cohort) => {
                  const seats = seatCounts[cohort.id] ?? null;
                  const isFull = seats !== null && seats <= 0;
                  const isLowStock = seats !== null && seats > 0 && seats <= 3;
                  const tierGated = cohort.levelMin != null || cohort.levelMax != null;
                  return (
                    <div
                      key={cohort.id}
                      className="rounded-xl border border-white/10 bg-white/5 px-5 py-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        {/* The program's mark (the Adult class the cohort trains
                            in lit), the label, the tier chip and the dates (L8). */}
                        <div className="flex min-w-0 items-start gap-3">
                          <PlateMark plate={program.plate} size={48} focusSlot={artFocusForCohort(program, cohort)} />
                          <div className="min-w-0">
                            <p className="font-semibold text-white">{cohort.label}</p>
                            <TierRangeBadges
                              levelMin={cohort.levelMin}
                              levelMax={cohort.levelMax}
                              className="mt-1"
                            />
                            <p className="mt-1 text-sm text-[#B4E655]">
                              {formatDateRange(cohort)}
                            </p>
                            <p className="mt-0.5 text-sm text-white/60">
                              {formatDaysTimes(cohort)}
                            </p>
                            <p className="mt-0.5 text-sm text-white/60">
                              {cohort.weeks} weeks · {cohort.capacityMin}–{cohort.capacityMax} players
                            </p>
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-semibold text-white">
                            {formatCohortPrice(cohort)}
                          </p>
                          <span
                            className={`mt-1 inline-block rounded-full px-2.5 py-1 text-xs font-medium ${
                              isFull
                                ? "border border-white/15 bg-white/5 text-white/85"
                                : "bg-[#B4E655]/10 text-[#B4E655]"
                            }`}
                          >
                            {isFull
                              ? "Full"
                              : isLowStock
                              ? `${seats} spot${seats === 1 ? "" : "s"} left`
                              : "Spots open"}
                          </span>
                        </div>
                      </div>
                      {/* The cohort's band on the rail, so the chip above reads as a place on the ladder. */}
                      {tierGated && (
                        <TierLine
                          variant="rail"
                          size="sm"
                          span={{ min: cohort.levelMin, max: cohort.levelMax }}
                          labels="none"
                          className="mt-3"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="mt-6 text-sm text-white/60">
                Sina places each player by level and schedule.{" "}
                <ViewerSwap
                  guest={
                    <>
                      <Link href={quizHref} className="text-[#B4E655] hover:underline">
                        Take the 2-minute quiz
                      </Link>{" "}
                      to start.
                    </>
                  }
                  member={<>You&apos;re on his list already.</>}
                />
              </p>
            </div>
          ) : !program.comingSoon ? (
            /* Zero renderable cohorts: empty state, no card, no enroll link */
            <div>
              <h2 id="cohorts" className="text-xl font-semibold text-white">
                Upcoming cohorts
              </h2>
              {/* The timetable above is real; the dated cohorts are not public
                  yet (fall 2026 runs with Sina's private students). Status
                  wording follows owner default D11, "Groups forming". */}
              <p className="mt-3 max-w-lg text-sm leading-relaxed text-white/60">
                Groups are forming. Cohort dates aren&apos;t public yet.{" "}
                <ViewerSwap
                  guest={
                    <>
                      <Link href={quizHref} className="text-[#B4E655] hover:underline">
                        Take the 2-minute quiz
                      </Link>{" "}
                      and Sina places you in a class by level and schedule, or leave
                      your email and we&apos;ll tell you when a cohort opens.
                    </>
                  }
                  member={
                    <>
                      You&apos;re on Sina&apos;s list: he places you in a class by level and
                      schedule, and your group, dates and price land on your dashboard.
                    </>
                  }
                />
              </p>
              <div className="mt-6">
                <EmailCapture source={`program_${program.slug}_email_capture`} />
              </div>
            </div>
          ) : null}
          {/* A coming-soon program has one notify form, at the top (#notify):
              the second, triangle-marked copy is gone (audit H8). */}

          {program.related && (
            <p className="mt-6 text-sm leading-relaxed text-white/70 first:mt-0">
              {program.related.text}{" "}
              <Link
                href={program.related.href}
                className="font-semibold text-[#B4E655] hover:underline"
              >
                {program.related.label} →
              </Link>
            </p>
          )}
        </div>

        {/* The page closes on the primary CTA, not a newsletter box (audit
            M13) — for a visitor. A signed-in holder already took the quiz
            (audit M32); their next step sits in the timetable card. */}
        <ViewerSwap
          guest={
            <div className="mt-12">
              <QuizBand href={quizHref} source="program-closing" />
            </div>
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
