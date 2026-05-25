import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { cohorts } from "@/content/cohorts";
import { programs } from "@/content/programs";
import { locations } from "@/content/locations";
import { getSeatsRemaining } from "@/lib/seatCount";
import { EnrollWizard } from "./EnrollWizard";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ cohortId: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { cohortId } = await params;
  const cohort = cohorts.find((c) => c.id === cohortId);
  const program = cohort ? programs.find((p) => p.id === cohort.programId) : undefined;
  if (!cohort || !program) return {};
  return {
    title: `Enroll — ${program.title} · ${cohort.label} | Tennis Bootcamp`,
    description: `Enroll in the ${cohort.label} cohort for ${program.title} at Tennis Bootcamp.`,
  };
}

export default async function EnrollPage({ params }: PageProps) {
  const { cohortId } = await params;

  const cohort = cohorts.find((c) => c.id === cohortId);
  if (!cohort || cohort.status === "full") notFound();

  const seatsRemaining = await getSeatsRemaining(cohort.id, cohort.capacityMax);
  if (seatsRemaining !== null && seatsRemaining <= 0) notFound();

  const program = programs.find((p) => p.id === cohort.programId);
  const location = locations.find((l) => l.id === cohort.locationId);

  return (
    <EnrollWizard
      cohort={cohort}
      program={program}
      location={location}
      seatsRemaining={seatsRemaining}
    />
  );
}
