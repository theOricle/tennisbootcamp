"use client";

import { useEffect, useId, useRef, useState } from "react";
import { trackEvent } from "@/lib/analytics";
import { useBotCheck } from "@/lib/useBotCheck";
import { emailError } from "@/lib/formValidation";
import { refusedLine } from "@/lib/formRefusal";
import { buttonClass } from "@/components/ui/Button";
import { CARD_CLASS } from "@/components/ui/Card";
import { FieldError, LiveStatus, fieldA11y } from "@/components/ui/Input";
import { FOCUS_RING } from "@/components/ui/focus";

type EmailCaptureProps = {
  /**
   * Where the signup happened, written to the newsletter sheet's source
   * column and the analytics event (audit M12), e.g. "homepage_email_capture"
   * or "program_youth-programs_email_capture". The footer's line names the
   * page it sits on (src/lib/newsletterSource.ts).
   */
  source: string;
  /**
   * "band": a card inside a page, where the page's own words lead to it
   * (a program with no public cohort yet, Events, Video Lessons). "line":
   * the one line at the top of the footer, on every page. A page never
   * shows both: the band carries `data-page-newsletter`, and the footer
   * hides its line on a page that has one (src/components/layout/Footer.tsx).
   */
  variant?: "band" | "line";
};

const FIELD =
  "min-h-[44px] w-full min-w-0 border border-white/35 px-4 py-3 text-base text-white " +
  `placeholder:text-white/45 aria-[invalid=true]:border-red-400 ${FOCUS_RING} md:text-sm`;

/**
 * The newsletter signup: the tertiary CTA (brand.md), so an outline button,
 * never the lime primary. Sets no horizontal padding or max-width: the
 * page's Container (or the footer's) does (audit H2). The copy promises only
 * what the form can keep: it takes an email, not a level, so it says when a
 * cohort opens and nothing about matching (QA 2026-10-10).
 */
export function EmailCapture({ source, variant = "band" }: EmailCaptureProps) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [problem, setProblem] = useState<string | null>(null);
  // A refused try (429) shows the route's own line (backlog #84).
  const [refusal, setRefusal] = useState<string | null>(null);
  const bot = useBotCheck();
  const inputId = useId();
  const titleId = useId();
  const line = variant === "line";
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
    setRefusal(null);
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
        setRefusal(await refusedLine(res));
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

  const done = (
    <p
      ref={doneRef}
      role="status"
      tabIndex={-1}
      className={`text-sm font-semibold text-[#B4E655] focus:outline-none ${line ? "" : "mt-4 md:mt-0 md:shrink-0"}`.trim()}
    >
      Got it — we&apos;ll be in touch.
    </p>
  );

  const form = (
    <form
      noValidate
      className={
        line
          ? "flex w-full min-w-0 flex-col gap-2"
          : "mt-4 flex w-full min-w-0 flex-col gap-2 md:mt-0 md:w-auto md:shrink-0"
      }
      onSubmit={handleSubmit}
    >
      {bot.field}
      {/* The footer line keeps the field and the button on one row, on a
          phone too; the band stacks them there. */}
      <div className={line ? "flex gap-2" : "flex flex-col gap-3 sm:flex-row"}>
        <label htmlFor={inputId} className="sr-only">
          Email address
        </label>
        <input
          id={inputId}
          name="email"
          className={
            line
              ? `${FIELD} flex-1 rounded-full bg-white/5 hover:border-white/50`
              : `${FIELD} rounded-xl bg-[#061427] sm:w-72`
          }
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          placeholder={line ? "Email address" : "Your email"}
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
          {refusal ?? "Something went wrong — try again or email us at info@tennisbootcamp.ca"}
        </p>
      )}
    </form>
  );

  if (line) {
    return (
      <section
        aria-labelledby={titleId}
        className="grid items-center gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,360px)] md:gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]"
      >
        <p id={titleId} className="text-[15px] text-white/90">
          Be first to know when a new cohort opens.
        </p>
        {status === "done" ? done : form}
      </section>
    );
  }

  return (
    <section aria-labelledby={titleId} data-page-newsletter>
      <div className={`${CARD_CLASS} p-6 md:flex md:items-center md:justify-between md:gap-8`}>
        <div className="min-w-0">
          <h2 id={titleId} className="text-lg font-semibold tracking-tight text-white">
            Be first to know when a new cohort opens
          </h2>
          <p className="mt-1 text-sm text-white/70">
            Leave your email and we&apos;ll tell you when one opens.
          </p>
        </div>

        {status === "done" ? done : form}
      </div>
    </section>
  );
}
