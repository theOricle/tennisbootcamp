import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { programs } from "@/content/programs";
import { locations } from "@/content/locations";
import { getCohortById } from "@/lib/cohortsDb";
import { getInviteByToken } from "@/lib/cohortActions";
import { getSeatsRemaining } from "@/lib/seatCount";
import { levelWithinRange } from "@/lib/tiers";
import { createClient } from "@/lib/supabase/server";
import { EnrollWizard } from "./EnrollWizard";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ cohortId: string }>;
  searchParams: Promise<{ invite?: string | string[] }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { cohortId } = await params;
  const cohort = await getCohortById(cohortId);
  const program = cohort ? programs.find((p) => p.id === cohort.programId) : undefined;
  if (!cohort || !program) return { robots: { index: false, follow: false } };
  return {
    title: `Enroll — ${program.title} · ${cohort.label}`,
    description: `Enroll in the ${cohort.label} cohort for ${program.title} at Tennis Bootcamp.`,
    robots: { index: false, follow: false },
  };
}

// Friendly gate for private cohorts: expired/invalid token, or no access path.
function InviteGate({ expired }: { expired: boolean }) {
  return (
    <main className="min-h-screen bg-[#061427] text-white">
      <div className="mx-auto max-w-xl px-6 py-20">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#B4E655]">
            Private group
          </p>
          {expired ? (
            <>
              <h1 className="mt-3 text-2xl font-semibold">
                This invitation has expired
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-white/65">
                Spots are held for a set window so the whole group can confirm.
                If you still want in, reply to your invitation email — if a spot
                is open, we&apos;ll get you back in.
              </p>
            </>
          ) : (
            <>
              <h1 className="mt-3 text-2xl font-semibold">
                This group is invite-only
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-white/65">
                Enrollment here opens by email invitation, matched to your
                coach-assigned level. Book a 20-minute assessment and we&apos;ll
                build your group around your level and your schedule.
              </p>
            </>
          )}
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {expired ? (
              <a
                href="mailto:info@tennisbootcamp.ca"
                className="inline-flex min-h-[44px] items-center rounded-full bg-[#B4E655] px-6 text-sm font-semibold text-[#061427] transition hover:brightness-110"
              >
                Email us →
              </a>
            ) : (
              <Link
                href="/assessment/book"
                className="inline-flex min-h-[44px] items-center rounded-full bg-[#B4E655] px-6 text-sm font-semibold text-[#061427] transition hover:brightness-110"
              >
                Book Your Assessment →
              </Link>
            )}
            <Link
              href="/programs"
              className="inline-flex min-h-[44px] items-center rounded-full bg-white/10 px-6 text-sm font-semibold text-white transition hover:bg-white/15"
            >
              Browse Programs
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}

export default async function EnrollPage({ params, searchParams }: PageProps) {
  const { cohortId } = await params;
  const sp = await searchParams;
  const tokenParam =
    typeof sp.invite === "string" && sp.invite.trim() ? sp.invite.trim() : null;

  const cohort = await getCohortById(cohortId);
  if (!cohort || cohort.status === "full") notFound();

  // Private cohorts admit a valid unexpired invite token, or — when the cohort
  // is tier-gated — a signed-in player whose coach-assigned level falls inside
  // [level_min, level_max]. Everyone else gets the friendly gate.
  let inviteToken: string | null = null;
  let inviteEmail: string | null = null;
  if (cohort.visibility === "private") {
    let allowed = false;
    if (tokenParam) {
      const lookup = await getInviteByToken(cohort.id, tokenParam);
      if (lookup.state === "valid") {
        allowed = true;
        inviteToken = tokenParam;
        inviteEmail = lookup.invite.email;
      }
    }
    if (!allowed && (cohort.levelMin != null || cohort.levelMax != null)) {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("level")
          .eq("id", user.id)
          .maybeSingle();
        if (levelWithinRange(profile?.level, cohort.levelMin, cohort.levelMax)) {
          allowed = true;
        }
      }
    }
    if (!allowed) return <InviteGate expired={Boolean(tokenParam)} />;
  }

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
      inviteToken={inviteToken}
      initialEmail={inviteEmail}
    />
  );
}
