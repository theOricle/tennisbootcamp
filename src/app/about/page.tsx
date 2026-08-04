import type { Metadata } from "next";
import { Coaches } from "@/components/sections/Coaches";
import { coaches } from "@/content/coaches";

export const metadata: Metadata = {
  title: "About",
  description:
    "Structured tennis training in Toronto — serious at every level, from first rally to tournament play. Every player starts with a 20-minute on-court assessment; Bootcamps is the competitive tier.",
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
            that trains together for six weeks. The training is serious at every
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
              Each training block runs six weeks. You commit to the full cohort —
              not individual sessions — because progress in tennis compounds. Week
              one builds the foundation that week six builds on. Drop-in attendance
              breaks that chain.
            </p>
            <p>
              Groups are kept small on purpose. A capped court means more reps per
              player, more eyes on each ball, and real-time feedback every session —
              not every third session when the coach finally reaches your end of the
              line.
            </p>
          </div>

          <ul className="space-y-4">
            {[
              {
                label: "Two on-court sessions per week",
                detail:
                  "Realistic rally play, point-play pressure, and stroke-specific work in every session.",
              },
              {
                label: "One strength-and-conditioning session per week",
                detail:
                  "First-step quickness, change-of-direction, and tennis-specific conditioning — not general fitness.",
              },
              {
                label: "Measured at the start and end",
                detail:
                  "You finish every cohort knowing exactly what improved and what the next block should target.",
              },
              {
                label: "Small groups, real feedback",
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
                  "Recreational programs keep you comfortable. This program keeps you challenged. Each six-week block has defined objectives — at the end you move to a harder block, not the same one again.",
              },
              {
                heading: "Serious at every level",
                body:
                  "The training methods come from competitive player development, applied at every rung of the ladder — Love through Grand Slam. Everyone starts with the same $20 on-court assessment, and every group trains with structure and intent. Bootcamps is the explicitly competitive tier; the rest of the ladder builds your game seriously from wherever you start.",
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
        </div>
      </section>

      {/* ── Founder ───────────────────────────────────────────────────────── */}
      <section className="border-t border-white/10">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="border-l-2 border-[#B4E655] pl-6">
            <h2 className="text-2xl font-bold text-white">Sina Kassaian</h2>
            <p className="mt-1 text-sm text-[#B4E655]">Co-Founder &amp; Head Coach</p>
          </div>

          <div className="mt-8 max-w-3xl space-y-5 text-white/70">
            <p>
              Sina Kassaian built Tennis Bootcamp on a single conviction: that the gap
              between recreational club tennis and real competitive performance is a
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

            {/* PLACEHOLDERS — dev only, hidden in production */}
            {process.env.NODE_ENV === "development" && (
            <div className="rounded-xl border border-[#B4E655]/20 bg-[#B4E655]/5 p-5 text-sm text-white/60">
              <p className="mb-3 font-semibold text-[#B4E655]/80">
                ✏ Owner: fill in the following before publishing
              </p>
              <ul className="space-y-2">
                <li>
                  <strong className="text-white/70">Years coaching:</strong>{" "}
                  [e.g. &ldquo;With over X years coaching competitive players…&rdquo;]
                </li>
                <li>
                  <strong className="text-white/70">Playing background:</strong>{" "}
                  [e.g. competed at X level, ranked X, played for X team]
                </li>
                <li>
                  <strong className="text-white/70">Certifications:</strong>{" "}
                  [e.g. Tennis Canada Certified Level X, PTR, USPTA, etc.]
                </li>
                <li>
                  <strong className="text-white/70">Notable achievements:</strong>{" "}
                  [e.g. coached X players to X ranking, X tournament wins, X
                  university scholarship placements]
                </li>
              </ul>
            </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Coaching team (existing component) ───────────────────────────── */}
      <Coaches coaches={coaches} title="The team" />
    </main>
  );
}
