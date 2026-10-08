"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { recommendPrograms, type Recommendation } from "@/lib/recommend";
import { trackEvent, trackAssessmentCtaClick } from "@/lib/analytics";
import { useBotCheck } from "@/lib/useBotCheck";
import { LEAD_SOURCE_FIELD } from "@/lib/leadSource";
import { storedFirstTouch } from "@/lib/firstTouchBrowser";
import { tentativeLevelLabel, selfEstimateToLevel, type SelfLevel } from "@/lib/level";
import { ageBandToWho, type AgeBand } from "@/lib/ageBand";
import {
  availabilityToLegacySlots,
  type Availability,
} from "@/lib/availability";
import {
  AvailabilityGrid,
  AvailabilityHoursLegend,
} from "@/components/ui/AvailabilityGrid";
import {
  WhoIsThisFor,
  useHousehold,
  EMPTY_HOUSEHOLD,
  householdPeople,
  householdProfilesReady,
  householdReady,
  type HouseholdValue,
} from "@/components/participants/WhoIsThisFor";

// ─── Types ────────────────────────────────────────────────────────────────────

type StepType = "contact" | "availability" | "household";

type Step = {
  id: string;
  title: string;
  subtitle?: string;
  type: StepType;
};

type FormState = {
  /** Who the quiz is about — one row per player (backlog #11). */
  household: HouseholdValue;
  goals: string[];
  programs: string[];
  preferredLocationIds: string[];
  availability: Availability;
  notes?: string;
  name?: string;
  phone?: string;
  email?: string;
  newsletter?: boolean;
};

/**
 * One player's match. Age and level are asked per person on the household
 * step (backlog #14), so a parent registering a 9-year-old and a 15-year-old
 * gets a separate read for each.
 */
type PersonResult = {
  key: string;
  name: string;
  ageBand: AgeBand;
  /** The recommender's level, or undefined when they answered "not sure". */
  level?: SelfLevel;
  recommendations: Recommendation[];
};

// ─── Utilities ────────────────────────────────────────────────────────────────

