import type { Metadata } from "next";
import { VideoLessonsTeaser } from "@/components/sections/VideoLessonsTeaser";
import { EmailCapture } from "@/components/sections/EmailCapture";

export const metadata: Metadata = {
  title: "Video Lessons",
  description:
    "On-demand video lessons from Tennis Bootcamp coaches. Build technique between sessions from anywhere.",
};

export default function VideoLessonsPage() {
  return (
    <main>
      <div className="tb-gradient">
        <div className="mx-auto max-w-6xl px-6 py-14">
          <h1 className="text-3xl font-semibold text-white">Video Lessons</h1>
          <p className="mt-3 max-w-2xl text-white/70">
            Learn fundamentals and patterns with structured drills and clear progressions.
          </p>
        </div>
      </div>

      <EmailCapture />
      <VideoLessonsTeaser />
    </main>
  );
}
