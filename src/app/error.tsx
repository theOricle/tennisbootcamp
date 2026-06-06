"use client";

import Link from "next/link";

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
        <p className="mt-3 text-sm text-white/60">
          We hit an unexpected error. Try again, or head back home.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={reset}
            className="rounded-full bg-[#B4E655] px-6 py-2.5 text-sm font-semibold text-[#061427] hover:brightness-110"
          >
            Try again
          </button>
          <Link
            href="/"
            className="rounded-full bg-white/10 px-6 py-2.5 text-sm font-semibold text-white hover:bg-white/15"
          >
            Back to Home
          </Link>
        </div>
      </div>
    </main>
  );
}
