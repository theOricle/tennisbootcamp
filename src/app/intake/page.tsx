"use client";

import React, { useEffect, useMemo, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { recommendPrograms, type Recommendation } from "@/lib/recommend";
import { locations } from "@/content/locations";
import { formatDateRange, formatDaysTimes, formatCohortPrice } from "@/lib/cohorts";
import type { Cohort } from "@/types/cohort";
import { trackEvent } from "@/lib/analytics";

// ─── Types ────────────────────────────────────────────────────────────────────

type StepType = "single" | "multi" | "contact";

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
  availability: string[];
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

// ─── Recommendation success screen ────────────────────────────────────────────

function CohortRow({ cohort }: { cohort: Cohort }) {
  const loc = locations.find((l) => l.id === cohort.locationId);
  const isOpen = cohort.status === "open";

  const inner = (
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-xs font-semibold text-[#B4E655]">{loc?.name ?? cohort.locationId}</p>
        <p className="mt-0.5 text-sm text-white/80">{formatDateRange(cohort)}</p>
        <p className="mt-0.5 text-xs text-white/55">{formatDaysTimes(cohort)}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-semibold text-white">{formatCohortPrice(cohort)}</p>
        {isOpen ? (
          <span className="mt-1 inline-block rounded-full bg-[#B4E655] px-3 py-1 text-[11px] font-semibold text-[#061427]">
            Enroll →
          </span>
        ) : (
          <span className="mt-1 inline-block rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium text-white/50">
            Coming soon
          </span>
        )}
      </div>
    </div>
  );

  if (isOpen) {
    return (
      <Link
        href={`/enroll/${cohort.id}`}
        className="block rounded-lg border border-[#B4E655]/20 bg-white/5 px-4 py-3 transition hover:border-[#B4E655]/40 hover:bg-[#B4E655]/5"
      >
        {inner}
      </Link>
    );
  }

  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3">
      {inner}
    </div>
  );
}

function RecommendationCard({
  rec,
  rank,
}: {
  rec: Recommendation;
  rank: number;
}) {
  const isTop = rank === 0;
  const displayCohorts = rec.cohorts.slice(0, 2);
  const hasOpenCohort = rec.cohorts.some((c) => c.status === "open");

  return (
    <div
      className={cn(
        "rounded-2xl border p-5",
        isTop
          ? "border-[#B4E655]/30 bg-[#B4E655]/5"
          : "border-white/10 bg-white/5"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {isTop && (
              <span className="rounded-full bg-[#B4E655]/20 px-2 py-0.5 text-[10px] font-semibold text-[#B4E655]">
                Top Match
              </span>
            )}
            <span className="text-xs text-white/40">{rec.program.type}</span>
            {rec.program.ageGroup && (
              <span className="text-xs text-white/40">· {rec.program.ageGroup}</span>
            )}
          </div>
          <h3 className="mt-1 text-lg font-semibold text-white">{rec.program.title}</h3>
          <p className="mt-1 text-sm italic text-white/65">&ldquo;{rec.reason}&rdquo;</p>
        </div>
      </div>

      {displayCohorts.length > 0 && (
        <div className="mt-4 space-y-2">
          {displayCohorts.map((c) => (
            <CohortRow key={c.id} cohort={c} />
          ))}
          {rec.cohorts.length > 2 && (
            <p className="text-xs text-white/40">
              +{rec.cohorts.length - 2} more cohort{rec.cohorts.length - 2 > 1 ? "s" : ""} on the program page
            </p>
          )}
        </div>
      )}

      <div className="mt-4">
        <Link
          href={`/programs/${rec.program.slug}`}
          className={cn(
            "block w-full rounded-xl py-2.5 text-center text-sm font-semibold transition",
            hasOpenCohort
              ? "border border-white/15 text-white/55 hover:border-white/30 hover:text-white/80"
              : isTop
              ? "bg-[#B4E655] text-[#061427] hover:brightness-110"
              : "border border-[#B4E655]/40 text-[#B4E655] hover:bg-[#B4E655]/10"
          )}
        >
          {hasOpenCohort ? "See full program details →" : isTop ? "View Program →" : "View Program"}
        </Link>
      </div>
    </div>
  );
}

function RecommendationScreen({
  recommendations,
  newsletter,
  onNewsletterChange,
}: {
  recommendations: Recommendation[];
  newsletter: boolean;
  onNewsletterChange: (v: boolean) => void;
}) {
  return (
    <main className="min-h-screen bg-[#061427] text-white">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.4)] md:p-8">
          {/* Reassurance header */}
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#B4E655]/20">
              <svg
                className="h-4 w-4 text-[#B4E655]"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-[#B4E655]">Priority Placement</span>
          </div>
          <h1 className="mt-2 text-2xl font-semibold md:text-3xl">
            You&apos;re on the Priority Placement List
          </h1>
          <p className="mt-2 text-sm text-white/60">
            We place athletes who complete the intake first as programs form. We&apos;ll reach
            out when we have a spot that fits — and based on your profile, here&apos;s what
            we&apos;d recommend:
          </p>

          {/* Ranked recommendation cards */}
          <div className="mt-6 space-y-4">
            {recommendations.map((rec, i) => (
              <RecommendationCard key={rec.program.id} rec={rec} rank={i} />
            ))}
          </div>

          {/* Newsletter opt-in */}
          <label className="mt-6 flex cursor-pointer items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
            <input
              type="checkbox"
              checked={newsletter}
              onChange={(e) => onNewsletterChange(e.target.checked)}
              className="h-4 w-4"
            />
            <span className="text-sm text-white/75">Also keep me updated by email (newsletter)</span>
          </label>

          {/* Navigation */}
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/"
              className="rounded-full bg-white/10 px-5 py-2 text-sm font-semibold text-white hover:bg-white/15"
            >
              Back to Home
            </Link>
            <Link
              href="/programs"
              className="rounded-full bg-[#B4E655] px-5 py-2 text-sm font-semibold text-[#061427] hover:brightness-110 transition"
            >
              Browse All Programs
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}

function FallbackScreen({
  newsletter,
  onNewsletterChange,
}: {
  newsletter: boolean;
  onNewsletterChange: (v: boolean) => void;
}) {
  return (
    <main className="min-h-screen bg-[#061427] text-white">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-8 shadow-[0_24px_80px_rgba(0,0,0,0.4)]">
          <div className="text-sm font-semibold text-[#B4E655]">Priority Placement</div>
          <h1 className="mt-2 text-3xl font-semibold">You&apos;re on the Priority Placement List</h1>
          <p className="mt-3 text-white/70">
            We place athletes who complete the intake first as programs begin forming. We&apos;ll
            reach out when we have a matched option that fits your level and goals.
          </p>
          <label className="mt-6 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
            <input
              type="checkbox"
              checked={newsletter}
              onChange={(e) => onNewsletterChange(e.target.checked)}
              className="h-4 w-4"
            />
            <span className="text-sm text-white/75">Also keep me updated by email (newsletter)</span>
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
              className="rounded-full bg-[#B4E655] px-5 py-2 text-sm font-semibold text-[#061427] hover:brightness-110 transition"
            >
              View Programs
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
          "This short intake helps us place you correctly. Athletes who complete it receive priority placement as programs open.",
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
        title: "Where are you in your tennis journey?",
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
        subtitle: "Select all that apply — helps us match you to the right cohort times.",
        type: "multi",
        options: [
          { id: "weekday-evening", label: "Weekday evenings (after 5 pm)" },
          { id: "weekday-daytime", label: "Weekday daytime" },
          { id: "weekend-morning", label: "Weekend mornings" },
          { id: "weekend-afternoon", label: "Weekend afternoons" },
        ],
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
    availability: [],
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
      case "availability":
        return form.availability.includes(optionId);
      default:
        return false;
    }
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
      } else if (current.id === "availability") {
        setForm((s) => ({
          ...s,
          availability: s.availability.includes(optionId)
            ? s.availability.filter((x) => x !== optionId)
            : [...s.availability, optionId],
        }));
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
      const recs = recommendPrograms(form);
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
    setStepIndex((i) => Math.max(i - 1, 0));
  }

  // ── Submitted ─────────────────────────────────────────────────────────────
  if (submitted) {
    if (recommendations.length === 0) {
      return (
        <FallbackScreen
          newsletter={!!form.newsletter}
          onNewsletterChange={(v) => setForm((s) => ({ ...s, newsletter: v }))}
        />
      );
    }
    return (
      <RecommendationScreen
        recommendations={recommendations}
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
              PRIORITY PLACEMENT INTAKE
            </div>
            <h1 className="mt-2 text-2xl font-semibold md:text-3xl">{current.title}</h1>
            {current.subtitle ? (
              <p className="mt-2 text-sm text-white/70">{current.subtitle}</p>
            ) : null}
          </div>

          <div className="mb-6">
            <ProgressBar value={progress} />
            <div className="mt-2 text-xs text-white/50">
              Priority placements are given to athletes who complete this intake.
            </div>
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

            {current.type === "contact" ? (
              <div className="grid gap-3">
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
                    Also keep me updated by email (newsletter)
                  </span>
                </label>
              </div>
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
                  "rounded-full px-5 py-3 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B4E655]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#061427]",
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
                "ml-auto inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B4E655]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#061427]",
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

        <p className="mt-6 text-center text-xs text-white/45">
          Welcoming at any level — built for athletes who want consistent, structured improvement.
        </p>
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
