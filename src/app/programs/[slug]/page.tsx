import { notFound } from "next/navigation";
import type { Metadata } from "next";
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
      {/* Hero strip */}
      <div className="tb-gradient px-6 py-14 md:py-20">
        <div className="mx-auto max-w-3xl">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-white/60">
            <span>{program.type}</span>
            {program.ageGroup && (
              <>
                <span>·</span>
                <span>{program.ageGroup}</span>
              </>
            )}
            {program.comingSoon && (
              <span className="rounded-full border border-yellow-400/30 bg-yellow-400/10 px-2 py-0.5 text-[10px] text-yellow-200">
                Coming Soon
              </span>
            )}
          </div>
          <h1 className="text-4xl font-semibold text-white md:text-5xl">{program.title}</h1>
          <p className="mt-3 text-lg text-white/70">{program.description}</p>
        </div>
      </div>

      {/* Body */}
      <div className="mx-auto max-w-3xl px-6 py-12">
        <p className="text-base leading-relaxed text-white/80">{program.longDescription}</p>

        {(program.schedule || location) && (
          <dl className="mt-8 grid gap-4 sm:grid-cols-2">
            {program.schedule && (
              <div className="rounded-xl border border-white/10 bg-white/5 px-5 py-4">
                <dt className="text-xs font-semibold uppercase tracking-wide text-white/50">Schedule</dt>
                <dd className="mt-1 text-sm text-white/80">{program.schedule}</dd>
              </div>
            )}
            {location && (
              <div className="rounded-xl border border-white/10 bg-white/5 px-5 py-4">
                <dt className="text-xs font-semibold uppercase tracking-wide text-white/50">Location</dt>
                <dd className="mt-1 text-sm text-white/80">{location.name}</dd>
                <dd className="mt-0.5 text-xs text-white/50">{location.address}</dd>
              </div>
            )}
          </dl>
        )}

        {/* CTA */}
        <div className="mt-12">
          {!program.comingSoon ? (
            <div>
              <Link
                href={program.ctaHref}
                className="inline-block rounded-xl bg-[#B4E655] px-8 py-4 text-base font-semibold text-[#061427] hover:brightness-110"
              >
                {program.ctaText}
              </Link>
            </div>
          ) : (
            <div>
              <h2 className="mb-1 text-xl font-semibold text-white">
                Get notified when {program.title} opens
              </h2>
              <p className="mb-5 text-sm text-white/60">
                We&apos;ll email you as soon as registration goes live. No spam.
              </p>
              <ProgramInterestForm programSlug={program.slug} programTitle={program.title} />
            </div>
          )}
        </div>

        <div className="mt-10">
          <Link href="/programs" className="text-sm text-white/50 hover:text-white">
            ← All programs
          </Link>
        </div>
      </div>
    </main>
  );
}