function cn(...classes: Array<string | false | undefined | null>) {
  return classes.filter(Boolean).join(" ");
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

type Router = ReturnType<typeof useRouter>;

/**
 * Hand the booking form what the quiz already knows. The booking page takes
 * one player per slot; a household starts with the first and comes back.
 */
function goToBooking(
  router: Router,
  form: FormState,
  level: SelfLevel | undefined
) {
  try {
    const selfLevel =
      level && ["new", "rally", "competitive"].includes(level) ? level : undefined;
    sessionStorage.setItem(
      "assessmentPrefill",
      JSON.stringify({
        name: form.name,
        email: form.email,
        phone: form.phone,
        selfLevel,
        availability: form.availability,
        household: form.household,
      })
    );
  } catch {
    // sessionStorage unavailable — booking form just starts empty.
  }
  trackAssessmentCtaClick("intake-result");
  router.push("/assessment/book");
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
      <div
        className="h-full rounded-full bg-[#B4E655] transition-all"
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

// ─── Tentative-match result screens (funnel flip) ─────────────────────────────

/** The one program card, identical wherever a player's match is shown. */
function ProgramMatchCard({ rec }: { rec: Recommendation }) {
  return (
    <div className="mt-5 rounded-2xl border border-[#B4E655]/30 bg-[#B4E655]/5 p-5">
      <span className="text-xs text-white/40">{rec.program.type}</span>
      <h2 className="mt-1 text-lg font-semibold text-white">{rec.program.title}</h2>
      <p className="mt-1 text-sm italic text-white/65">&ldquo;{rec.reason}&rdquo;</p>
    </div>
  );
}

const OUTLINE_BUTTON =
  "inline-flex min-h-[48px] items-center justify-center rounded-full border border-[#B4E655]/60 px-6 py-3 text-sm font-semibold text-[#B4E655] transition hover:border-[#B4E655] hover:bg-[#B4E655]/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B4E655]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#061427]";

/**
 * The intake is already saved when any result screen renders, so every one
 * opens by saying so: nothing else is required (backlog #19).
 */
function IntakeComplete({
  name,
  household,
  signedIn,
}: {
  name?: string;
  household: boolean;
  signedIn: boolean;
}) {
  const firstName = (name ?? "").trim().split(/\s+/)[0];
  return (
    <>
      <span className="text-xs font-semibold uppercase tracking-wide text-[#B4E655]/80">
        Quiz complete
      </span>
      <h1 className="mt-2 text-2xl font-semibold md:text-3xl">
        {firstName ? `You're all set, ${firstName}.` : "You're all set."}
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-white/70">
        {household
          ? "Your answers are in and there's nothing else you need to do. Sina reviews each player's level and your schedule, then places each of them in a group and a time that fit."
          : "Your answers are in and there's nothing else you need to do. Sina reviews your level and schedule, then places you in a group and a time that fit."}
      </p>
      {/* Only a brand-new email gets the set-password link; a signed-in holder has one. */}
      {!signedIn && (
        <p className="mt-3 text-sm leading-relaxed text-white/70">
          The first time you use an email address with us, we send it a link to set a password.
        </p>
      )}
    </>
  );
}

/** The assessment, offered — never required. Same booking hand-off as before. */
function AssessmentSuggestion({
  onBook,
  household,
}: {
  onBook: () => void;
  household: boolean;
}) {
  return (
    <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
      <p className="text-sm font-semibold text-white">Optional: an on-court assessment</p>
      <p className="mt-1 text-sm leading-relaxed text-white/60">
        {household
          ? "If you'd like a player's level confirmed on court before they're placed, you can book a 20-minute assessment with the coach, one player per slot. The assessment is $20 per player, and if that player enrolls in a program afterward their $20 comes off the price."
          : "If you'd like your level confirmed on court before you're placed, you can book a 20-minute assessment with the coach. The assessment is $20, and if you enroll in a program afterward that $20 comes off the price."}
      </p>
      <button type="button" onClick={onBook} className={cn("mt-4", OUTLINE_BUTTON)}>
        Book Your Assessment
      </button>
    </div>
  );
}

/** The two demoted links, shared by every result screen. */
function ResultLinks() {
  return (
    <div className="mt-6 flex flex-wrap gap-3">
      <Link
        href="/"
        className="rounded-full bg-white/10 px-5 py-2 text-sm font-semibold text-white hover:bg-white/15"
      >
        Back to Home
      </Link>
      <Link
        href="/programs"
        className="rounded-full border border-white/15 px-5 py-2 text-sm font-semibold text-white/70 transition hover:border-white/30 hover:text-white"
      >
        Browse Programs
      </Link>
    </div>
  );
}

/** One player: confirmation, their tentative match, the optional assessment. */
function TentativeMatchScreen({
  result,
  form,
  signedIn,
}: {
  result: PersonResult;
  form: FormState;
  signedIn: boolean;
}) {
  const router = useRouter();
  const top = result.recommendations[0];
  const levelLabel = tentativeLevelLabel(result.level);

  return (
    <main className="min-h-screen bg-[#061427] text-white">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.4)] md:p-8">
          <IntakeComplete name={form.name} household={false} signedIn={signedIn} />

          {/* The match, as information */}
          <div className="mt-6 border-t border-white/10 pt-5">
            <span className="text-xs font-semibold uppercase tracking-wide text-white/45">
              Your tentative match
            </span>
            <p className="mt-1 text-base font-semibold text-white">
              You profile like a Level {levelLabel} player
            </p>
            {top && <ProgramMatchCard rec={top} />}
          </div>

          <AssessmentSuggestion
            household={false}
            onBook={() => goToBooking(router, form, result.level)}
          />

          <ResultLinks />
        </div>
      </div>
    </main>
  );
}

