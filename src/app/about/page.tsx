import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { TierLine } from "@/components/tiers";
import { TEXT_LINK_LIME } from "@/components/ui/TextLink";
import {
  COHORT_LENGTH,
  COHORT_LENGTH_ADJ,
  COHORT_WEEKS_WORD,
  SESSION_MINUTES,
} from "@/content/programs";

export const metadata: Metadata = {
  title: "About",
  description:
    "Structured tennis training in Toronto — serious at every level, from first rally to tournament play. Sina places every player by level and schedule; High Performance is the competitive track.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <main>
      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <div className="tb-gradient">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <h1 className="max-w-3xl text-4xl font-bold leading-tight text-white">
            Serious training. Measurable progress. No filler.
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-white/70">
            Tennis Bootcamp is not a club program or a drop-in clinic. It&apos;s a
            structured, cohort-based training model — a cohort is a fixed group
            that trains together for {COHORT_LENGTH}. The training is serious at every
            level, from your first rally to tournament play, and every block is
            built to move specific, measurable parts of your game: technique,
            tactics, physical conditioning, and the mental game.
          </p>
        </div>
      </div>

      {/* ── How a cohort works ────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="border-l-2 border-[#B4E655] pl-6">
          <h2 className="text-2xl font-bold text-white">How a cohort works</h2>
        </div>

        <div className="mt-8 grid gap-8 md:grid-cols-2">
          <div className="space-y-4 text-white/70">
            <p>
              Each training block runs {COHORT_LENGTH}. You commit to the full cohort —
              not individual sessions — because progress in tennis compounds. Week
              one builds the foundation that week {COHORT_WEEKS_WORD} builds on. Drop-in attendance
              breaks that chain.
            </p>
            <p>
              Groups are kept small on purpose. A capped court means more reps per
              player, more eyes on each ball, and real-time feedback every session —
              not every third session when the coach finally reaches your end of the
              line.
            </p>
          </div>

          {/* What a cohort is, from the same constants as every program page
              and the Program Policies (audit H3): one class a week, one fixed
              group, six per court and eight at most. */}
          <ul className="space-y-4">
            {[
              {
                label: `One ${SESSION_MINUTES}-minute class a week`,
                detail:
                  "Realistic rally play, point-play pressure, and stroke-specific work in every class.",
              },
              {
                label: `The same group for all ${COHORT_LENGTH}`,
                detail: "The players you start with are the players you finish with.",
              },
              {
                label: "Six players per court, eight at most",
                detail:
                  "Courts are capped so Sina can coach every player on every ball, not just supervise.",
              },
            ].map(({ label, detail }) => (
              <li key={label} className="flex gap-4">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#B4E655]" />
                <div>
                  <p className="font-semibold text-white">{label}</p>
                  <p className="mt-0.5 text-sm text-white/60">{detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── What makes this different ─────────────────────────────────────── */}
      <section className="border-t border-white/10">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="border-l-2 border-[#B4E655] pl-6">
            <h2 className="text-2xl font-bold text-white">What makes this different</h2>
          </div>

          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {[
              {
                heading: "Not a drop-in clinic",
                body:
                  "Clinics fill seats. Cohorts build players. When the group stays consistent week over week, every drill builds on the one before it — and Sina tracks each player&apos;s trajectory, not just the session.",
              },
              {
                heading: "Not an ongoing membership class",
                body:
                  `Recreational programs keep you comfortable. This program keeps you challenged. Each ${COHORT_LENGTH_ADJ} block has defined objectives — at the end you move to a harder block, not the same one again.`,
              },
              {
                heading: "Serious at every level",
                body:
                  "The training methods come from competitive player development, applied at every rung of the ladder — Love through Grand Slam. Sina places every player by level and schedule, and every group trains with structure and intent. High Performance is the explicitly competitive track; the rest of the ladder builds your game seriously from wherever you start.",
              },
            ].map(({ heading, body }) => (
              <div
                key={heading}
                className="rounded-2xl border border-white/10 bg-white/5 p-6"
              >
                <h3 className="font-semibold text-[#B4E655]">{heading}</h3>
                <p
                  className="mt-2 text-sm text-white/70"
                  dangerouslySetInnerHTML={{ __html: body }}
                />
              </div>
            ))}
          </div>

          {/* The ladder itself, right after the card that names it (audit
              M36): vertical on phones, the seven emblems in a row from md. */}
          <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
              <p className="text-sm font-semibold text-white">The seven tiers, Love to Grand Slam</p>
              <Link href="/assessment#ladder" className={TEXT_LINK_LIME}>
                How tiers work →
              </Link>
            </div>
            <TierLine
              variant="ladder"
              orientation="responsive"
              density="compact"
              className="mt-4"
            />
          </div>
        </div>
      </section>

      {/* ── Founder ───────────────────────────────────────────────────────── */}
      <section className="border-t border-white/10">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="border-l-2 border-[#B4E655] pl-6">
            <h2 className="text-2xl font-bold text-white">Sina Kassaian</h2>
            <p className="mt-1 text-sm text-[#B4E655]">Head Coach</p>
          </div>

          <div className="mt-8 max-w-3xl space-y-5 text-white/70">
            <p>
              Sina Kassaian built Tennis Bootcamp on a single conviction: that the gap
              between recreational club tennis and competitive performance is a
              coaching and structure problem, not a talent problem. Most players who
              want to compete are training in the wrong environment — too casual, too
              unfocused, too comfortable. The bootcamp model exists to close that gap.
            </p>
            <p>
              His coaching is built around four pillars: technique, strategy,
              physical conditioning, and mental toughness. Every session
              addresses all four — in combination, the way they show up in a
              match.
            </p>
          </div>
        </div>
      </section>

      {/* ── Closing CTA: quiz first, programs second (audit H3) ─────────────── */}
      <section className="border-t border-white/10">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="rounded-2xl border border-[#B4E655]/20 bg-[#B4E655]/5 p-6 md:flex md:items-center md:justify-between md:gap-10 md:p-10">
            <div className="max-w-xl">
              <h2 className="text-2xl font-bold text-white">Not sure where you fit?</h2>
              <p className="mt-2 text-pretty text-white/70">
                Tell us each player&apos;s age, level and free time. Sina places
                them in the class that fits.
              </p>
            </div>
            <div className="mt-6 flex flex-wrap gap-3 md:mt-0 md:shrink-0">
              <Button variant="primary" href="/intake">
                Take the 2-minute quiz
              </Button>
              <Button variant="secondary" href="/programs">
                Browse Programs
              </Button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
