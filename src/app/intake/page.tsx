"use client";

import React, { useMemo, useState } from "react";

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
  area?: "north-york" | "downtown" | "markham-richmondhill" | "flexible";
  notes?: string;
  name?: string;
  phone?: string;
  email?: string;
  newsletter?: boolean;
};

function cn(...classes: Array<string | false | undefined | null>) {
  return classes.filter(Boolean).join(" ");
}

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
            "mt-1 h-5 w-5 rounded-full border",
            selected ? "border-emerald-300 bg-emerald-300/30" : "border-white/20"
          )}
        />
      </div>
    </button>
  );
}

export default function IntakePage() {
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
        subtitle: "There’s no right or wrong answer — this helps us place you correctly.",
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
        title: "Programs you’re interested in",
        subtitle: "You can select more than one.",
        type: "multi",
        options: [
          {
            id: "group",
            label: "Group Lessons",
            desc: "Structured group training with high reps and live feedback.",
          },
          {
            id: "bootcamp",
            label: "Bootcamps",
            desc: "High-intensity sessions focused on technique + patterns.",
          },
          {
            id: "private",
            label: "Private Lessons",
            desc: "Personalized coaching to sharpen strengths and fix leaks.",
          },
          {
            id: "elite",
            label: "Elite High Performance",
            desc: "For high performers, semi-pros, and aspiring pros. We identify point-leaks and build match-winning patterns.",
          },
          {
            id: "junior",
            label: "Junior Programs",
            desc: "Youth development with structured fundamentals and confidence building.",
          },
          {
            id: "camp",
            label: "Summer Camps",
            desc: "Fun but structured blocks for juniors: fundamentals + match play.",
          },
        ],
      },
      {
        id: "area",
        title: "Which area works best for you?",
        subtitle: "This helps us form groups that make sense logistically.",
        type: "single",
        options: [
          { id: "north-york", label: "North York" },
          { id: "downtown", label: "Downtown Toronto" },
          { id: "markham-richmondhill", label: "Markham / Richmond Hill" },
          { id: "flexible", label: "Flexible" },
        ],
      },
      {
        id: "notes",
        title: "Anything we should know about your goals or schedule?",
        subtitle: "Optional — keep it short if you add anything.",
        type: "text",
        placeholder: "e.g., aiming for a league season, returning from injury, best times (optional)…",
      },
      {
        id: "contact",
        title: "Where can we reach you?",
        subtitle: "We’ll only reach out when we’re forming groups that fit your level and goals.",
        type: "contact",
      },
    ],
    []
  );

  const [stepIndex, setStepIndex] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState<FormState>({
    goals: [],
    programs: [],
    newsletter: false,
  });

  const current = steps[stepIndex];
  const progress = Math.round(((stepIndex + 1) / steps.length) * 100);

  function isSelected(optionId: string) {
    if (current.id === "who") return form.who === optionId;
    if (current.id === "level") return form.level === optionId;
    if (current.id === "area") return form.area === optionId;
    if (current.id === "goals") return form.goals.includes(optionId);
    if (current.id === "programs") return form.programs.includes(optionId);
    return false;
  }

  function toggleOption(optionId: string) {
    if (current.type === "single") {
      if (current.id === "who") setForm((s) => ({ ...s, who: optionId as FormState["who"] }));
      if (current.id === "level") setForm((s) => ({ ...s, level: optionId as FormState["level"] }));
      if (current.id === "area") setForm((s) => ({ ...s, area: optionId as FormState["area"] }));
    } else if (current.type === "multi") {
      if (current.id === "goals") {
        setForm((s) => ({
          ...s,
          goals: s.goals.includes(optionId) ? s.goals.filter((x) => x !== optionId) : [...s.goals, optionId],
        }));
      }
      if (current.id === "programs") {
        setForm((s) => ({
          ...s,
          programs: s.programs.includes(optionId)
            ? s.programs.filter((x) => x !== optionId)
            : [...s.programs, optionId],
        }));
      }
    }
  }

  function canContinue() {
    switch (current.id) {
      case "who":
        return !!form.who;
      case "level":
        return !!form.level;
      case "goals":
        return form.goals.length > 0;
      case "programs":
        return form.programs.length > 0;
      case "area":
        return !!form.area;
      case "notes":
        return true; // optional
      case "contact":
        return !!form.name?.trim() && !!form.email?.trim() && !!form.phone?.trim();
      default:
        return true;
    }
  }

  async function onSubmit() {
    // For now: no backend required. We still simulate submit safely.
    setSubmitting(true);
    try {
      // You can later POST this to /api/intake.
      // await fetch("/api/intake", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });

      console.log("INTAKE_SUBMISSION", form);
      setSubmitted(true);
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

  if (submitted) {
    return (
      <main className="min-h-screen bg-[#061427] text-white">
        <div className="mx-auto max-w-2xl px-6 py-16">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-8 shadow-[0_24px_80px_rgba(0,0,0,0.4)]">
            <div className="text-sm text-emerald-200/90">Priority Placement</div>
            <h1 className="mt-2 text-3xl font-semibold">You’re on the Priority Placement List</h1>
            <p className="mt-3 text-white/70">
              We place athletes who complete the intake first as programs begin forming. We’ll reach out when we have a
              matched option that fits your level and goals.
            </p>

            <label className="mt-6 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
              <input
                type="checkbox"
                checked={!!form.newsletter}
                onChange={(e) => setForm((s) => ({ ...s, newsletter: e.target.checked }))}
                className="h-4 w-4"
              />
              <span className="text-sm text-white/75">Also keep me updated by email (newsletter)</span>
            </label>

            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href="/"
                className="rounded-full bg-white/10 px-5 py-2 text-sm font-semibold text-white hover:bg-white/15"
              >
                Back to Home
              </a>
              <a
                href="/programs"
                className="rounded-full bg-emerald-300 px-5 py-2 text-sm font-semibold text-[#061427] hover:bg-emerald-200"
              >
                View Programs
              </a>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#061427] text-white">
      <div className="mx-auto max-w-2xl px-6 py-10 md:py-14">
        {/* Top bar */}
        <div className="mb-8 flex items-center justify-between">
          <a href="/" className="text-sm text-white/60 hover:text-white">
            ← Home
          </a>
          <div className="text-sm text-white/60">
            Step {stepIndex + 1} of {steps.length}
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 md:p-8 shadow-[0_24px_80px_rgba(0,0,0,0.4)]">
          <div className="mb-4">
            <div className="text-xs font-semibold tracking-wide text-emerald-200/90">
              PRIORITY PLACEMENT INTAKE
            </div>
            <h1 className="mt-2 text-2xl font-semibold md:text-3xl">{current.title}</h1>
            {current.subtitle ? <p className="mt-2 text-sm text-white/70">{current.subtitle}</p> : null}
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
                className="w-full rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-emerald-300/30"
              />
            ) : null}

            {current.type === "contact" ? (
              <div className="grid gap-3">
                <div className="grid gap-2">
                  <label className="text-sm text-white/70">Full name</label>
                  <input
                    value={form.name ?? ""}
                    onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-300/30"
                    placeholder="Your name"
                  />
                </div>

                <div className="grid gap-2">
                  <label className="text-sm text-white/70">Phone number</label>
                  <input
                    value={form.phone ?? ""}
                    onChange={(e) => setForm((s) => ({ ...s, phone: e.target.value }))}
                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-300/30"
                    placeholder="(647) 555-1234"
                  />
                </div>

                <div className="grid gap-2">
                  <label className="text-sm text-white/70">Email</label>
                  <input
                    value={form.email ?? ""}
                    onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))}
                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-300/30"
                    placeholder="you@email.com"
                  />
                </div>

                <label className="mt-1 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                  <input
                    type="checkbox"
                    checked={!!form.newsletter}
                    onChange={(e) => setForm((s) => ({ ...s, newsletter: e.target.checked }))}
                    className="h-4 w-4"
                  />
                  <span className="text-sm text-white/75">Also keep me updated by email (newsletter)</span>
                </label>
              </div>
            ) : null}
          </div>

          {/* Footer */}
          <div className="mt-8 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={back}
              disabled={stepIndex === 0 || submitting}
              className={cn(
                "rounded-full px-5 py-2 text-sm font-semibold",
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
                "rounded-full px-6 py-2 text-sm font-semibold",
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
