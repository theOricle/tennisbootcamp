"use client";

import { useId, useState } from "react";
import { trackEvent } from "@/lib/analytics";
import { useBotCheck } from "@/lib/useBotCheck";
import { buttonClass } from "@/components/ui/Button";

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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
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
      <p className="text-white/90">
        Thanks. We&apos;ll email you when {programTitle} opens.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full min-w-0 max-w-md flex-col gap-3">
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
          onChange={(e) => setEmail(e.target.value)}
          className="min-h-[44px] w-full min-w-0 flex-1 rounded-xl border border-white/10 bg-[#061427] px-4 py-3 text-base text-white placeholder:text-white/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B4E655]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#061427] md:text-sm"
          disabled={status === "submitting"}
        />
        <button
          type="submit"
          disabled={status === "submitting"}
          className={`${buttonClass("secondary")} shrink-0 whitespace-nowrap`}
        >
          {status === "submitting" ? "Saving…" : "Notify me"}
        </button>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </form>
  );
}
