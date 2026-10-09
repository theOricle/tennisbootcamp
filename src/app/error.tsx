"use client";

import Link from "next/link";
import { buttonClass } from "@/components/ui/Button";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center px-6 bg-[#061427] text-white">
      <div className="max-w-md w-full text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-[#B4E655]">
          Error
        </p>
        <h1 className="mt-3 text-2xl font-semibold text-white">
          Something went wrong
        </h1>
        {/* The human fallback, as on every failure (audit L12, voice.md). */}
        <p className="mt-3 text-sm text-white/70">
          We hit an unexpected error. Try again, or head back home. If it keeps
          happening, email{" "}
          <a
            href="mailto:info@tennisbootcamp.ca"
            className="text-[#B4E655] underline-offset-2 hover:underline"
          >
            info@tennisbootcamp.ca
          </a>
          .
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button type="button" onClick={reset} className={buttonClass("primary")}>
            Try again
          </button>
          <Link href="/" className={buttonClass("secondary")}>
            Back to Home
          </Link>
        </div>
      </div>
    </main>
  );
}
