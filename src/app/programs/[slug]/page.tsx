import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { CONTACT_EMAIL, SESSION_PRICE_LABEL, groupsForProgram, programs } from "@/content/programs";
import type { Program } from "@/types/program";
import { EmailCapture } from "@/components/sections/EmailCapture";
import { HowJoiningWorks } from "@/components/sections/HowJoiningWorks";
import { QuizBand } from "@/components/sections/QuizBand";
import { ProgramGroupCard } from "@/components/sections/ProgramGroupCard";
import { CHIP_NEUTRAL } from "@/components/sections/ProgramCard";
import { Container } from "@/components/layout/Container";
import { Heading } from "@/components/ui/Heading";
import { Button } from "@/components/ui/Button";
import { TrackedButton } from "@/components/ui/TrackedButton";
import {
  formatDateRange,
  formatDaysTimes,
  formatCohortPrice,
  formatStartDate,
} from "@/lib/cohorts";
import { getPublicCohorts } from "@/lib/cohortsDb";
import { getSeatsRemaining } from "@/lib/seatCount";
import { locationLine } from "@/content/locations";
import { locationsForProgram } from "@/lib/locationCatalog";
import { LocationLine } from "@/components/locations/LocationLine";
import { agesChipLabel, nextCohortForGroup, programLevelRange } from "@/lib/programCatalog";
import { TIER_LADDER_SPAN, formatLevelBand, formatTierSpan } from "@/lib/tiers";
import { artFocusForCohort } from "@/lib/plates/variant";
import { TierLine, TierRangeBadges } from "@/components/tiers";
import { PlateMark } from "@/components/plates/PlateMark";
import { TEXT_LINK_LIME } from "@/components/ui/TextLink";
import { JsonLd } from "@/components/JsonLd";
import { courseJsonLd } from "@/lib/structuredData";
import { ProgramViewerPanel, ViewerSwap } from "@/components/programs/ProgramViewer";

/**
 * The phone summary under the H1 (audit M13): which day and what it costs,
 * so the decision facts sit above the fold; who it is for, and the tier
 * span, are the chip row under the description (L8). Weekend classes only;
 * a program with no fixed class states its terms in the panel. Each fact is
 * joined with no-break spaces, so a line wraps only between facts.
 */
