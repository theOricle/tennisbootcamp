import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { programs } from "@/content/programs";
import { locations } from "@/content/locations";
import { ProgramInterestForm } from "@/components/sections/ProgramInterestForm";

type PageProps = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return programs.map((p) => ({ slug: p.slug }));
}

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

            {/* Location */}
            {location && (
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

        {/* Divider */}
        <div className="mt-12 border-t border-white/10" />

        {/* CTA section */}
        <div className="mt-10">
          {!program.comingSoon ? (
            /* Available: schedule details + enroll CTA */
            <div>
              {program.schedule && (
                <div className="mb-8 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-white/10 bg-white/5 px-5 py-4">
                    <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-white/40">
                      <svg
                        className="h-3.5 w-3.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        viewBox="0 0 24 24"
                      >
                        <rect x="3" y="4" width="18" height="18" rx="2" />
                        <path d="M16 2v4M8 2v4M3 10h18" />
                      </svg>
                      Schedule
                    </div>
                    <p className="text-sm text-[#B4E655]">{program.schedule}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 px-5 py-4">
                    <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-white/40">
                      <svg
                        className="h-3.5 w-3.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        viewBox="0 0 24 24"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 6v6l4 2" />
                      </svg>
                      Duration
                    </div>
                    <p className="text-sm text-[#B4E655]">Six-week cohort</p>
                  </div>
                </div>
              )}
              <Link
                href={program.ctaHref}
                className="inline-block rounded-xl bg-[#B4E655] px-8 py-4 text-base font-semibold text-[#061427] hover:brightness-110 transition"
              >
                {program.ctaText}
              </Link>
            </div>
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
