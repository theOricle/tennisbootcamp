"use client";

import React, { useMemo, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { recommendPrograms, type Recommendation } from "@/lib/recommend";
import { locations } from "@/content/locations";
import { formatDateRange, formatDaysTimes, formatCohortPrice } from "@/lib/cohorts";
import type { Cohort } from "@/types/cohort";

// ─── Types ────────────────────────────────────────────────────────────────────

type StepType = "single" | "multi" | "text" | "contact";

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
  placeholder?: string;
};

type FormState = {
  who?: "adult" | "youth";
  level?: "new" | "rally" | "competitive" | "elite";
  goals: string[];
  programs: string[];
  preferredLocationIds: string[]; // replaces legacy "area"
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

// ─── Sub-components ───────────────────────────────────────────────────────────

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
      <div
        className="h-full rounded-full bg-emerald-300 transition-all"
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
}: {
  label: string;
  desc?: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded-2xl border p-4 text-left transition",
        "bg-white/5 hover:bg-white/10",
        selected ? "border-emerald-300/60 ring-1 ring-emerald-300/30" : "border-white/10"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-base font-semibold text-white">{label}</div>
          {desc ? <div className="mt-1 text-sm text-white/65">{desc}</div> : null}
        </div>
        <div
          className={cn(
            "mt-1 h-5 w-5 shrink-0 rounded-full border",
            selected ? "border-emerald-300 bg-emerald-300/30" : "border-white/20"
          )}
        />
      </div>
    </button>
  );
}

// ─── Recommendation success screen ────────────────────────────────────────────