const NBSP = " ";

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
  // Retired programs keep their id for old rows but have no public page
  // (next.config.ts redirects the known ones before the page is reached).
  if (program.unlisted) permanentRedirect("/programs");

  // Supabase only (backlog #1): public, inviting/confirmed, not yet started.
  // Draft, cancelled and past cohorts never reach this page.
  const publicCohorts = await getPublicCohorts();
  const openCohorts = publicCohorts.filter((c) => c.programId === program.id);

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
  // Null for a program with no stated session price: no Course markup.
  const courseLd = courseJsonLd(program);
  const summary = summaryFacts(program);
  // The tier span the program is built for: the union of its groups.
  const range = programLevelRange(program);
  const groups = groupsForProgram(program.slug);
  // A program with fixed classes lists them as group cards (owner,
  // 2026-10-12); one with no fixed class (private lessons) states its terms
  // in the panel instead, so the page never shows the same card twice.
  const scheduledGroups = groups.filter((g) => g.day !== null);
  // Where the program's groups train (owner, 2026-10-12): one club today.
  const programLocations = locationsForProgram(program.slug);
  const arranged = scheduledGroups.length === 0 && !program.comingSoon;
  const groupsHeading =
    scheduledGroups.length > 0
      ? `${scheduledGroups.length === 3 ? "Three" : String(scheduledGroups.length)} groups on ${scheduledGroups[0].day}s`
      : "Groups";

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

            {/* Who it is for and the tiers it is built for, as chips: the
                ages from the groups in neutral white, the span with its tier
                marks (audit L8, M37). */}
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className={CHIP_NEUTRAL}>{agesChipLabel(groups)}</span>
              {range && <TierRangeBadges levelMin={range.min} levelMax={range.max} />}
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
              {program.schedule && (
                <p className="text-xs text-white/60">{program.schedule}</p>
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
                  at 44px, not 12px grey text (audit M12), for a scheduled
                  program. A signed-in holder is already on our list: the
                  panel shows them their players' tiers against this span
                  instead of a second quiz (M32). */}
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

        {/* How joining works, then the groups (owner, 2026-10-12): each
            its own card with the age range, the level band on the rail, the
            time, the price, how to join with the week-one promise, and the
            quiz. The High Performance card is the anchor
            /programs/high-performance redirects to. A program with no fixed
            class (private lessons) has no group to pick or move between, so
            neither section. */}
        {scheduledGroups.length > 0 && (
          <>
            <HowJoiningWorks
              className="mt-12"
              quizHref={quizHref}
              source="program-joining"
              showApproval={scheduledGroups.some((g) => g.joining === "approval")}
            />
            <section aria-labelledby="groups" className="mt-12">
              <h2 id="groups" className="text-xl font-semibold text-white">{groupsHeading}</h2>
              <p className="mt-2 max-w-2xl text-sm text-white/70">
                Each group is built for an age range and a level band, and the band is where you
                train. Pick the one that fits, or take the 2-minute quiz and our coaches place you.
              </p>
              <ul role="list" className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {scheduledGroups.map((g) => (
                  <li key={g.id} className="flex [&>*]:w-full">
                    <ProgramGroupCard
                      group={g}
                      program={program}
                      nextCohort={nextCohortForGroup(publicCohorts, g)}
                      source="program-group"
                    />
                  </li>
                ))}
              </ul>
            </section>
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

        {/* Levels in this program (audit M36, design specs §5.7): the span in
            words, the program's own plain line, and the ladder lit inside the
            span, World Class on top. Only when the span is set. */}
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
                    , levels {range.min.toFixed(1)} to {range.max.toFixed(1)} on the seven-tier ladder from {TIER_LADDER_SPAN}
                  </span>
                </p>
                {program.levelNote && (
                  <p className="mt-2 text-sm leading-relaxed text-white/70">{program.levelNote}.</p>
                )}
                {!program.comingSoon && (
                  <p className="mt-2 text-sm leading-relaxed text-white/70">
                    {arranged
                      ? "Our coaches place every player on the ladder, from the quiz or on court."
                      : "Our coaches place every player on the ladder from the quiz, and confirm the level on court in week one."}
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

        {/* Cohort cards, or the empty state, for programs that run cohorts. */}
        {!arranged && (
          <>
            <div className="mt-12 border-t border-white/10" />
            <div className="mt-10">
              {hasOpenCohorts ? (
                /* Available: cohort cards from Supabase */
                <div>
                  <h2 id="cohorts" className="mb-2 text-xl font-semibold text-white">Upcoming cohorts</h2>
                  {programLocations.length > 0 && (
                    <p className="mb-6 text-sm text-white/60">
                      At {programLocations.map(locationLine).join(" and ")}.
                    </p>
                  )}

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
                    Our coaches place each player by level and schedule.{" "}
                    <ViewerSwap
                      guest={
                        <>
                          <Link href={quizHref} className="text-[#B4E655] hover:underline">
                            Take the 2-minute quiz
                          </Link>{" "}
                          to start.
                        </>
                      }
                      member={<>You&apos;re on our list already.</>}
                    />
                  </p>
                </div>
              ) : (
                /* Zero renderable cohorts: empty state, no card, no enroll link */
                <div>
                  <h2 id="cohorts" className="text-xl font-semibold text-white">
                    Upcoming cohorts
                  </h2>
                  {/* The groups above are real; the dated cohorts are not public
                      yet (fall 2026 runs with the coach's private students). Status
                      wording follows owner default D11, "Groups forming". */}
                  <p className="mt-3 max-w-lg text-sm leading-relaxed text-white/60">
                    Groups are forming. Cohort dates aren&apos;t public yet.{" "}
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
              )}
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

        {/* The page closes on the primary CTA, not a newsletter box (audit
            M13) — for a visitor. A signed-in holder already took the quiz
            (audit M32); their next step sits in the panel. */}
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
