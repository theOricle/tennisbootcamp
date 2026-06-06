import type { Metadata } from "next";
import { EmailCapture } from "@/components/sections/EmailCapture";

export const metadata: Metadata = {
  title: "Video Lessons",
  description:
    "On-demand video lessons from Tennis Bootcamp coaches. Build technique between sessions from anywhere.",
};

const PLACEHOLDER_LESSONS = [
  { title: "Serve mechanics", detail: "Technique · ~15 min" },
  { title: "Cross-court forehand", detail: "Drill · ~12 min" },
  { title: "First-step footwork", detail: "Movement · ~18 min" },
];

export default function VideoLessonsPage() {
  return (
    <main>
      <div className="tb-gradient">
        <div className="mx-auto max-w-6xl px-6 py-14">
          <h1 className="text-3xl font-semibold text-white">Video Lessons</h1>
          <p className="mt-3 max-w-2xl text-white/70">
            A structured video library built for athletes already in our cohorts
            — drills, technique breakdowns, and on-court patterns to reinforce
            what you&apos;re working on between sessions. A public preview
            library is coming later this season.
          </p>
        </div>
      </div>

      {/* Placeholder lesson-card silhouettes */}
      <section className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {PLACEHOLDER_LESSONS.map(({ title, detail }) => (
            <div
              key={title}
              className="relative rounded-2xl border border-white/10 bg-white/5 p-6 opacity-60 select-none"
              aria-hidden="true"
            >
              <span className="absolute right-4 top-4 rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-semibold text-white/50">
                Coming soon
              </span>
              {/* fake video thumbnail */}
              <div className="mb-4 flex h-28 items-center justify-center rounded-xl bg-white/5">
                <svg
                  className="h-8 w-8 text-white/20"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M8 5.14v14l11-7-11-7Z" />
                </svg>
              </div>
              <p className="font-semibold text-white/60">{title}</p>
              <p className="mt-1 text-sm text-white/30">{detail}</p>
            </div>
          ))}
        </div>

        <p className="mt-8 text-sm text-white/40">
          Full library unlocks with cohort enrollment. A free preview selection
          will be available to everyone later this season — drop your email
          below to be first.
        </p>
      </section>

      <EmailCapture />
    </main>
  );
}
