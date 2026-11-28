import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { programs } from "@/content/programs";
import { formatDateRange, formatDaysTimes } from "@/lib/cohorts";
import { getCohortById } from "@/lib/cohortsDb";
import { locationForCohort } from "@/content/locations";
import { createClient } from "@/lib/supabase/server";
import { cardPaymentIsTest } from "@/lib/payments";
import { enrollConfirmation } from "@/lib/paymentConfirmation";
import { EtransferDetailsFromStep, EtransferFirstStep } from "@/components/enroll/EtransferDetails";
import { TextLink } from "@/components/ui/TextLink";
import { EnrollCompleteEvent } from "./EnrollCompleteEvent";

type PageProps = {
  params: Promise<{ cohortId: string }>;
  searchParams: Promise<{ invite?: string | string[]; etransfer?: string | string[]; paid?: string | string[] }>;
};

// The tab says what the page says: a test payment's reads "Test payment".
export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const sp = await searchParams;
  const meta = enrollConfirmation({
    viaEtransfer: sp.etransfer === "1",
    testPayment: sp.etransfer !== "1" && cardPaymentIsTest(),
    signedIn: false,
    firstName: null,
    allPaid: sp.paid === "1",
  });
  return {
    title: meta.title,
    description: meta.description,
    robots: { index: false, follow: false },
  };
}

