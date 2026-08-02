import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Book Your Assessment",
  description:
    "Answer a few quick questions to see your tentative match, then book a 20-minute on-court assessment — $20, which comes off the price when you enroll in a program — so the coach can place you at the right level.",
  openGraph: {
    title: "Book Your Assessment | Tennis Bootcamp",
    description:
      "A few quick questions, then a 20-minute on-court assessment with the coach. $20 — it comes off the price when you enroll.",
  },
  robots: { index: false, follow: false },
};

export default function IntakeLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
