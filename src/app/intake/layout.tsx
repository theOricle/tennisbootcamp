import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "The 2-minute quiz",
  description:
    "A few questions about your game and your schedule. Sina places you in a group from your answers. The 20-minute on-court assessment is optional: it's $20, and it comes off the price when you enroll in a program.",
  openGraph: {
    title: "The 2-minute quiz | Tennis Bootcamp",
    description:
      "A few questions about your game and your schedule, then Sina places you in a group. The 20-minute assessment is optional.",
  },
  robots: { index: false, follow: false },
};

export default function IntakeLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
