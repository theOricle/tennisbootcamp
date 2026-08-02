import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Book Your Assessment",
  description:
    "Every player starts with 20 minutes on court. Book a $20 player assessment — if you enroll in a program afterward, the $20 comes off the price — and get a real level, a written read on your game, and a group matched to your level and schedule.",
  openGraph: {
    title: "Book Your Assessment | Tennis Bootcamp",
    description:
      "20 minutes on court with the coach. A real level, a written note, and a group that matches your level and your schedule. $20 — it comes off the price when you enroll in a program.",
  },
};

export default function AssessmentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
