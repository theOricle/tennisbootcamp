import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { programs } from "@/content/programs";
import { locations } from "@/content/locations";
import { ProgramInterestForm } from "@/components/sections/ProgramInterestForm";
import {
  cohortsForProgram,
  formatDateRange,
  formatDaysTimes,
  formatCohortPrice,
} from "@/lib/cohorts";
import { getSeatsRemaining } from "@/lib/seatCount";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const program = programs.find((p) => p.slug === slug);
  if (!program) return {};
  return {
    title: `${program.title} — Tennis Bootcamp`,
    description: program.longDescription.slice(0, 160),
  };
}

export default async function ProgramDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const program = programs.find((p) => p.slug === slug);
  if (!program) notFound();

  const location = program.locationId
    ? locations.find((l) => l.id === program.locationId)
    : undefined;

  const cohorts = cohortsForProgram(program.id);
  const openCohorts = cohorts.filter(
    (c) => c.status === "open" || c.status === "upcoming"
  );

  // Fetch live seat counts for all cohorts in parallel (null = credentials not set)
  const seatCountEntries = await Promise.all(
    openCohorts.map(async (c) => [c.id, await getSeatsRemaining(c.id, c.capacityMax)] as const)
  );
  const seatCounts: Record<string, number | null> = Object.fromEntries(seatCountEntries);

  // Group cohorts by locationId so we can render one section per venue
  const cohortsByLocation = openCohorts.reduce<Record<string, typeof openCohorts>>(
    (acc, c) => {
      (acc[c.locationId] ??= []).push(c);
      return acc;
    },
    {}
  );

  const hasOpenCohorts = openCohorts.length > 0;

  return (
    <main className="min-h-screen bg-[#061427] text-white">

      {/* Breadcrumb */}
      <div className="border-b border-white/10 px-6 py-4">
        <div className="mx-auto max-w-5xl">
          <nav className="flex items-center gap-2 text-sm text-white/50">
            <Link href="/programs" className="hover:text-white transition-colors">
              Our Programs
            </Link>
            <span>›</span>
            <span className="text-white">{program.title}</span>
          </nav>
        </div>
      </div>

      {/* Hero: image left + content right */}
      <div className="mx-auto max-w-5xl px-6 py-10 md:py-14">
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
                <span className="text-white/50">· {program.ageGroup}</span>
              )}
              {program.comingSoon && (
                <span className="ml-1 rounded-full border border-yellow-400/30 bg-yellow-400/10 px-2 py-0.5 text-[10px] font-medium text-yellow-200">
                  Coming Soon
                </span>
              )}
            </div>

            <h1 className="text-3xl font-bold text-white md:text-4xl">{program.title}</h1>
            <p className="mt-2 text-base text-white/60">{program.description}</p>

            <p className="mt-5 text-sm leading-relaxed text-white/75">
              {program.longDescription}
            </p>

            {/* Location (fallback for programs without cohorts at multiple venues) */}
            {location && cohorts.length === 0 && (
              <div className="mt-6">
                <h3 className="text-base font-semibold text-[#B4E655]">{location.name}</h3>
                <div className="mt-1 flex items-start gap-2 text-sm text-white/55">
                  <svg
                    className="mt-0.5 h-4 w-4 shrink-0 text-[#B4E655]"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.8}
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"
                    />
                  </svg>
                  <span>{location.address}</span>
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
            /* Available: cohort cards grouped by location */
            <div>
              <h2 className="mb-6 text-xl font-semibold text-white">Upcoming cohorts</h2>
              {Object.entries(cohortsByLocation).map(([locationId, locationCohorts]) => {
                const loc = locations.find((l) => l.id === locationId);
                return (
                  <div key={locationId} className="mb-8">
                    {/* Location header */}
                    <div className="mb-3 flex items-center gap-2">
                      <svg
                        className="h-4 w-4 shrink-0 text-[#B4E655]"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.8}
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"
                        />
                      </svg>
                      <span className="text-sm font-semibold text-[#B4E655]">
                        {loc ? loc.name : locationId}
                      </span>
                      {loc && (
                        <span className="text-sm text-white/40">{loc.address}</span>
                      )}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      {locationCohorts.map((cohort) => {
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
                                <p className="mt-1 text-sm text-[#B4E655]">
                                  {formatDateRange(cohort)}
                                </p>
                                <p className="mt-0.5 text-sm text-white/60">
                                  {formatDaysTimes(cohort)}
                                </p>
                                <p className="mt-0.5 text-sm text-white/50">
                                  {cohort.weeks} weeks · {cohort.capacityMin}–{cohort.capacityMax} players
                                </p>
                              </div>
                              <div className="shrink-0 text-right">
                                <p className="text-sm font-semibold text-white">
                                  {formatCohortPrice(cohort)}
                                </p>
                                <span
                                  className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                    isFull
                                      ? "bg-white/10 text-white/40"
                                      : cohort.status === "open"
                                      ? "bg-[#B4E655]/15 text-[#B4E655]"
                                      : cohort.status === "waitlist"
                                      ? "bg-yellow-400/10 text-yellow-200"
                                      : "bg-white/10 text-white/50"
                                  }`}
                                >
                                  {isFull
                                    ? "Full"
                                    : isLowStock
                                    ? `${seats} spot${seats === 1 ? "" : "s"} left`
                                    : cohort.status === "open"
                                    ? "Spots open"
                                    : cohort.status === "waitlist"
                                    ? "Waitlist"
                                    : cohort.status === "upcoming"
                                    ? "Coming soon"
                                    : "Full"}
                                </span>
                              </div>
                            </div>

                            <div className="mt-4">
                              {!isFull && cohort.status !== "upcoming" ? (
                                <Link
                                  href={`/enroll/${cohort.id}`}
                                  className="block w-full rounded-lg bg-[#B4E655] py-2 text-center text-sm font-semibold text-[#061427] hover:brightness-110 transition"
                                >
                                  Enroll →
                                </Link>
                              ) : (
                                <div className="block w-full rounded-lg bg-white/5 py-2 text-center text-sm font-semibold text-white/30">
                                  {isFull ? "Cohort full" : "Registration opening soon"}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : !program.comingSoon ? (
            /* Available but no open cohorts yet — fall back to intake CTA */
            <Link
              href={program.ctaHref}
              className="inline-block rounded-xl bg-[#B4E655] px-8 py-4 text-base font-semibold text-[#061427] hover:brightness-110 transition"
            >
              {program.ctaText}
            </Link>
          ) : (
            /* Coming soon: registration alert + email capture */
            <div className="rounded-2xl border border-[#B4E655]/20 bg-[#B4E655]/5 px-6 py-6 md:px-8 md:py-7">
              <div className="flex items-start gap-3">
                <svg
                  className="mt-0.5 h-5 w-5 shrink-0 text-[#B4E655]"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
                  />
                </svg>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-white">Registrations coming soon</p>
                  <p className="mt-0.5 text-sm text-white/60">
                    Enter your email to be updated when {program.title} is available.
                  </p>
                  <div className="mt-4">
                    <ProgramInterestForm
                      programSlug={program.slug}
                      programTitle={program.title}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="mt-10">
          <Link href="/programs" className="text-sm text-white/40 hover:text-white transition-colors">
            ← Back to all programs
          </Link>
        </div>
      </div>
    </main>
  );
}
