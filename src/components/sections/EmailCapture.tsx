"use client";

import { useId, useState } from "react";
import { trackEvent } from "@/lib/analytics";
import { useBotCheck } from "@/lib/useBotCheck";
import { buttonClass } from "@/components/ui/Button";
import { CARD_CLASS } from "@/components/ui/Card";

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
  const bot = useBotCheck();
  const inputId = useId();
  const titleId = useId();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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
          <p className="mt-4 text-sm font-semibold text-[#B4E655] md:mt-0 md:shrink-0">
            Got it — we&apos;ll be in touch.
          </p>
        ) : (
          <form
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
                className="min-h-[44px] w-full min-w-0 rounded-xl border border-white/10 bg-[#061427] px-4 py-3 text-base text-white placeholder:text-white/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B4E655]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#061427] sm:w-72 md:text-sm"
                type="email"
                autoComplete="email"
                inputMode="email"
                required
                placeholder="Your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={status === "loading"}
              />
              <button
                className={`${buttonClass("secondary")} shrink-0 whitespace-nowrap`}
                type="submit"
                disabled={status === "loading"}
              >
                {status === "loading" ? "…" : "Notify me"}
              </button>
            </div>
            {status === "error" && (
              <p className="text-xs text-red-400">
                Something went wrong — try again or email us at info@tennisbootcamp.ca
              </p>
            )}
          </form>
        )}
      </div>
    </section>
  );
}
