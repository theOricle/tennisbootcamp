"use client";

import React, { useEffect, useMemo, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { recommendPrograms, type Recommendation } from "@/lib/recommend";
import { trackEvent, trackAssessmentCtaClick } from "@/lib/analytics";
import { tentativeLevelLabel } from "@/lib/level";
import {
  availabilityToLegacySlots,
  type Availability,
} from "@/lib/availability";
import { AvailabilityGrid } from "@/components/ui/AvailabilityGrid";

// ─── Types ────────────────────────────────────────────────────────────────────

type StepType = "single" | "multi" | "contact" | "availability";

type Option = {
  id: string;
  label: string;
  desc?: string;
};

type Step = {
  id: string;
  title: string;
  subtitle?: string;
  type: StepType;
  options?: Option[];
};

type FormState = {
  who?: "adult" | "youth";
  level?: "new" | "rally" | "competitive" | "elite";
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

// ─── Utilities ────────────────────────────────────────────────────────────────

function cn(...classes: Array<string | false | undefined | null>) {
  return classes.filter(Boolean).join(" ");
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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

function OptionCard({
  label,
  desc,
  selected,
  onClick,
  multi = false,
}: {
  label: string;
  desc?: string;
  selected: boolean;
  onClick: () => void;
  multi?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded-2xl border p-4 text-left transition",
        "bg-white/5 hover:bg-white/10",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B4E655]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#061427]",
        selected ? "border-[#B4E655]/60 ring-1 ring-[#B4E655]/30" : "border-white/10"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-base font-semibold text-white">{label}</div>
          {desc ? <div className="mt-1 text-sm text-white/65">{desc}</div> : null}
        </div>
        <div
          className={cn(
            "mt-1 h-5 w-5 shrink-0 border",
            multi ? "rounded-sm" : "rounded-full",
            selected ? "border-[#B4E655] bg-[#B4E655]/30" : "border-white/20"
          )}
        />
      </div>
    </button>
  );
}

// ─── Tentative-match result screen (funnel flip) ──────────────────────────────

function TentativeMatchScreen({
  recommendations,
  form,
  newsletter,
  onNewsletterChange,
}: {
  recommendations: Recommendation[];
  form: FormState;
  newsletter: boolean;
  onNewsletterChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const top = recommendations[0];
  const levelLabel = tentativeLevelLabel(form.level);

  // Demoted direct-enroll target: the top program's first open cohort if one
  // exists (keeps PR #33 direct-enroll alive), otherwise the program page.
  const openCohort = top?.cohorts.find((c) => c.status === "open");
  const directEnrollHref = openCohort
    ? `/enroll/${openCohort.id}`
    : top
    ? `/programs/${top.program.slug}`
    : "/programs";

  function bookAssessment() {
    try {
      const selfLevel =
        form.level && ["new", "rally", "competitive"].includes(form.level)
          ? form.level
          : undefined;
      sessionStorage.setItem(
        "assessmentPrefill",
        JSON.stringify({
          name: form.name,
          email: form.email,
          phone: form.phone,
          selfLevel,
          availability: form.availability,
        })
      );
    } catch {
      // sessionStorage unavailable — booking form just starts empty.
    }
    trackAssessmentCtaClick("intake-result");
    router.push("/assessment/book");
  }

  return (
    <main className="min-h-screen bg-[#061427] text-white">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.4)] md:p-8">
          <span className="text-xs font-semibold uppercase tracking-wide text-[#B4E655]/80">
            Your tentative match
          </span>
          <h1 className="mt-2 text-2xl font-semibold md:text-3xl">
            You profile like a Level {levelLabel} player
          </h1>

          {top && (
            <div className="mt-5 rounded-2xl border border-[#B4E655]/30 bg-[#B4E655]/5 p-5">
              <span className="text-xs text-white/40">{top.program.type}</span>
              <h2 className="mt-1 text-lg font-semibold text-white">{top.program.title}</h2>
              <p className="mt-1 text-sm italic text-white/65">&ldquo;{top.reason}&rdquo;</p>
            </div>
          )}

          <p className="mt-5 text-sm leading-relaxed text-white/70">
            Based on your answers, {top ? top.program.title : "this program"} looks like your fit.
            Every player here is placed by a 20-minute on-court assessment with the coach, so the
            group you train with matches your level.
          </p>

          {/* Assessment pitch + primary CTA */}
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-sm font-semibold text-white">
              Book your 20-minute assessment
            </p>
            <p className="mt-1 text-sm text-white/60">
              The assessment is $20 — enroll in a program afterward and that $20 comes off the
              price. You leave with a real level, a written read on your game, and a group
              matched to your level and schedule.
            </p>
            <button
              type="button"
              onClick={bookAssessment}
              className="mt-4 inline-flex min-h-[48px] w-full items-center justify-center rounded-full bg-[#B4E655] px-8 py-3 text-base font-semibold text-[#061427] transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B4E655]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#061427]"
            >
              Book my 20-minute assessment
            </button>
            <Link
              href={directEnrollHref}
              className="mt-3 block text-center text-sm text-white/50 underline-offset-2 transition hover:text-white/80 hover:underline"
            >
              Know what you want? Enroll directly →
            </Link>
          </div>

          {/* Newsletter opt-in */}
          <label className="mt-6 flex cursor-pointer items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
            <input
              type="checkbox"
              checked={newsletter}
              onChange={(e) => onNewsletterChange(e.target.checked)}
              className="h-4 w-4"
            />
            <span className="text-sm text-white/75">Also email me when new programs and dates open</span>
          </label>

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
        </div>
      </div>
    </main>
  );
}

function FallbackScreen({
  form,
  newsletter,
  onNewsletterChange,
}: {
  form: FormState;
  newsletter: boolean;
  onNewsletterChange: (v: boolean) => void;
}) {
  const router = useRouter();

  function bookAssessment() {
    try {
      const selfLevel =
        form.level && ["new", "rally", "competitive"].includes(form.level)
          ? form.level
          : undefined;
      sessionStorage.setItem(
        "assessmentPrefill",
        JSON.stringify({
          name: form.name,
          email: form.email,
          phone: form.phone,
          selfLevel,
          availability: form.availability,
        })
      );
    } catch {
      // sessionStorage unavailable — booking form just starts empty.
    }
    trackAssessmentCtaClick("intake-result");
    router.push("/assessment/book");
  }

  return (
    <main className="min-h-screen bg-[#061427] text-white">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-8 shadow-[0_24px_80px_rgba(0,0,0,0.4)]">
          <span className="text-xs font-semibold uppercase tracking-wide text-[#B4E655]/80">
            Your next step
          </span>
          <h1 className="mt-2 text-3xl font-semibold">Every player starts on court</h1>
          <p className="mt-3 text-white/70">
            The best next step is a 20-minute on-court assessment with the coach. You leave with a
            real level, a written read on your game, and a group matched to your level and
            schedule. It&apos;s $20 — and if you enroll in a program afterward, that $20 comes
            off the price.
          </p>
          <button
            type="button"
            onClick={bookAssessment}
            className="mt-6 inline-flex min-h-[48px] w-full items-center justify-center rounded-full bg-[#B4E655] px-8 py-3 text-base font-semibold text-[#061427] transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B4E655]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#061427]"
          >
            Book my 20-minute assessment
          </button>
          <label className="mt-6 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
            <input
              type="checkbox"
              checked={newsletter}
              onChange={(e) => onNewsletterChange(e.target.checked)}
              className="h-4 w-4"
            />
            <span className="text-sm text-white/75">Also email me when new programs and dates open</span>
          </label>
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
    bootcamps: "bootcamp",
    "kids-summer-camp": "camp",
    "group-lessons": "group",
  };
  const preselectedProgram =
    programParam && slugToOptionId[programParam] ? [slugToOptionId[programParam]] : [];

  const steps: Step[] = useMemo(
    () => [
      {
        id: "who",
        title: "Who is training?",
        subtitle:
          "A few quick questions so we can place you correctly. It takes about two minutes.",
        type: "single",
        options: [
          { id: "adult", label: "Myself — Adult (18+)" },
          { id: "kid-7-13", label: "My child — Junior (7–13)", desc: "Youth development track" },
          { id: "kid-14-17", label: "My child — Teen (14–17)", desc: "Competitive foundations" },
          { id: "elite-14plus", label: "Elite track (14+)", desc: "High-performance program for tournament-level players" },
        ],
      },
      {
        id: "level",
        title: "Where's your game right now?",
        subtitle: "There's no right or wrong answer — this helps us place you correctly.",
        type: "single",
        options: [
          { id: "new", label: "New or returning to tennis" },
          { id: "rally", label: "Comfortable rallying" },
          { id: "competitive", label: "Advanced / competitive" },
          { id: "elite", label: "Elite (High Performance Track)" },
        ],
      },
      {
        id: "location",
        title: "Which Toronto location works best?",
        subtitle: "Select all that apply.",
        type: "multi",
        options: [
          { id: "balliol", label: "Balliol St — Toronto Tennis City", desc: "185 Balliol St, Toronto" },
          { id: "king", label: "King St E — Tennis Lessons Toronto", desc: "510 King St E, Toronto" },
          { id: "flexible", label: "Either / Flexible", desc: "I can train at either location." },
        ],
      },
      {
        id: "availability",
        title: "When can you train?",
        subtitle:
          "Tap every slot that works. Groups form around shared availability — the more times you give us, the more groups fit you.",
        type: "availability",
      },
      {
        id: "contact",
        title: "Where can we reach you?",
        subtitle:
          "We'll only reach out when we're forming groups that fit your level and goals.",
        type: "contact",
      },
    ],
    []
  );

  const [stepIndex, setStepIndex] = useState(0);
  // Pending auto-advance on single-choice steps: the tap flashes the selected
  // state for a beat, then the step advances on its own — no Next button.
  const advanceTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    };
  }, []);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);

  // Tracks the raw option ID for the "who" step so we can show the correct
  // selection highlight even though two options map to who="adult".
  const [whoOptionId, setWhoOptionId] = useState<string | null>(null);

  const [form, setForm] = useState<FormState>({
    goals: [],
    programs: preselectedProgram,
    preferredLocationIds: [],
    availability: { days: {}, v: 1 },
    newsletter: false,
  });

  const current = steps[stepIndex];
  const progress = Math.round(((stepIndex + 1) / steps.length) * 100);

  useEffect(() => {
    trackEvent("intake_start");
  }, []);

  function isSelected(optionId: string): boolean {
    switch (current.id) {
      case "who":
        return whoOptionId === optionId;
      case "level":
        return form.level === optionId;
      case "location":
        if (optionId === "flexible")
          return (
            form.preferredLocationIds.includes("balliol") &&
            form.preferredLocationIds.includes("king")
          );
        return form.preferredLocationIds.includes(optionId);
      default:
        return false;
    }
  }

  // Single-choice steps are never the last step (contact is), so advancing
  // never needs to submit. Re-tapping (including after Back) re-schedules.
  const AUTO_ADVANCE_MS = 180;
  function scheduleAutoAdvance() {
    if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    advanceTimerRef.current = setTimeout(() => {
      advanceTimerRef.current = null;
      setStepIndex((i) => Math.min(i + 1, steps.length - 1));
    }, AUTO_ADVANCE_MS);
  }

  function toggleOption(optionId: string) {
    if (current.type === "single") {
      if (current.id === "who") {
        const mappedWho: FormState["who"] =
          optionId === "kid-7-13" || optionId === "kid-14-17" ? "youth" : "adult";
        setWhoOptionId(optionId);
        setForm((s) => ({ ...s, who: mappedWho }));
      } else if (current.id === "level") {
        setForm((s) => ({ ...s, level: optionId as FormState["level"] }));
      }
      scheduleAutoAdvance();
    } else if (current.type === "multi") {
      if (current.id === "location") {
        if (optionId === "flexible") {
          const bothSelected =
            form.preferredLocationIds.includes("balliol") &&
            form.preferredLocationIds.includes("king");
          setForm((s) => ({
            ...s,
            preferredLocationIds: bothSelected ? [] : ["balliol", "king"],
          }));
        } else {
          setForm((s) => ({
            ...s,
            preferredLocationIds: s.preferredLocationIds.includes(optionId)
              ? s.preferredLocationIds.filter((x) => x !== optionId)
              : [...s.preferredLocationIds, optionId],
          }));
        }
      }
    }
  }

  function canContinue(): boolean {
    switch (current.id) {
      case "who":
        return whoOptionId !== null;
      case "level":
        return !!form.level;
      case "location":
        return form.preferredLocationIds.length > 0;
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
      // The rule-based recommender still consumes the legacy slot list; derive
      // it from the grid so the engine is unchanged.
      const recs = recommendPrograms({
        ...form,
        availability: availabilityToLegacySlots(form.availability),
      });
      const topProgram = recs[0]?.program.slug ?? "";

      const res = await fetch("/api/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          // goals, programs, notes not collected in wizard — send empty defaults
          goals: form.goals,
          programs: form.programs,
          notes: form.notes ?? "",
          // backward-compat: col 9 (area) populated with preferredLocationIds
          area: form.preferredLocationIds.join(", "),
          // col 16: structured availability grid; API serializes to compact string
          availability: form.availability,
          recommendedProgram: topProgram,
        }),
      });
      if (!res.ok) throw new Error("Submission failed");
      trackEvent("intake_complete");
      setRecommendations(recs);
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
    // A pending auto-advance must not fire after the user steps back.
    if (advanceTimerRef.current) {
      clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
    setStepIndex((i) => Math.max(i - 1, 0));
  }

  // ── Submitted ─────────────────────────────────────────────────────────────
  if (submitted) {
    if (recommendations.length === 0) {
      return (
        <FallbackScreen
          form={form}
          newsletter={!!form.newsletter}
          onNewsletterChange={(v) => setForm((s) => ({ ...s, newsletter: v }))}
        />
      );
    }
    return (
      <TentativeMatchScreen
        recommendations={recommendations}
        form={form}
        newsletter={!!form.newsletter}
        onNewsletterChange={(v) => setForm((s) => ({ ...s, newsletter: v }))}
      />
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
            {current.type === "single" || current.type === "multi" ? (
              <div className="grid gap-3">
                {current.options?.map((o) => (
                  <OptionCard
                    key={o.id}
                    label={o.label}
                    desc={o.desc}
                    selected={isSelected(o.id)}
                    onClick={() => toggleOption(o.id)}
                    multi={current.type === "multi"}
                  />
                ))}
              </div>
            ) : null}

            {current.type === "availability" ? (
              <AvailabilityGrid
                value={form.availability}
                onChange={(next) => setForm((s) => ({ ...s, availability: next }))}
              />
            ) : null}

            {current.type === "contact" ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (canContinue() && !submitting) next();
                }}
                className="grid gap-3"
              >
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
          {/* Single-choice steps auto-advance on tap — Back is their only control. */}
          {(stepIndex > 0 || current.type !== "single") && (
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
              {current.type !== "single" && (
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
              )}
            </div>
          )}
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
