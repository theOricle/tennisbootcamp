import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/layout/Container";
import { JoinClosing } from "@/components/sections/JoinClosing";
import { Heading } from "@/components/ui/Heading";
import { TierLine } from "@/components/tiers";
import { TEXT_LINK_LIME } from "@/components/ui/TextLink";
import { CLASS_IDEA, CLASS_PARTS, trainsInWords } from "@/content/bootcamp";
import { coaches } from "@/content/coaches";
import { ABOUT_DESCRIPTION } from "@/content/site";
import { TIER_COUNT_WORD, TIER_LADDER_SPAN } from "@/lib/tiers";
import {
  CLASS_LINE,
  COHORT_LENGTH,
  COHORT_LENGTH_ADJ,
  COHORT_WEEKS_WORD,
  GROUP_MAX_PLAYERS,
  SESSION_MINUTES,
  numberInWords,
} from "@/content/programs";

export const metadata: Metadata = {
  title: "About",
  description: ABOUT_DESCRIPTION,
  alternates: { canonical: "/about" },
};

// The two parts of every class, named once in src/content/bootcamp.ts.
const [tennis, fitness] = CLASS_PARTS;

/** One sentence of the title: it never breaks inside itself where the page is wide enough to hold it. */
const TITLE_SENTENCE = "min-[360px]:whitespace-nowrap";

export default function AboutPage() {
  // The founder section is the coach card: the one place the name and title
  // show (owner, 2026-10-12). Both come from src/content/coaches.ts.
  const lead = coaches[0];
  return (
    <main>
      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <div className="tb-gradient">
        <Container className="py-16">
          {/* The lines are balanced, and from 360 wide each sentence stays
              whole (below that "Measurable progress." is wider than the
              page), so the title never ends on a word alone and never
              breaks inside a sentence. */}
          <Heading as="h1" className="max-w-3xl text-balance">
            <span className={TITLE_SENTENCE}>Serious training.</span>{" "}
            <span className={TITLE_SENTENCE}>Measurable progress.</span>{" "}
            <span className={TITLE_SENTENCE}>No filler.</span>
          </Heading>
          {/* What we run, then the cohort with its plain definition (voice.md,
              jargon budget: the About hero is where "cohort" is defined). */}
          <p className="mt-5 max-w-2xl text-lg text-white/70">
            Tennis Bootcamp is not a club program or a drop-in clinic. Every group
            is a bootcamp: {CLASS_IDEA}. You train in a cohort — a fixed group
            that trains together for {COHORT_LENGTH}. The training is serious at
            every level, from your first rally to tournament play.
          </p>
        </Container>
      </div>

      {/* ── How a cohort works ────────────────────────────────────────────── */}
      <Container as="section" className="py-16">
        <div className="border-l-2 border-[#B4E655] pl-6">
          <Heading>How a cohort works</Heading>
        </div>

        <div className="mt-8 grid gap-8 md:grid-cols-2">
          <div className="space-y-4 text-white/70">
            <p>
              Each training block runs {COHORT_LENGTH}. You commit to the full cohort —
              not individual sessions — because progress in tennis compounds. Week
              one builds the foundation that week {COHORT_WEEKS_WORD} builds on. Drop-in attendance
              breaks that chain.
            </p>
            {/* How a class runs, in the sentence the bootcamp programs open
                with, then what each part trains, from the class words. */}
            <p>
              {CLASS_LINE} {tennis.name} trains {trainsInWords(tennis)}. {fitness.name} trains{" "}
              {trainsInWords(fitness)}.
            </p>
          </div>

          {/* What a cohort is, from the same constants as every program page
              and the home page's class section (audit H3; owner, 2026-11-16):
              one class a week with both parts in it, one fixed group, and the
              public group size with its one line of why. */}
          <ul className="space-y-4">
            {[
              {
                label: `One ${SESSION_MINUTES}-minute class a week`,
                detail: `${tennis.name} and ${fitness.name.toLowerCase()} in the same class, every week.`,
              },
              {
                label: `The same group for all ${COHORT_LENGTH}`,
                detail: "The players you start with are the players you finish with.",
              },
              {
                label: `Up to ${numberInWords(GROUP_MAX_PLAYERS)} players a group`,
                detail: "More reps for each player, and feedback from your coach every session.",
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
      </Container>

      {/* ── What makes this different ─────────────────────────────────────── */}
      <section className="border-t border-white/10">
        <Container className="py-16">
          <div className="border-l-2 border-[#B4E655] pl-6">
            <Heading>What makes this different</Heading>
          </div>

          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {[
              {
                heading: "Not a drop-in clinic",
                body:
                  "Clinics fill seats. Cohorts build players. When the group stays consistent week over week, every drill builds on the one before it — and your coach tracks each player&apos;s trajectory, not just the session.",
              },
              {
                heading: "Not an ongoing membership class",
                body:
                  `Recreational programs keep you comfortable. This program keeps you challenged. Each ${COHORT_LENGTH_ADJ} block has defined objectives — at the end you move to a harder block, not the same one again.`,
              },
              {
                heading: "Serious at every level",
                body:
                  `The training methods come from competitive player development, applied at every rung of the ladder — ${TIER_LADDER_SPAN}. Every group trains at one level, and your coach confirms yours on court in week one. The High Performance Youth Bootcamp is the competitive track; every other group builds your game seriously from wherever you start.`,
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
              M36): vertical on phones, the five emblems in a row from md. */}
          <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
              <p className="text-sm font-semibold text-white">The {TIER_COUNT_WORD} tiers, {TIER_LADDER_SPAN}</p>
              <Link href="/assessment#ladder" className={TEXT_LINK_LIME}>
                How levels work →
              </Link>
            </div>
            <TierLine
              variant="ladder"
              orientation="responsive"
              density="compact"
              className="mt-4"
            />
          </div>
        </Container>
      </section>

      {/* ── Founder ───────────────────────────────────────────────────────── */}
      <section className="border-t border-white/10">
        <Container className="py-16">
          <div className="border-l-2 border-[#B4E655] pl-6">
            <Heading>{lead.name}</Heading>
            <p className="mt-1 text-sm text-[#B4E655]">{lead.role}</p>
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
        </Container>
      </section>

      {/* ── Closing CTA: the main action (owner, 2026-11-16) ─────────────────
          The lime "Join a group" and the quiz as a side line, the same
          closing as the home page and the program pages. A quiz-taker's side
          line reads their next step (owner, 2026-10-12). */}
      <div className="border-t border-white/10">
        <Container className="py-16">
          <JoinClosing source="about-closing" />
        </Container>
      </div>
    </main>
  );
}
