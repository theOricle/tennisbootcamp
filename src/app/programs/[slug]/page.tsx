import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import Image from "next/image";
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
} from "@/lib/cohorts";
import { getPublicCohorts } from "@/lib/cohortsDb";
import { getSeatsRemaining } from "@/lib/seatCount";
import { VENUE_LINE } from "@/lib/membership";
import { TierRangeBadges } from "@/components/tiers";
import { JsonLd } from "@/components/JsonLd";
import { courseJsonLd } from "@/lib/structuredData";

function fmtStartDate(iso: string): string {
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const [, m, d] = iso.split("-");
  return `${months[parseInt(m, 10) - 1]} ${parseInt(d, 10)}`;
}

/**
 * The phone summary under the H1 (audit M13): who, which day, what it costs,
 * so the decision facts sit above the fold. Weekend classes only; a
 * coming-soon program's card line already states its price. Each fact is
 * joined with no-break spaces, so a line wraps only between facts. The tier
 * span joins this row when programs carry one (audit build items F and G).
 */
const NBSP = "\u00A0";

function summaryFacts(program: Program): string[] {
  const days = [...new Set((program.timetable ?? []).map((slot) => `${slot.day}s`))];
  if (program.comingSoon || days.length === 0) return [];
  return [program.ageGroup ?? "", days.join(" and "), `${SESSION_PRICE_LABEL} a session`].filter(Boolean);
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

      {/* Hero: image left + content right */}
      <Container className="py-10 md:py-14">
        <div className="flex flex-col gap-8 md:flex-row md:gap-12">

          {/* Image */}
          <div className="w-full md:w-[38%] shrink-0">
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl">
              {program.imageSrc ? (
                <Image
                  src={program.imageSrc}
                  alt={program.title}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, 38vw"
                  priority
                />
              ) : (
                <div className="h-full w-full bg-white/10" />
              )}
            </div>
          </div>

          {/* Content */}
          <div className="flex flex-col justify-center md:flex-1">
            {/* Type + age badges */}
            <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <span className="font-semibold text-[#B4E655]">{program.type}</span>
              {program.ageGroup && (
                // On phones the age moves into the summary row under the H1.
                <span className={`text-white/70 ${summary.length > 0 ? "max-md:hidden" : ""}`}>· {program.ageGroup}</span>
              )}
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
                          className="flex flex-wrap justify-between gap-x-4 text-sm text-white/85"
                        >
                          <span>
                            {slot.day} {slot.time}
                          </span>
                          <span className="text-white/60">{slot.group}</span>
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
                    Next cohort starts {fmtStartDate(nextOpenCohort.startDate)}
                  </p>
                )}
                {/* Primary, then the optional assessment as an outline pill
                    at 44px, not 12px grey text (audit M12). */}
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
                  return (
                    <div
                      key={cohort.id}
                      className="rounded-xl border border-white/10 bg-white/5 px-5 py-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
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

                    </div>
                  );
                })}
              </div>
              <p className="mt-6 text-sm text-white/60">
                Sina places each player by level and schedule.{" "}
                <Link href={quizHref} className="text-[#B4E655] hover:underline">
                  Take the 2-minute quiz
                </Link>{" "}
                to start.
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
                <Link href={quizHref} className="text-[#B4E655] hover:underline">
                  Take the 2-minute quiz
                </Link>{" "}
                and Sina places you in a class by level and schedule, or leave
                your email and we&apos;ll tell you when a cohort opens.
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

        {/* The page closes on the primary CTA, not a newsletter box (audit M13). */}
        <div className="mt-12">
          <QuizBand href={quizHref} source="program-closing" />
        </div>

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
