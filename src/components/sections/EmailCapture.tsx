"use client";

import { useState } from "react";

export function EmailCapture() {
  const [submitted, setSubmitted] = useState(false);

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

        {submitted ? (
          <p className="mt-4 text-sm font-semibold text-[#B4E655] md:mt-0 md:shrink-0">
            Got it — we&apos;ll be in touch.
          </p>
        ) : (
          <form
            className="mt-4 flex w-full gap-3 md:mt-0 md:w-auto"
            onSubmit={(e) => {
              e.preventDefault();
              setSubmitted(true);
            }}
          >
            <input
              className="w-full rounded-xl border border-white/10 bg-[#061427] px-4 py-3 text-sm text-white placeholder:text-white/40 md:w-72"
              type="email"
              required
              placeholder="Your email"
            />
            <button
              className="rounded-xl bg-[#B4E655] px-5 py-3 text-sm font-semibold text-[#061427] hover:brightness-110"
              type="submit"
            >
              Notify me
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
