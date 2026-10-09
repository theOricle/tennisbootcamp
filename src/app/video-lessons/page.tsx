import type { Metadata } from "next";
import { EmailCapture } from "@/components/sections/EmailCapture";

// No library exists yet (audit M6, owner default D24): the page stays out of
// the nav and the sitemap, carries noindex, and says only what is true. The
// placeholder lesson cards and their invented durations are gone.
export const metadata: Metadata = {
  title: "Video Lessons",
  description:
    "Tennis Bootcamp video lessons aren't published yet. Join the email list and you'll hear when they are.",
  alternates: { canonical: "/video-lessons" },
  robots: { index: false, follow: true },
};

export default function VideoLessonsPage() {
  return (
    <main>
      <div className="tb-gradient">
        <div className="mx-auto max-w-6xl px-6 py-14">
          <h1 className="text-3xl font-semibold text-white">Video Lessons</h1>
          <p className="mt-3 max-w-2xl text-white/70">
            Video lessons aren&apos;t published yet. Join the email list below
            and you&apos;ll hear when they are.
          </p>
        </div>
      </div>

      <EmailCapture />
    </main>
  );
}
