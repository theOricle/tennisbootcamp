"use client";

import { useState } from "react";

export function EmailCapture() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source: "homepage_email_capture" }),
      });
      setStatus(res.ok ? "done" : "error");
    } catch {
      setStatus("error");
    }
  }

  return (
    <section className="mx-auto max-w-6xl px-6 py-10">
      <div className="rounded-xl border border-white/10 bg-white/5 p-6 md:flex md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">
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
            className="mt-4 flex w-full flex-col gap-2 md:mt-0 md:w-auto"
            onSubmit={handleSubmit}
          >
            <div className="flex gap-3">
              <label htmlFor="email-capture" className="sr-only">
                Email address
              </label>
              <input
                id="email-capture"
                className="w-full rounded-xl border border-white/10 bg-[#061427] px-4 py-3 text-base text-white placeholder:text-white/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B4E655]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#061427] md:w-72 md:text-sm"
                type="email"
                required
                placeholder="Your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={status === "loading"}
              />
              <button
                className="rounded-xl bg-[#B4E655] px-5 py-3 text-sm font-semibold text-[#061427] hover:brightness-110 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B4E655]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#061427]"
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
