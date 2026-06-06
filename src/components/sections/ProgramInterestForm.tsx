"use client";

import { useState } from "react";
import { trackEvent } from "@/lib/analytics";

type Props = { programSlug: string; programTitle: string };

export function ProgramInterestForm({ programSlug, programTitle }: Props) {
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
        body: JSON.stringify({ email, program: programSlug }),
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
    <form onSubmit={onSubmit} className="flex w-full max-w-md flex-col gap-3 sm:flex-row sm:flex-wrap">
      <div className="flex w-full gap-3">
        <input
          type="email"
          required
          placeholder="you@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="flex-1 rounded-xl border border-white/10 bg-[#061427] px-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-[#B4E655] focus:outline-none"
          disabled={status === "submitting"}
        />
        <button
          type="submit"
          disabled={status === "submitting"}
          className="rounded-xl bg-[#B4E655] px-5 py-3 text-sm font-semibold text-[#061427] hover:brightness-110 disabled:opacity-50"
        >
          {status === "submitting" ? "Saving…" : "Notify me"}
        </button>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </form>
  );
}
