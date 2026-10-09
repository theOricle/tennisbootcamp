import type { Metadata } from "next";

export const metadata: Metadata = {
  // An object, not a string (audit M10): a string title here would drop the
  // site template for /assessment/book and /assessment/booked, so all three
  // read alike. The default names this page; the template keeps the suffix.
  title: {
    default: "The Player Assessment",
    template: "%s | Tennis Bootcamp",
  },
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
