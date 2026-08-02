import Link from "next/link";
import { membershipNote } from "@/lib/membership";
import { TierLadder } from "@/components/tiers";

const LEAVE_WITH = [
  "Your level, assigned by the coach",
  "A short written read on your game",
  "A group recommendation matched to your level and your weekly availability",
];

const FAQ: { q: string; a: string }[] = [
  {
    q: "What should I bring?",
    a: "A racquet if you have one, water, and court shoes. That's it — come ready to move.",
  },
  {
    q: "What if it rains?",
    a: "If weather cancels your slot, you rebook free — no charge lost.",
  },
  {
    q: "Can my kid do this?",
    a: "Yes. For players under 18, a parent or guardian books and attends the assessment.",
  },
  {
    q: "How do groups form after?",
    a: "The coach assigns your level on court. We then group players at the same level who share free times, and invite you to a private group that fits both — no guesswork, no mismatched sessions.",
  },
];

function CheckIcon() {
  return (
    <svg
      className="mt-0.5 h-5 w-5 shrink-0 text-[#B4E655]"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0l-3.5-3.5a1 1 0 1 1 1.4-1.4l2.8 2.79 6.8-6.79a1 1 0 0 1 1.4 0Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export default function AssessmentLandingPage() {
  return (
    <main className="min-h-screen bg-[#061427] text-white">
      <div className="mx-auto max-w-3xl px-6 py-16 sm:py-24">
        {/* Hero */}
        <section>
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[#B4E655]">
            The Player Assessment
          </span>
          <h1 className="mt-4 text-3xl font-semibold leading-tight text-white sm:text-4xl md:text-5xl">
            Every player starts with 20 minutes on court.
          </h1>
          <p className="mt-6 text-base leading-relaxed text-white/70 sm:text-lg">
            No group here is a lucky draw. Before you join a program, you hit
            with the coach — a short rally, groundstrokes under a little
            pressure, a few serves. You leave with a real level, a written note
            on your game, and a group recommendation that matches both your level
            and your schedule.
          </p>
        </section>

        {/* Price block */}
        <section className="mt-10 rounded-2xl border border-[#B4E655]/25 bg-[#B4E655]/[0.06] p-6 sm:p-8">
          <p className="text-2xl font-bold text-white sm:text-3xl">
            $20 <span className="text-[#B4E655]">— comes off the price when you enroll</span>
          </p>
          <p className="mt-2 text-sm text-white/60 sm:text-base">
            The assessment costs $20. Join a program or lesson afterward and
            that $20 is applied to it — so the assessment ends up free.
          </p>
          <Link
            href="/assessment/book"
            className="mt-6 inline-flex min-h-[44px] items-center justify-center rounded-full bg-[#B4E655] px-8 py-3 text-base font-semibold text-[#061427] transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B4E655]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#061427]"
          >
            Book my 20-minute assessment
          </Link>
        </section>

        {/* What you leave with */}
        <section className="mt-14">
          <h2 className="text-xl font-semibold text-white sm:text-2xl">
            What you leave with
          </h2>
          <ul className="mt-6 space-y-4">
            {LEAVE_WITH.map((item) => (
              <li key={item} className="flex items-start gap-3">
                <CheckIcon />
                <span className="text-base text-white/80">{item}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* The ladder */}
        <section className="mt-14">
          <h2 className="text-xl font-semibold text-white sm:text-2xl">
            The ladder you&apos;re climbing
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-white/65 sm:text-base">
            Your level places you on a seven-rung ladder. Every player starts
            somewhere real and climbs from there — the assessment tells you which
            rung you&apos;re on.
          </p>
          <div className="mt-6">
            <TierLadder />
          </div>
        </section>

        {/* FAQ */}
        <section className="mt-14">
          <h2 className="text-xl font-semibold text-white sm:text-2xl">
            Good to know
          </h2>
          <dl className="mt-6 divide-y divide-white/10">
            {FAQ.map(({ q, a }) => (
              <div key={q} className="py-5">
                <dt className="text-base font-semibold text-white">{q}</dt>
                <dd className="mt-2 text-sm leading-relaxed text-white/65">{a}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-6 text-sm leading-relaxed text-white/45">
            {membershipNote()}
          </p>
        </section>

        {/* Closing CTA */}
        <section className="mt-14 border-t border-white/10 pt-10 text-center">
          <p className="text-lg font-medium text-white">
            Twenty minutes decides the next season of your game.
          </p>
          <Link
            href="/assessment/book"
            className="mt-6 inline-flex min-h-[44px] items-center justify-center rounded-full bg-[#B4E655] px-8 py-3 text-base font-semibold text-[#061427] transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B4E655]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#061427]"
          >
            Book my 20-minute assessment
          </Link>
        </section>
      </div>
    </main>
  );
}