/** Two or more players: confirmation, one read each, the optional assessment. */
function HouseholdMatchScreen({
  results,
  form,
  signedIn,
}: {
  results: PersonResult[];
  form: FormState;
  signedIn: boolean;
}) {
  const router = useRouter();
  const first = results[0];

  return (
    <main className="min-h-screen bg-[#061427] text-white">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.4)] md:p-8">
          <IntakeComplete name={form.name} household signedIn={signedIn} />

          {/* The matches, as information */}
          <div className="mt-6 border-t border-white/10 pt-5">
            <span className="text-xs font-semibold uppercase tracking-wide text-white/45">
              Tentative matches for your {results.length} players
            </span>
            <div className="mt-2 space-y-6">
              {results.map((r) => {
                const top = r.recommendations[0];
                return (
                  <div key={r.key} className="border-t border-white/10 pt-5 first:border-t-0 first:pt-2">
                    <p className="text-base font-semibold text-white">{r.name}</p>
                    <p className="mt-0.5 text-sm text-white/60">
                      Profiles like a Level {tentativeLevelLabel(r.level)} player
                    </p>
                    {top ? (
                      <ProgramMatchCard rec={top} />
                    ) : (
                      <p className="mt-3 text-sm text-white/60">
                        Nothing lines up on paper — the coach will place them from the court.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <AssessmentSuggestion
            household
            onBook={() => goToBooking(router, form, first?.level)}
          />

          <ResultLinks />
        </div>
      </div>
    </main>
  );
}

/** No program lines up on paper: confirmation and the optional assessment. */
function FallbackScreen({
  form,
  level,
  household,
  signedIn,
}: {
  form: FormState;
  level?: SelfLevel;
  household: boolean;
  signedIn: boolean;
}) {
  const router = useRouter();

  return (
    <main className="min-h-screen bg-[#061427] text-white">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.4)] md:p-8">
          <IntakeComplete name={form.name} household={household} signedIn={signedIn} />

          <AssessmentSuggestion
            household={household}
            onBook={() => goToBooking(router, form, level)}
          />

          <ResultLinks />
        </div>
      </div>
    </main>
  );
}

// ─── Main wizard ──────────────────────────────────────────────────────────────

function IntakePageInner() {
  const searchParams = useSearchParams();
  const programParam = searchParams.get("program");

  // Keep pre-selection so ?program=bootcamps still seeds the recommendation engine
  const slugToOptionId: Record<string, string> = {
    "youth-programs": "youth",
    "high-performance": "high-performance",
    bootcamps: "bootcamp",
    "kids-summer-camp": "camp",
    "group-lessons": "group",
  };
  const preselectedProgram =
    programParam && slugToOptionId[programParam] ? [slugToOptionId[programParam]] : [];

  const steps: Step[] = useMemo(
    () => [
      {
        id: "household",
        title: "Who is this for?",
        subtitle:
          "Yourself, your child, both — add everyone you want placed. We ask each person's age and where their game is right now, and each one gets their own read.",
        type: "household",
      },
      {
        id: "availability",
        title: "When can you train?",
        subtitle:
          "One schedule for everyone you added — you can adjust it per person later. Tap every slot that works: groups form around shared availability, so the more times you give us, the more groups fit.",
        type: "availability",
      },
      {
        id: "contact",
        title: "Where can we reach you?",
        subtitle:
          "The first time you use an email address with us, we send it a link to set a password. We only reach out when we're forming groups that fit your level and schedule.",
        type: "contact",
      },
    ],
    []
  );

  const [stepIndex, setStepIndex] = useState(0);
  // Bot protection (backlog #25): honeypot + time since the quiz rendered.
  const bot = useBotCheck();
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  // One entry per player the quiz was about (backlog #14).
  const [results, setResults] = useState<PersonResult[]>([]);

  const household = useHousehold();
  const [form, setForm] = useState<FormState>({
    household: EMPTY_HOUSEHOLD,
    goals: [],
    programs: preselectedProgram,
    // No venue step (backlog #1): court details are confirmed in the booking
    // email. Kept empty so the /api/intake payload shape is unchanged.
    preferredLocationIds: [],
    availability: { days: {}, v: 1 },
    newsletter: false,
  });

  const current = steps[stepIndex];
  const progress = Math.round(((stepIndex + 1) / steps.length) * 100);

  useEffect(() => {
    trackEvent("intake_start");
  }, []);

  function canContinue(): boolean {
    switch (current.id) {
      case "household":
        // A name and a self-estimate for every player: the quiz places each
        // of them off those two answers plus their age band.
        return (
          householdReady(form.household, household.signedIn) &&
          householdProfilesReady(
            form.household,
            household.signedIn,
            household.participants
          )
        );
      case "availability":
        return true;
      case "contact": {
        const nameOk = !!form.name?.trim();
        const phoneOk = (form.phone ?? "").replace(/\D/g, "").length >= 7;
        const emailOk = !!form.email && isValidEmail(form.email);
        return nameOk && phoneOk && emailOk;
      }
      default:
        return true;
    }
  }

  async function onSubmit() {
    setSubmitting(true);
    setSubmitError(false);
    try {
      // One read per player: their own age band and self-estimate, the
      // household's shared availability and program interest (backlog #14).
      // The rule-based recommender still consumes the legacy slot list, so
      // derive it from the grid once and share it across the players.
      const slots = availabilityToLegacySlots(form.availability);
      const people = householdPeople(
        form.household,
        household.signedIn,
        household.participants
      );
      const personResults: PersonResult[] = people.map((p) => {
        const level = selfEstimateToLevel(p.selfLevel);
        return {
          key: p.key,
          name: p.name,
          ageBand: p.ageBand,
          level,
          recommendations: recommendPrograms({
            who: ageBandToWho(p.ageBand),
            ageBand: p.ageBand,
            level,
            goals: form.goals,
            programs: form.programs,
            preferredLocationIds: form.preferredLocationIds,
            availability: slots,
          }),
        };
      });
      // Sheet columns 5–6 (`who`, `level`) describe the row's player. The
      // route writes each resolved participant's own values; these are the
      // fallback for a row it could not resolve, and for a lone player they
      // are exactly what the deleted steps used to send.
      const primary = personResults[0];
      const topProgram = primary?.recommendations[0]?.program.slug ?? "";

      const res = await fetch("/api/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          who: primary ? ageBandToWho(primary.ageBand) : "",
          level: primary?.level ?? "",
          // Not a Sheet column — it keeps the recommendation email on the same
          // read as the card the player just saw.
          ageBand: primary?.ageBand ?? "",
          // goals, programs, notes not collected in wizard — send empty defaults
          goals: form.goals,
          programs: form.programs,
          notes: form.notes ?? "",
          // backward-compat: col 9 (area) populated with preferredLocationIds
          area: form.preferredLocationIds.join(", "),
          // col 16: structured availability grid; API serializes to compact string
          availability: form.availability,
          recommendedProgram: topProgram,
          // Who the quiz is about (cols 18–22, one row per player).
          participantIds: form.household.selectedIds,
          // Signed in, each chosen player's own age band and self-estimate.
          participantProfiles: form.household.profiles,
          participants: form.household.guests
            .filter((g) => g.name.trim())
            .map((g) => ({
              name: g.name.trim(),
              relationship: g.relationship,
              isMinor: g.isMinor,
              ageBand: g.ageBand,
              selfLevel: g.selfLevel || undefined,
            })),
          // Where this visitor came from (cols 23–29, backlog #26): the
          // first-touch record, or nothing for a direct visit.
          [LEAD_SOURCE_FIELD]: storedFirstTouch() ?? undefined,
          // Read and dropped by the route — never a Sheet column.
          ...bot.payload(),
        }),
      });
      if (!res.ok) throw new Error("Submission failed");
      trackEvent("intake_complete", { participants: personResults.length });
      setResults(personResults);
      setSubmitted(true);
    } catch (err) {
      console.error("Intake submission error:", err);
      setSubmitError(true);
    } finally {
      setSubmitting(false);
    }
  }

  function next() {
    if (!canContinue()) return;
    if (stepIndex === steps.length - 1) {
      void onSubmit();
      return;
    }
    setStepIndex((i) => Math.min(i + 1, steps.length - 1));
  }

  function back() {
    setStepIndex((i) => Math.max(i - 1, 0));
  }

  // ── Submitted ─────────────────────────────────────────────────────────────
  if (submitted) {
    if (!results.some((r) => r.recommendations.length > 0)) {
      return (
        <FallbackScreen
          form={form}
          level={results[0]?.level}
          household={results.length > 1}
          signedIn={household.signedIn}
        />
      );
    }
    // One player reads as a single card; a household gets a card each.
    if (results.length === 1) {
      return (
        <TentativeMatchScreen result={results[0]} form={form} signedIn={household.signedIn} />
      );
    }
    return (
      <HouseholdMatchScreen results={results} form={form} signedIn={household.signedIn} />
    );
  }

  // ── Wizard ────────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-[#061427] text-white">
      <div className="mx-auto max-w-2xl px-6 py-10 md:py-14">
        {/* Top bar */}
        <div className="mb-8 flex items-center justify-between">
          <Link href="/" className="text-sm text-white/60 hover:text-white">
            ← Home
          </Link>
          <div className="text-sm text-white/60">
            Step {stepIndex + 1} of {steps.length}
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.4)] md:p-8">
          <div className="mb-4">
            <div className="text-xs font-semibold tracking-wide text-[#B4E655]/80">
              THE 2-MINUTE QUIZ
            </div>
            <h1 className="mt-2 text-2xl font-semibold md:text-3xl">{current.title}</h1>
            {current.subtitle ? (
              <p className="mt-2 text-sm text-white/70">{current.subtitle}</p>
            ) : null}
          </div>

          <div className="mb-6">
            <ProgressBar value={progress} />
          </div>

          {/* Step content */}
          <div className="space-y-3">
            {current.type === "household" ? (
              <WhoIsThisFor
                household={household}
                value={form.household}
                onChange={(next) => setForm((s) => ({ ...s, household: next }))}
                multiple
                collectProfile
                addInline
              />
            ) : null}

            {current.type === "availability" ? (
              <>
                <AvailabilityHoursLegend />
                <AvailabilityGrid
                  value={form.availability}
                  onChange={(next) => setForm((s) => ({ ...s, availability: next }))}
                />
              </>
            ) : null}

            {current.type === "contact" ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (canContinue() && !submitting) next();
                }}
                className="grid gap-3"
              >
                {bot.field}
                <div className="grid gap-2">
                  <label htmlFor="intake-name" className="text-sm text-white/70">Full name</label>
                  <input
                    id="intake-name"
                    type="text"
                    autoComplete="name"
                    value={form.name ?? ""}
                    onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B4E655]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#061427] md:text-sm"
                    placeholder="Your name"
                  />
                </div>
                <div className="grid gap-2">
                  <label htmlFor="intake-phone" className="text-sm text-white/70">Phone number</label>
                  <input
                    id="intake-phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={form.phone ?? ""}
                    onChange={(e) => setForm((s) => ({ ...s, phone: e.target.value }))}
                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B4E655]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#061427] md:text-sm"
                    placeholder="(647) 555-1234"
                  />
                </div>
                <div className="grid gap-2">
                  <label htmlFor="intake-email" className="text-sm text-white/70">Email</label>
                  <input
                    id="intake-email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    value={form.email ?? ""}
                    onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))}
                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B4E655]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#061427] md:text-sm"
                    placeholder="you@email.com"
                  />
                  {form.email && !isValidEmail(form.email) && (
                    <p className="mt-1 text-xs text-red-400">Please enter a valid email address.</p>
                  )}
                </div>
                <label className="mt-1 flex cursor-pointer items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                  <input
                    type="checkbox"
                    checked={!!form.newsletter}
                    onChange={(e) => setForm((s) => ({ ...s, newsletter: e.target.checked }))}
                    className="h-4 w-4"
                  />
                  <span className="text-sm text-white/75">
                    Also email me when new programs and dates open
                  </span>
                </label>
                <p className="text-xs text-white/50">
                  How we handle your information:{" "}
                  <Link
                    href="/legal/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#B4E655] underline-offset-2 hover:underline"
                  >
                    Privacy Policy
                  </Link>
                </p>
                {/* Enables Enter-to-advance from any field; the visible CTA lives in the footer */}
                <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true">
                  Continue
                </button>
              </form>
            ) : null}
          </div>

          {/* Footer */}
          {submitError && (
            <p className="mt-6 text-sm text-red-400">
              Something went wrong — please try again or email us at info@tennisbootcamp.ca
            </p>
          )}
          <div className="mt-6 flex items-center justify-between gap-3">
            {stepIndex > 0 && (
              <button
                type="button"
                onClick={back}
                disabled={submitting}
                className={cn(
                  "min-h-[44px] rounded-full px-5 py-3 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B4E655]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#061427]",
                  submitting
                    ? "bg-white/5 text-white/30"
                    : "bg-white/10 text-white hover:bg-white/15"
                )}
              >
                Back
              </button>
            )}
            <button
              type="button"
              onClick={next}
              disabled={!canContinue() || submitting}
              className={cn(
                "ml-auto inline-flex min-h-[44px] items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B4E655]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#061427]",
                !canContinue() && !submitting
                  ? "bg-[#B4E655]/30 text-[#061427]/50"
                  : submitting
                  ? "cursor-wait bg-[#B4E655] text-[#061427]"
                  : "bg-[#B4E655] text-[#061427] hover:brightness-110"
              )}
            >
              {submitting && (
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              {stepIndex === steps.length - 1 ? (submitting ? "Submitting…" : "Submit") : "Next"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function IntakePage() {
  return (
    <Suspense>
      <IntakePageInner />
    </Suspense>
  );
}
