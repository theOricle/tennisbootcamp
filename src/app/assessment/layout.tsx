import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Book Your Assessment",
  // Optional, not a gate (audit M1); 155 characters at most (audit M10).
  description:
    "Want your level confirmed on court first? 20 minutes with the coach in Toronto, $20, and it comes off the price when you enroll in a program afterward.",
  openGraph: {
    title: "Book Your Assessment | Tennis Bootcamp",
    description:
      "Optional: 20 minutes on court with the coach, your level and a written note on your game. $20, and it comes off the price when you enroll in a program afterward.",
  },
  alternates: { canonical: "/assessment" },
};

export default function AssessmentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
