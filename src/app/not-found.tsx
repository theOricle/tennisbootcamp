"use client";

import { Button } from "@/components/ui/Button";
import { Heading } from "@/components/ui/Heading";
import { trackQuizCtaClick } from "@/lib/analytics";
import { QUIZ_CTA_LABEL } from "@/lib/quizBar";

export default function NotFound() {
  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center bg-[#061427] px-6 text-white">
      <div className="w-full max-w-lg text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-[#B4E655]">404</p>
        <Heading as="h1" className="mt-3">
          We couldn&apos;t find that page.
        </Heading>
        <p className="mt-3 text-white/60">Maybe these links help —</p>

        {/* One primary, two outlines: the quiz is the lime CTA here too (audit M12). */}
        <nav aria-label="Helpful links" className="mt-10 flex flex-col items-stretch gap-3 sm:flex-row sm:justify-center">
          <Button
            variant="primary"
            href="/intake"
            onClick={() => trackQuizCtaClick("not-found")}
            className="whitespace-nowrap"
            data-quiz-cta
          >
            {QUIZ_CTA_LABEL}
          </Button>
          <Button variant="secondary" href="/programs">
            Programs
          </Button>
          <Button variant="secondary" href="/">
            Home
          </Button>
        </nav>
      </div>
    </main>
  );
}
