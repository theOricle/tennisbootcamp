import Link from "next/link";
import { buttonClass } from "@/components/ui/Button";
import { getBookedSlotSummary } from "@/lib/assessments";
import { BookedTracker } from "./BookedTracker";

type PageProps = { searchParams: Promise<{ booking?: string | string[] }> };

export default async function AssessmentBookedPage({ searchParams }: PageProps) {
  const { booking } = await searchParams;
  const bookingId = typeof booking === "string" ? booking : null;
  // The slot itself, so the page confirms what was booked (audit L13).
  const slot = await getBookedSlotSummary(bookingId);

  return (
    <main className="min-h-screen bg-[#061427] text-white">
      <BookedTracker bookingId={bookingId} />
      <div className="mx-auto flex max-w-lg flex-col items-center px-6 py-20 text-center sm:py-28">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#B4E655]/15">
          <svg
            className="h-8 w-8 text-[#B4E655]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
        <h1 className="mt-6 text-2xl font-semibold text-white sm:text-3xl">
          You&apos;re booked.
        </h1>
        {slot && (
          <p className="mt-4 rounded-full border border-[#B4E655]/30 bg-[#B4E655]/10 px-4 py-2 text-sm font-semibold tabular-nums text-[#B4E655]">
            {slot.dateLabel} at {slot.timeLabel}
          </p>
        )}
        <p className="mt-4 text-base leading-relaxed text-white/70">
          Your 20-minute assessment is confirmed. We&apos;ve sent the details to
          your email — slot time, what to bring, and how to reach us if you need
          to move it.
        </p>
        <p className="mt-3 text-sm text-white/70">
          See you on the court. Bring a racquet if you have one, water, and court
          shoes.
        </p>
        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <Link href="/programs" className={buttonClass("primary")}>
            Browse Programs
          </Link>
          <Link href="/" className={buttonClass("secondary")}>
            Back home
          </Link>
        </div>
      </div>
    </main>
  );
}
