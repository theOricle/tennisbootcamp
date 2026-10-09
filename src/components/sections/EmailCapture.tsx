"use client";

import { useEffect, useId, useRef, useState } from "react";
import { trackEvent } from "@/lib/analytics";
import { useBotCheck } from "@/lib/useBotCheck";
import { emailError } from "@/lib/formValidation";
import { buttonClass } from "@/components/ui/Button";
import { CARD_CLASS } from "@/components/ui/Card";
import { FieldError, LiveStatus, fieldA11y } from "@/components/ui/Input";
import { FOCUS_RING } from "@/components/ui/focus";

type EmailCaptureProps = {
  /**
   * Where the signup happened, written to the newsletter sheet's source
   * column and the analytics event (audit M12), e.g. "homepage_email_capture"
   * or "program_youth-programs_email_capture".
   */
  source: string;
};

/**
 * The newsletter signup: the tertiary CTA (brand.md), so an outline button,
 * never the lime primary, and placed after the programs (audit M12). Sets no
 * horizontal padding or max-width: the page's Container does (audit H2).
 */
export function EmailCapture({ source }: EmailCaptureProps) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [problem, setProblem] = useState<string | null>(null);
  const bot = useBotCheck();
  const inputId = useId();
  const titleId = useId();
  // The success line replaces the form, so focus moves onto it instead of
  // falling to the page (audit M19).
  const doneRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (status === "done") doneRef.current?.focus();
  }, [status]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "loading") return;
    const err = emailError(email);
    setProblem(err);
    if (err) {
      document.getElementById(inputId)?.focus();
      return;
    }
    setStatus("loading");
    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source, ...bot.payload() }),
      });
      if (res.ok) {
        trackEvent("newsletter_signup", { source });
        setStatus("done");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

  return (
    <section aria-labelledby={titleId}>
      <div className={`${CARD_CLASS} p-6 md:flex md:items-center md:justify-between md:gap-8`}>
        <div className="min-w-0">
          <h2 id={titleId} className="text-lg font-semibold tracking-tight text-white">
            Be first to know when new sessions open
          </h2>
          <p className="mt-1 text-sm text-white/70">
            We&apos;ll reach out when programs matching your level become available.
          </p>
        </div>

        {status === "done" ? (
          <p
            ref={doneRef}
            role="status"
            tabIndex={-1}
            className="mt-4 text-sm font-semibold text-[#B4E655] focus:outline-none md:mt-0 md:shrink-0"
          >
            Got it — we&apos;ll be in touch.
          </p>
        ) : (
          <form
            noValidate
            className="mt-4 flex w-full min-w-0 flex-col gap-2 md:mt-0 md:w-auto md:shrink-0"
            onSubmit={handleSubmit}
          >
            {bot.field}
            <div className="flex flex-col gap-3 sm:flex-row">
              <label htmlFor={inputId} className="sr-only">
                Email address
              </label>
              <input
                id={inputId}
                name="email"
                className={`min-h-[44px] w-full min-w-0 rounded-xl border border-white/35 bg-[#061427] px-4 py-3 text-base text-white placeholder:text-white/45 aria-[invalid=true]:border-red-400 ${FOCUS_RING} sm:w-72 md:text-sm`}
                type="email"
                autoComplete="email"
                inputMode="email"
                required
                placeholder="Your email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (problem && !emailError(e.target.value)) setProblem(null);
                }}
                readOnly={status === "loading"}
                {...fieldA11y(inputId, { error: problem })}
              />
              <button
                className={`${buttonClass("secondary")} shrink-0 whitespace-nowrap`}
                type="submit"
                aria-disabled={status === "loading" || undefined}
              >
                {status === "loading" ? "Sending…" : "Notify me"}
              </button>
            </div>
            <FieldError fieldId={inputId} message={problem} />
            <LiveStatus message={status === "loading" ? "Signing you up…" : ""} />
            {status === "error" && (
              <p role="alert" className="text-sm text-red-400">
                Something went wrong — try again or email us at info@tennisbootcamp.ca
              </p>
            )}
          </form>
        )}
      </div>
    </section>
  );
}