export default async function EnrollConfirmedPage({ params, searchParams }: PageProps) {
  const { cohortId } = await params;
  const sp = await searchParams;
  const viaInvite = sp.invite === "1";
  // E-transfer cohorts land here after "I've sent it" — the spot is held,
  // not paid, until the coach confirms receipt in the admin.
  const viaEtransfer = sp.etransfer === "1";
  // Every player on that step was already paid (backlog #102): a flag and
  // nothing else, set by the step from the route's answer. It changes this
  // page's words only; no payment, seat or record reads it.
  const allPaid = viaEtransfer && sp.paid === "1";
  const cohort = await getCohortById(cohortId);
  if (!cohort) notFound();

  const program = programs.find((p) => p.id === cohort.programId);
  const location = locationForCohort(cohort);

  // Auth check — used for CTA and personalised greeting.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Try to retrieve participant name from most recent enrollment.
  let participantName: string | null = null;
  if (user) {
    const { data: enrollment } = await supabase
      .from("enrollments")
      .select("participant_name")
      .eq("user_id", user.id)
      .eq("cohort_id", cohortId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    participantName = enrollment?.participant_name ?? null;
  }

  const firstName = participantName?.trim().split(/\s+/)[0] ?? null;

  // The page's words (src/lib/paymentConfirmation.ts). A card payment on a
  // test rail (backlog #84: mock mode, or a Stripe key that is not live)
  // holds no spot and sends no email, so its page says it was a test and
  // promises nothing that follows a live payment. Decided from the same env
  // the payment itself used.
  const copy = enrollConfirmation({
    viaEtransfer,
    testPayment: !viaEtransfer && cardPaymentIsTest(),
    signedIn: Boolean(user),
    firstName,
    allPaid,
  });

  return (
    <main className="min-h-screen bg-[#061427] text-white">
      <EnrollCompleteEvent
        cohortId={cohortId}
        program={program?.title ?? cohort.programId}
        viaInvite={viaInvite}
        cohortConfirmed={cohort.dbStatus === "confirmed"}
        paymentMethod={viaEtransfer ? "etransfer" : "card"}
      />
      <div className="mx-auto max-w-2xl px-6 py-16">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.4)] md:p-8">

          {/* Status badge */}
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#B4E655]/20">
              <svg
                className="h-4 w-4 text-[#B4E655]"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                viewBox="0 0 24 24"
              >
                {copy.icon === "check" ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 11v6M12 7h.01" />
                )}
              </svg>
            </div>
            <span className="text-sm font-semibold text-[#B4E655]">{copy.badge}</span>
          </div>

          {/* Greeting */}
          <h1 className="mt-4 text-2xl font-semibold md:text-3xl">{copy.heading}</h1>
          <p className="mt-2 text-sm leading-relaxed text-white/65">{copy.lead}</p>

          {/* After an e-transfer, signed out (backlog #101): the amount, the
              address and the message as the step showed them, read once from
              this tab and never from the URL. With none there (another
              device, a later visit) the inbox sentence shows instead, so the
              page never says both. */}
          {copy.inboxLine && <EtransferDetailsFromStep cohortId={cohortId} inboxLine={copy.inboxLine} />}

          {/* Enrollment detail box */}
          <div className="mt-6 divide-y divide-white/10 rounded-xl border border-white/10 bg-white/5 text-sm">
            {/* Where the cohort trains (owner, 2026-10-12): the club and its area,
                first, as on the enroll summary. */}
            {location && (
              <div className="flex justify-between gap-4 px-4 py-3">
                <span className="text-white/60">Location</span>
                <span className="max-w-[60%] text-right">
                  <span className="block font-medium text-white">{location.name}</span>
                  <span className="block text-white/70">{location.area}</span>
                </span>
              </div>
            )}
            <div className="flex justify-between gap-4 px-4 py-3">
              <span className="text-white/60">Program</span>
              <span className="text-right font-medium text-white">{program?.title ?? cohort.programId}</span>
            </div>
            <div className="flex justify-between gap-4 px-4 py-3">
              <span className="text-white/60">Cohort</span>
              <span className="text-right font-medium text-white">{cohort.label}</span>
            </div>
            <div className="flex justify-between gap-4 px-4 py-3">
              <span className="text-white/60">Dates</span>
              <span className="text-right font-medium text-[#B4E655]">{formatDateRange(cohort)}</span>
            </div>
            <div className="flex justify-between gap-4 px-4 py-3">
              <span className="text-white/60">Schedule</span>
              <span className="text-right font-medium text-white">{formatDaysTimes(cohort)}</span>
            </div>
            <div className="flex justify-between gap-4 px-4 py-3">
              <span className="text-white/60">Duration</span>
              <span className="text-right font-medium text-white">{cohort.weeks} weeks · {cohort.capacityMin}–{cohort.capacityMax} players</span>
            </div>
          </div>

          {/* What happens next: nothing, after a test payment */}
          {copy.nextSteps.length > 0 && (
            <div className="mt-6 rounded-xl border border-[#B4E655]/20 bg-[#B4E655]/5 px-5 py-5">
              <p className="mb-3 text-sm font-semibold text-white">What happens next</p>
              <ol className="space-y-2 text-sm text-white/70">
                {copy.nextSteps.map((text, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#B4E655]/20 text-xs font-bold text-[#B4E655]">
                      {i + 1}
                    </span>
                    <span>
                      {i === 0 && copy.firstStepOnPage ? (
                        <EtransferFirstStep cohortId={cohortId} inbox={text} onPage={copy.firstStepOnPage} />
                      ) : (
                        text
                      )}
                    </span>
                  </li>
                ))}
              </ol>
              {/* Signed out, the ways back in (backlog #101), right under
                  the steps that explain the account email: text links,
                  never a main button. */}
              {copy.links.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-x-6 border-t border-white/10 pt-2">
                  {copy.links.map((link) => (
                    <TextLink key={link.href} href={link.href} tone="lime">
                      {link.label}
                    </TextLink>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Signed in: the dashboard is the main button, as before. */}
          <div className="mt-8 flex flex-wrap gap-3">
            {user && (
              <Link
                href="/dashboard"
                className="rounded-full bg-[#B4E655] px-6 py-2.5 text-sm font-semibold text-[#061427] transition hover:brightness-110"
              >
                Go to Dashboard →
              </Link>
            )}
            <Link
              href={`/programs/${program?.slug ?? cohort.programId}`}
              className="rounded-full bg-white/10 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-white/15"
            >
              View Program
            </Link>
          </div>

        </div>
      </div>
    </main>
  );
}