function CohortRow({ cohort }: { cohort: Cohort }) {
  const loc = locations.find((l) => l.id === cohort.locationId);
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-[#B4E655]">{loc?.name ?? cohort.locationId}</p>
          <p className="mt-0.5 text-sm text-white/80">{formatDateRange(cohort)}</p>
          <p className="mt-0.5 text-xs text-white/55">{formatDaysTimes(cohort)}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-semibold text-white">{formatCohortPrice(cohort)}</p>
          <span
            className={cn(
              "mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium",
              cohort.status === "open"
                ? "bg-[#B4E655]/15 text-[#B4E655]"
                : "bg-white/10 text-white/50"
            )}
          >
            {cohort.status === "open" ? "Spots open" : "Coming soon"}
          </span>
        </div>
      </div>
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
        {/* TODO: link to /enroll/[cohortId] in Phase 4 */}
        <Link
          href={`/programs/${rec.program.slug}`}
          className={cn(
            "block w-full rounded-xl py-2.5 text-center text-sm font-semibold transition",
            isTop
              ? "bg-[#B4E655] text-[#061427] hover:brightness-110"
              : "border border-[#B4E655]/40 text-[#B4E655] hover:bg-[#B4E655]/10"
          )}
        >
          {isTop ? "View Program →" : "View Program"}
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
              className="rounded-full bg-emerald-300 px-5 py-2 text-sm font-semibold text-[#061427] hover:bg-emerald-200"
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
          <div className="text-sm text-emerald-200/90">Priority Placement</div>
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
              className="rounded-full bg-emerald-300 px-5 py-2 text-sm font-semibold text-[#061427] hover:bg-emerald-200"
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
          { id: "adult", label: "Myself (Adult)" },
          { id: "youth", label: "My child (Youth)" },
        ],
      },
      {
        id: "level",
        title: "Where are you in your tennis journey right now?",
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
        id: "goals",
        title: "What do you want to improve?",
        subtitle: "Select all that apply.",
        type: "multi",
        options: [
          { id: "consistency", label: "Consistency (reduce errors)" },
          { id: "technique", label: "Technique (strokes, serve, footwork)" },
          { id: "tactics", label: "Tactics + strategy (patterns, decisions)" },
          { id: "match", label: "Match performance (mental, routines)" },
          { id: "competition", label: "Competition prep / tryouts" },
        ],
      },
      {
        id: "programs",
        title: "Programs you're interested in",
        subtitle: "Optional — skip if you want us to recommend.",
        type: "multi",
        options: [
          {
            id: "bootcamp",
            label: "Bootcamps",
            desc: "High-intensity sessions focused on technique, patterns, and match reps.",
          },
          {
            id: "camp",
            label: "Summer Camp",
            desc: "Full-day tennis experience for youth with fundamentals and match play.",
          },
          {
            id: "group",
            label: "Group Lessons",
            desc: "Structured group training capped at 6 — more reps, live feedback.",
          },
          {
            id: "not-sure",
            label: "Not sure — recommend for me",
            desc: "We'll match you to the best fit based on your level and goals.",
          },
        ],
      },
      {
        id: "location",
        title: "Which location works best for you?",
        subtitle: "This helps us form groups that make sense logistically.",
        type: "single",
        options: [
          {
            id: "balliol",
            label: "Toronto Tennis City",
            desc: "185 Balliol St, Toronto",
          },
          {
            id: "king",
            label: "Tennis Lessons Toronto",
            desc: "510 King St E, Toronto",
          },
          {
            id: "flexible",
            label: "Either / Flexible",
            desc: "I can train at either location.",
          },
        ],
      },
      {
        id: "availability",
        title: "When are you generally available?",
        subtitle: "Select all that apply — helps us match you to the right cohort times.",
        type: "multi",
        options: [
          { id: "weekday-evening", label: "Weekday evenings (after 5pm)" },
          { id: "weekday-daytime", label: "Weekday daytime" },
          { id: "weekend-morning", label: "Weekend mornings" },
          { id: "weekend-afternoon", label: "Weekend afternoons" },
        ],
      },
      {
        id: "notes",
        title: "Anything we should know about your goals or schedule?",
        subtitle: "Optional — keep it short if you add anything.",
        type: "text",
        placeholder:
          "e.g., aiming for a league season, returning from injury, best times (optional)…",
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

  const [form, setForm] = useState<FormState>({
    goals: [],
    programs: preselectedProgram,
    preferredLocationIds: [],
    availability: [],
    newsletter: false,
  });

  const current = steps[stepIndex];
  const progress = Math.round(((stepIndex + 1) / steps.length) * 100);

  function isSelected(optionId: string): boolean {
    switch (current.id) {
      case "who":
        return form.who === optionId;
      case "level":
        return form.level === optionId;
      case "goals":
        return form.goals.includes(optionId);
      case "programs":
        return form.programs.includes(optionId);
      case "location":
        if (optionId === "flexible") return form.preferredLocationIds.length === 2;
        return form.preferredLocationIds.length === 1 && form.preferredLocationIds.includes(optionId);
      case "availability":
        return form.availability.includes(optionId);
      default:
        return false;
    }
  }

  function toggleOption(optionId: string) {
    if (current.type === "single") {
      if (current.id === "who")
        setForm((s) => ({ ...s, who: optionId as FormState["who"] }));
      else if (current.id === "level")
        setForm((s) => ({ ...s, level: optionId as FormState["level"] }));
      else if (current.id === "location") {
        if (optionId === "flexible") {
          setForm((s) => ({ ...s, preferredLocationIds: ["balliol", "king"] }));
        } else {
          setForm((s) => ({ ...s, preferredLocationIds: [optionId] }));
        }
      }
    } else if (current.type === "multi") {
      if (current.id === "goals") {
        setForm((s) => ({
          ...s,
          goals: s.goals.includes(optionId)
            ? s.goals.filter((x) => x !== optionId)
            : [...s.goals, optionId],
        }));
      } else if (current.id === "programs") {
        setForm((s) => ({
          ...s,
          programs: s.programs.includes(optionId)
            ? s.programs.filter((x) => x !== optionId)
            : [...s.programs, optionId],
        }));
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
        return !!form.who;
      case "level":
        return !!form.level;
      case "goals":
        return form.goals.length > 0;
      case "programs":
        return true; // optional
      case "location":
        return form.preferredLocationIds.length > 0;
      case "availability":
        return true; // optional ranking signal
      case "notes":
        return true;
      case "contact":
        return !!form.name?.trim() && !!form.email?.trim() && !!form.phone?.trim();
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
          // backward-compat: col 9 (area) populated with preferredLocationIds
          area: form.preferredLocationIds.join(", "),
          recommendedProgram: topProgram,
        }),
      });
      if (!res.ok) throw new Error("Submission failed");
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
            <div className="text-xs font-semibold tracking-wide text-emerald-200/90">
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
                  />
                ))}
              </div>
            ) : null}

            {current.type === "text" ? (
              <textarea
                value={form.notes ?? ""}
                onChange={(e) => setForm((s) => ({ ...s, notes: e.target.value }))}
                placeholder={current.placeholder}
                rows={5}
                className="w-full rounded-2xl border border-white/10 bg-white/5 p-4 text-base text-white placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-emerald-300/30 md:text-sm"
              />
            ) : null}

            {current.type === "contact" ? (
              <div className="grid gap-3">
                <div className="grid gap-2">
                  <label className="text-sm text-white/70">Full name</label>
                  <input
                    value={form.name ?? ""}
                    onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white focus:outline-none focus:ring-2 focus:ring-emerald-300/30 md:text-sm"
                    placeholder="Your name"
                  />
                </div>
                <div className="grid gap-2">
                  <label className="text-sm text-white/70">Phone number</label>
                  <input
                    value={form.phone ?? ""}
                    onChange={(e) => setForm((s) => ({ ...s, phone: e.target.value }))}
                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white focus:outline-none focus:ring-2 focus:ring-emerald-300/30 md:text-sm"
                    placeholder="(647) 555-1234"
                  />
                </div>
                <div className="grid gap-2">
                  <label className="text-sm text-white/70">Email</label>
                  <input
                    value={form.email ?? ""}
                    onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))}
                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white focus:outline-none focus:ring-2 focus:ring-emerald-300/30 md:text-sm"
                    placeholder="you@email.com"
                  />
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
            <button
              type="button"
              onClick={back}
              disabled={stepIndex === 0 || submitting}
              className={cn(
                "rounded-full px-5 py-3 text-sm font-semibold",
                stepIndex === 0 || submitting
                  ? "bg-white/5 text-white/30"
                  : "bg-white/10 text-white hover:bg-white/15"
              )}
            >
              Back
            </button>
            <button
              type="button"
              onClick={next}
              disabled={!canContinue() || submitting}
              className={cn(
                "rounded-full px-6 py-3 text-sm font-semibold",
                !canContinue() || submitting
                  ? "bg-emerald-300/30 text-[#061427]/50"
                  : "bg-emerald-300 text-[#061427] hover:bg-emerald-200"
              )}
            >
              {stepIndex === steps.length - 1 ? (submitting ? "Submitting..." : "Submit") : "Next"}
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
