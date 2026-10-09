"use client";

import { useEffect, useId, useRef, useState } from "react";
import { trackEvent } from "@/lib/analytics";
import { useBotCheck } from "@/lib/useBotCheck";
import { emailError } from "@/lib/formValidation";
import { buttonClass } from "@/components/ui/Button";
import { FieldError, LiveStatus, fieldA11y } from "@/components/ui/Input";
import { FOCUS_RING } from "@/components/ui/focus";

type Props = { programSlug: string; programTitle: string };

/**
 * "Tell me when this program opens". Reflows to 320px with no sideways
 * scroll, a labelled field and a per-form honeypot id (audit H8); the
 * button is the outline secondary, never the lime primary (audit M12).
 */
export function ProgramInterestForm({ programSlug, programTitle }: Props) {
  const bot = useBotCheck();
  const inputId = useId();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "ok" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  // The thank-you line replaces the form; focus moves onto it (audit M19).
  const doneRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (status === "ok") doneRef.current?.focus();
  }, [status]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "submitting") return;
    const err = emailError(email);
    setProblem(err);
    if (err) {
      document.getElementById(inputId)?.focus();
      return;
    }
    setStatus("submitting");
    setError(null);
    try {
      const res = await fetch("/api/program-interest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, program: programSlug, ...bot.payload() }),
      });
      if (!res.ok) throw new Error("Failed to save");
      trackEvent("program_interest_signup", { program: programSlug });
      setStatus("ok");
    } catch {
      setStatus("error");
      setError("Couldn't save — try again or email info@tennisbootcamp.ca.");
    }
  }

  if (status === "ok") {
    return (
      <p ref={doneRef} role="status" tabIndex={-1} className="text-white/90 focus:outline-none">
        Thanks. We&apos;ll email you when {programTitle} opens.
      </p>
    );
  }

  return (
    <form noValidate onSubmit={onSubmit} className="flex w-full min-w-0 max-w-md flex-col gap-3">
      {bot.field}
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row">
        <label htmlFor={inputId} className="sr-only">
          Email address
        </label>
        <input
          id={inputId}
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          placeholder="you@email.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (problem && !emailError(e.target.value)) setProblem(null);
          }}
          className={`min-h-[44px] w-full min-w-0 flex-1 rounded-xl border border-white/35 bg-[#061427] px-4 py-3 text-base text-white placeholder:text-white/45 aria-[invalid=true]:border-red-400 ${FOCUS_RING} md:text-sm`}
          readOnly={status === "submitting"}
          {...fieldA11y(inputId, { error: problem })}
        />
        <button
          type="submit"
          aria-disabled={status === "submitting" || undefined}
          className={`${buttonClass("secondary")} shrink-0 whitespace-nowrap`}
        >
          {status === "submitting" ? "Saving…" : "Notify me"}
        </button>
      </div>
      <FieldError fieldId={inputId} message={problem} />
      <LiveStatus message={status === "submitting" ? "Saving your email…" : ""} />
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
    </form>
  );
}
